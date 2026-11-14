import { ObjectId, ChangeStream } from 'mongodb';
import { getDatabase } from '../db/client.js';
import { OutboxEventDocument } from './outbox.repo.js';
import { connectionManager } from './connection.manager.js';
import { logger } from '../observability/logger.js';

export type ReplayResult = OutboxEventDocument[] & {
  gap?: boolean;
  reason?: 'overflow' | 'expired';
};

export class OutboxDispatcher {
  private isRunning = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private changeStream: ChangeStream | null = null;
  private lastDispatchedId: ObjectId | null = null;
  private pollIntervalMs: number;
  private lookbackMs: number;
  private dispatchQueue: Promise<void> = Promise.resolve();
  private dispatchedIds = new Set<string>();
  private lastResumeToken: any = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private changeStreamOpening = false;

  // Commit-order safe ring buffer for gapless replay across non-monotonic ObjectIds
  private commitOrderedBuffer: OutboxEventDocument[] = [];
  private commitOrderedIndexMap = new Map<string, number>();
  private readonly MAX_COMMIT_BUFFER = 500;

  constructor(options?: { pollIntervalMs?: number; lookbackMs?: number }) {
    this.pollIntervalMs = options?.pollIntervalMs ?? 500;
    this.lookbackMs = options?.lookbackMs ?? 60_000;
  }

  private get collection() {
    return getDatabase().collection<OutboxEventDocument>('realtime_events');
  }

  private markDispatched(id: ObjectId): void {
    const hex = id.toHexString();
    this.dispatchedIds.add(hex);
    if (this.dispatchedIds.size > 20000) {
      // Prune oldest elements to maintain bounded memory
      const iterator = this.dispatchedIds.values();
      for (let i = 0; i < 5000; i++) {
        const next = iterator.next();
        if (next.done) break;
        this.dispatchedIds.delete(next.value);
      }
    }
  }

  private isDispatched(id: ObjectId): boolean {
    return this.dispatchedIds.has(id.toHexString());
  }

