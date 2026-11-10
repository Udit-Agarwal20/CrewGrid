import { ObjectId, ChangeStream } from 'mongodb';
import { getDatabase } from '../db/client.js';
import { OutboxEventDocument } from './outbox.repo.js';
import { connectionManager } from './connection.manager.js';
import { logger } from '../observability/logger.js';

export class OutboxDispatcher {
  private isRunning = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private changeStream: ChangeStream | null = null;
  private lastDispatchedId: ObjectId | null = null;
  private pollIntervalMs: number;

  constructor(options?: { pollIntervalMs?: number }) {
    this.pollIntervalMs = options?.pollIntervalMs ?? 500;
  }

  private get collection() {
    return getDatabase().collection<OutboxEventDocument>('realtime_events');
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      // Find the latest existing event ID as initial baseline if not set
      if (!this.lastDispatchedId) {
        const latest = await this.collection.find().sort({ _id: -1 }).limit(1).toArray();
        if (latest[0]) {
          this.lastDispatchedId = latest[0]._id;
        }
      }
    } catch {
      // Database might not be initialized yet
    }

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

    logger.info('OutboxDispatcher started');
  }

  private async initChangeStream(): Promise<void> {
    try {
      this.changeStream = this.collection.watch([{ $match: { operationType: 'insert' } }], {
        fullDocument: 'updateLookup'
      });

      this.changeStream.on('change', (change: any) => {
        if (change.operationType === 'insert' && change.fullDocument) {
          const doc = change.fullDocument as OutboxEventDocument;
          this.handleEvent(doc);
        }
      });

      this.changeStream.on('error', (err) => {
        logger.warn({ err: err.message }, 'Change stream error, polling loop remains active');
      });
    } catch (err: any) {
      logger.warn({ err: err.message }, 'Could not open change stream; polling loop active');
    }
  }

  private handleEvent(event: OutboxEventDocument): void {
    if (this.lastDispatchedId && event._id <= this.lastDispatchedId) {
      return; // Already processed
    }
    this.lastDispatchedId = event._id;
    connectionManager.broadcastEvent(event);
  }

  async pollAndDispatch(): Promise<number> {
    try {
      const filter: any = {};
      if (this.lastDispatchedId) {
        filter._id = { $gt: this.lastDispatchedId };
      }

      const events = await this.collection
        .find(filter)
        .sort({ _id: 1 })
        .limit(100)
        .toArray();

      for (const event of events) {
        this.handleEvent(event);
      }

      return events.length;
    } catch (err: any) {
      logger.error({ err: err.message }, 'Error during outbox poll and dispatch');
      return 0;
    }
  }

  /**
   * Replays events for a reconnecting client with a Last-Event-ID
   */
  async getReplayEvents(
    hackathonId: ObjectId,
    lastEventId: ObjectId,
    limit: number = 50
  ): Promise<OutboxEventDocument[]> {
    return this.collection
      .find({
        hackathonId,
        _id: { $gt: lastEventId }
      })
      .sort({ _id: 1 })
      .limit(limit)
      .toArray();
  }

  stop(): void {
    this.isRunning = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.changeStream) {
      this.changeStream.close().catch(() => {});
      this.changeStream = null;
    }
    logger.info('OutboxDispatcher stopped');
  }

  setLastDispatchedId(id: ObjectId | null): void {
    this.lastDispatchedId = id;
  }
}

export const outboxDispatcher = new OutboxDispatcher();

