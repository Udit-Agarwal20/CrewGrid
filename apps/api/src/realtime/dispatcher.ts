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
        if (change._id) {
          this.lastResumeToken = change._id;
        }
        if (change.operationType === 'insert' && change.fullDocument) {
          const doc = change.fullDocument as OutboxEventDocument;
          this.enqueueAndDispatch(doc);
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

  enqueueAndDispatch(event: OutboxEventDocument): Promise<void> {
    this.dispatchQueue = this.dispatchQueue
      .then(async () => {
        await this.handleEvent(event);
      })
      .catch((err) => {
        logger.error(
          { err: err?.message, eventId: event._id.toHexString() },
          'Error during serialized outbox event dispatch'
        );
      });
    return this.dispatchQueue;
  }

  async handleEvent(event: OutboxEventDocument): Promise<void> {
    if (this.isDispatched(event._id)) {
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
        this.lastDispatchedId = event._id;
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

      // Sliding lookback window to catch late-committing lower ObjectIds
      const since = new Date(Date.now() - this.lookbackMs);
      const filter: any = {
        createdAt: { $gte: since }
      };

      const events = await this.collection
        .find(filter)
        .sort({ _id: 1 })
        .limit(200)
        .toArray();

      let dispatchedCount = 0;
      for (const event of events) {
        if (!this.isDispatched(event._id)) {
          this.enqueueAndDispatch(event);
          dispatchedCount++;
        }
      }

      await this.dispatchQueue;
      return dispatchedCount;
    } catch (err: any) {
      logger.error({ err: err.message }, 'Error during outbox poll and dispatch');
      return 0;
    }
  }

  /**
   * Replays events for a reconnecting client with Last-Event-ID,
   * detecting gaps due to TTL eviction or replay buffer overflow.
   */
  async getReplayEvents(
    hackathonId: ObjectId,
    lastEventId: ObjectId,
    limit: number = 50
  ): Promise<ReplayResult> {
    // Check if lastEventId is older than the oldest retained event in the collection (TTL eviction)
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

    // Fetch limit + 1 events to detect buffer overflow
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
    } else {
      this.markDispatched(id);
    }
  }

  getLastDispatchedId(): ObjectId | null {
    return this.lastDispatchedId;
  }
}

export const outboxDispatcher = new OutboxDispatcher();