  private addToCommitBuffer(event: OutboxEventDocument): void {
    const hex = event._id.toHexString();
    if (this.commitOrderedIndexMap.has(hex)) return;

    this.commitOrderedBuffer.push(event);
    this.commitOrderedIndexMap.set(hex, this.commitOrderedBuffer.length - 1);

    if (this.commitOrderedBuffer.length > this.MAX_COMMIT_BUFFER) {
      const removed = this.commitOrderedBuffer.shift();
      if (removed) {
        this.commitOrderedIndexMap.delete(removed._id.toHexString());
        // Re-index remaining buffer
        for (let i = 0; i < this.commitOrderedBuffer.length; i++) {
          this.commitOrderedIndexMap.set(this.commitOrderedBuffer[i]!._id.toHexString(), i);
        }
      }
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    // Attempt change stream
    this.initChangeStream().catch((err) => {
      logger.warn({ err: err.message }, 'Change stream init failed, relying on polling fallback');
    });

    // Start polling loop
    this.pollInterval = setInterval(() => {
      this.pollAndDispatch().catch((err) => {
        logger.error({ err: err.message }, 'Outbox polling error');
      });
    }, this.pollIntervalMs);

    if (this.pollInterval.unref) {
      this.pollInterval.unref();
    }

    // Immediately run an initial poll over the recent lookback window to recover any un-dispatched events
    this.pollAndDispatch().catch(() => {});

    logger.info('OutboxDispatcher started');
  }

  private scheduleChangeStreamReconnect(): void {
    if (!this.isRunning || this.reconnectTimeout) return;
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      if (this.isRunning) {
        this.initChangeStream().catch((err) => {
          logger.warn({ err: err.message }, 'Change stream reconnect failed; poller remains active');
        });
      }
    }, 1000);
    if (this.reconnectTimeout.unref) {
      this.reconnectTimeout.unref();
    }
  }

  private async initChangeStream(): Promise<void> {
    if (this.changeStreamOpening) return;
    this.changeStreamOpening = true;
    try {
      if (this.changeStream) {
        try {
          await this.changeStream.close();
        } catch {
          // ignore
        }
        this.changeStream = null;
      }

      const options: any = { fullDocument: 'updateLookup' };
      if (this.lastResumeToken) {
        options.resumeAfter = this.lastResumeToken;
      }

      this.changeStream = this.collection.watch([{ $match: { operationType: 'insert' } }], options);

      this.changeStream.on('change', (change: any) => {
        if (change.operationType === 'insert' && change.fullDocument) {
          const doc = change.fullDocument as OutboxEventDocument;
          // Pass change._id to update resume token ONLY AFTER successful dispatch
          this.enqueueAndDispatch(doc, change._id);
        }
      });

      this.changeStream.on('error', (err) => {
        logger.warn({ err: err.message }, 'Change stream error, scheduling reconnect');
        this.scheduleChangeStreamReconnect();
      });

      this.changeStream.on('close', () => {
        if (this.isRunning) {
          this.scheduleChangeStreamReconnect();
        }
      });
    } catch (err: any) {
      logger.warn({ err: err.message }, 'Could not open change stream; polling loop active');
      this.scheduleChangeStreamReconnect();
    } finally {
      this.changeStreamOpening = false;
    }
  }

  enqueueAndDispatch(event: OutboxEventDocument, resumeToken?: any): Promise<void> {
    this.dispatchQueue = this.dispatchQueue
      .then(async () => {
        await this.handleEvent(event, resumeToken);
      })
      .catch((err) => {
        logger.error(
          { err: err?.message, eventId: event._id.toHexString() },
          'Error during serialized outbox event dispatch'
        );
      });
    return this.dispatchQueue;
  }

  async handleEvent(event: OutboxEventDocument, resumeToken?: any): Promise<void> {
    if (this.isDispatched(event._id)) {
      if (resumeToken) {
        this.lastResumeToken = resumeToken;
      }
      return; // Already processed, deduplicated
    }

    // Multi-instance sync: update connectionManager authorizations on team member lifecycle events
    if (event.scope === 'team' && event.teamId && event.payload) {
      const payloadUserId = (event.payload as Record<string, unknown>)['userId'];
      if (typeof payloadUserId === 'string' && ObjectId.isValid(payloadUserId)) {
        if (event.eventType === 'member.left') {
          connectionManager.updateClientTeam(new ObjectId(payloadUserId), event.hackathonId, null, event.teamId);
        } else if (event.eventType === 'member.joined') {
          connectionManager.updateClientTeam(new ObjectId(payloadUserId), event.hackathonId, event.teamId);
        }
      }
    }

    let attempt = 0;
    const maxAttempts = 3;
    while (attempt < maxAttempts) {
      try {
        const broadcastRes = await connectionManager.broadcastEvent(event);
        if (broadcastRes?.authError) {
          throw new Error('Database query error during team authorization');
        }
        this.markDispatched(event._id);
        this.addToCommitBuffer(event);
        this.lastDispatchedId = event._id;
        // Durable recovery boundary: update resume token ONLY AFTER successful broadcast
        if (resumeToken) {
          this.lastResumeToken = resumeToken;
        }
        return;
      } catch (err: any) {
        attempt++;
        logger.warn(
          { err: err.message, eventId: event._id.toHexString(), attempt },
          'Transient error broadcasting outbox event, retrying...'
        );
        if (attempt >= maxAttempts) {
          logger.error(
            { err: err.message, eventId: event._id.toHexString() },
            'Failed to broadcast outbox event after max retries'
          );
          throw err;
        }
        await new Promise((resolve) => setTimeout(resolve, 50 * attempt));
      }
    }
  }

  async pollAndDispatch(): Promise<number> {
    try {
      // Drain in-flight queue before polling to prevent duplicate processing
      await this.dispatchQueue;

      const since = new Date(Date.now() - this.lookbackMs);
      let lastBatchId: ObjectId | null = null;
      let totalDispatched = 0;
      const batchLimit = 100;
      const maxBatches = 10; // Page through up to 1,000 records per poll cycle

      for (let batch = 0; batch < maxBatches; batch++) {
        const filter: any = {
          createdAt: { $gte: since }
        };
        if (lastBatchId) {
          filter._id = { $gt: lastBatchId };
        }

        const events = await this.collection
          .find(filter)
          .sort({ _id: 1 })
          .limit(batchLimit)
          .toArray();

        if (events.length === 0) break;

        lastBatchId = events[events.length - 1]!._id;

        for (const event of events) {
          if (!this.isDispatched(event._id)) {
            this.enqueueAndDispatch(event);
            totalDispatched++;
          }
        }

        if (events.length < batchLimit) break;
      }

      await this.dispatchQueue;
      return totalDispatched;
    } catch (err: any) {
      logger.error({ err: err.message }, 'Error during outbox poll and dispatch');
      return 0;
    }
  }

  /**
   * Replays events for a reconnecting client with Last-Event-ID in commit order.
   * If lastEventId is present in the commit-ordered ring buffer, replays subsequent events.
   * If not present, detects gaps (TTL eviction or buffer overflow) and signals sync.gap.
   */
  async getReplayEvents(
    hackathonId: ObjectId,
    lastEventId: ObjectId,
    limit: number = 50
  ): Promise<ReplayResult> {
    const hexId = lastEventId.toHexString();

    // 1. Commit-ordered buffer replay check (Commit-order-safe replay protocol)
    if (this.commitOrderedIndexMap.has(hexId)) {
      const index = this.commitOrderedIndexMap.get(hexId)!;
      const subsequentEvents = this.commitOrderedBuffer.slice(index + 1);
      const matchingHackathonEvents = subsequentEvents.filter((e) => e.hackathonId.equals(hackathonId));

      if (matchingHackathonEvents.length > limit) {
        const res: any = [];
        res.gap = true;
        res.reason = 'overflow';
        return res as ReplayResult;
      }

      const res: any = matchingHackathonEvents;
      res.gap = false;
      return res as ReplayResult;
    }

    // 2. Check if lastEventId is older than the oldest retained event in the collection (TTL eviction)
    const oldestEvent = await this.collection.findOne(
      { hackathonId },
      { sort: { _id: 1 }, projection: { _id: 1, createdAt: 1 } }
    );

    if (oldestEvent) {
      if (lastEventId.toHexString() < oldestEvent._id.toHexString()) {
        const res: any = [];
        res.gap = true;
        res.reason = 'expired';
        return res as ReplayResult;
      }
    } else {
      const lastEventTime = lastEventId.getTimestamp().getTime();
      if (Date.now() - lastEventTime > 2 * 60 * 60 * 1000) {
        const res: any = [];
        res.gap = true;
        res.reason = 'expired';
        return res as ReplayResult;
      }
    }

    // 3. Fallback database query (cold start or before buffer fills)
    const lastDoc = await this.collection.findOne({ _id: lastEventId });
    if (!lastDoc) {
      const res: any = [];
      res.gap = true;
      res.reason = 'expired';
      return res as ReplayResult;
    }

    // If commit buffer has events, but lastEventId was NOT in it:
    // That means lastEventId committed prior to the ring buffer window -> buffer overflow gap!
    if (this.commitOrderedBuffer.length > 0) {
      const res: any = [];
      res.gap = true;
      res.reason = 'overflow';
      return res as ReplayResult;
    }

    // Cold start with empty commit buffer: query database by _id > lastEventId
    const events = await this.collection
      .find({
        hackathonId,
        _id: { $gt: lastEventId }
      })
      .sort({ _id: 1 })
      .limit(limit + 1)
      .toArray();

    if (events.length > limit) {
      const res: any = [];
      res.gap = true;
      res.reason = 'overflow';
      return res as ReplayResult;
    }

    const res: any = events;
    res.gap = false;
    return res as ReplayResult;
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.changeStream) {
      try {
        await this.changeStream.close();
      } catch {
        // ignore
      }
      this.changeStream = null;
    }
    // Drain in-flight queue before resolving
    await this.dispatchQueue;
    logger.info('OutboxDispatcher stopped');
  }

  setLastDispatchedId(id: ObjectId | null): void {
    this.lastDispatchedId = id;
    if (!id) {
      this.dispatchedIds.clear();
      this.commitOrderedBuffer = [];
      this.commitOrderedIndexMap.clear();
    } else {
      this.markDispatched(id);
    }
  }

  getLastDispatchedId(): ObjectId | null {
    return this.lastDispatchedId;
  }
}

export const outboxDispatcher = new OutboxDispatcher();
