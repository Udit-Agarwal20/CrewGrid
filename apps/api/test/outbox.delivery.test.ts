import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'node:http';
import { ObjectId } from 'mongodb';
import { createApp } from '../src/app.js';
import {
  clearTestCollections,
  createTestUser,
  createTestSession,
  createTestHackathon
} from './setup.js';
import { connectionManager } from '../src/realtime/connection.manager.js';
import { outboxDispatcher, OutboxDispatcher } from '../src/realtime/dispatcher.js';
import { outboxRepo, OutboxEventDocument } from '../src/realtime/outbox.repo.js';
import { membershipRepo } from '../src/modules/membership/membership.repo.js';
import { getDatabase } from '../src/db/client.js';

describe('C02: Outbox & SSE Delivery Reliability Regression Tests', () => {
  const app = createApp();

  beforeEach(async () => {
    await clearTestCollections();
    connectionManager.closeAll();
    outboxDispatcher.setLastDispatchedId(null);
  });

  afterEach(async () => {
    connectionManager.closeAll();
    await outboxDispatcher.stop();
  });

  function createMockSseResponse() {
    let output = '';
    let closed = false;
    const res: any = {
      writeHead: () => {},
      write: (chunk: string) => {
        output += chunk;
      },
      flush: () => {},
      end: () => {
        closed = true;
      },
      getOutput: () => output,
      clearOutput: () => {
        output = '';
      },
      isClosed: () => closed
    };
    return res;
  }

  // Helper to connect to real SSE endpoint over HTTP, capture data, and safely disconnect
  function connectSseStream(params: {
    cookie: string;
    hackathonId: string;
    lastEventId?: string;
    durationMs?: number;
    beforeClose?: () => Promise<void>;
  }): Promise<{ output: string; statusCode: number }> {
    return new Promise((resolve, reject) => {
      const server = app.listen(0, '127.0.0.1', () => {
        const address = server.address() as any;
        const port = address.port;

        const headers: Record<string, string> = {
          Cookie: params.cookie
        };
        if (params.lastEventId) {
          headers['Last-Event-ID'] = params.lastEventId;
        }

        const path = `/api/v1/hackathons/${params.hackathonId}/events${
          params.lastEventId ? `?lastEventId=${params.lastEventId}` : ''
        }`;

        let output = '';
        let statusCode = 0;

        const req = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path,
            method: 'GET',
            headers
          },
          (res) => {
            statusCode = res.statusCode || 0;
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
              output += chunk;
            });
          }
        );

        req.on('error', (err) => {
          // If socket was destroyed deliberately, ignore
          if ((err as any).code === 'ECONNRESET') {
            return;
          }
          reject(err);
        });

        req.end();

        setTimeout(async () => {
          if (params.beforeClose) {
            try {
              await params.beforeClose();
            } catch (err) {
              reject(err);
              return;
            }
          }
          req.destroy();
          server.close(() => {
            resolve({ output, statusCode });
          });
        }, params.durationMs ?? 300);
      });
    });
  }

  // Helper to generate an ObjectId with a specific timestamp in seconds
  function makeObjectIdWithTimestamp(secondsAgo: number): ObjectId {
    const timestamp = Math.floor(Date.now() / 1000) - secondsAgo;
    const hexSeconds = timestamp.toString(16).padStart(8, '0');
    const randomHex = 'abcdef0123456789';
    return new ObjectId(`${hexSeconds}${randomHex}`);
  }

  // --------------------------------------------------------------------------
  // 1. Non-monotonic ObjectId commit order
  // --------------------------------------------------------------------------
  it('REPRODUCTION: non-monotonic ObjectId commit drops late-committing lower ObjectId', async () => {
    const hackathon = await createTestHackathon();
    const user = await createTestUser();
    const mockRes = createMockSseResponse();

    connectionManager.addConnection(user._id, hackathon._id, null, mockRes);

    // Event B has higher ObjectId (allocated at T1)
    const idB = new ObjectId();
    // Event A has lower ObjectId (allocated at T0 < T1)
    const idA = makeObjectIdWithTimestamp(10); // 10 seconds older ObjectId

    expect(idA.toHexString() < idB.toHexString()).toBe(true);

    const db = getDatabase();
    const now = new Date();

    // Event B commits first
    const docB: OutboxEventDocument = {
      _id: idB,
      hackathonId: hackathon._id,
      teamId: null,
      userId: null,
      scope: 'public-hackathon',
      eventType: 'team.created',
      payload: { name: 'Team B' },
      createdAt: now,
      expiresAt: new Date(now.getTime() + 7200000)
    };
    await db.collection('realtime_events').insertOne(docB);

    // Dispatcher processes Event B
    await outboxDispatcher.enqueueAndDispatch(docB);
    expect(mockRes.getOutput()).toContain('Team B');

    // Event A commits later (slow transaction finished after B)
    const docA: OutboxEventDocument = {
      _id: idA,
      hackathonId: hackathon._id,
      teamId: null,
      userId: null,
      scope: 'public-hackathon',
      eventType: 'team.created',
      payload: { name: 'Team A' },
      createdAt: now,
      expiresAt: new Date(now.getTime() + 7200000)
    };
    await db.collection('realtime_events').insertOne(docA);

    // Dispatcher processes Event A
    await outboxDispatcher.enqueueAndDispatch(docA);

    // In the vulnerable implementation:
    // docA._id <= lastDispatchedId (idB) causes handleEvent to return immediately and drop docA!
    // In the robust implementation:
    // docA MUST be delivered because it has never been dispatched.
    expect(mockRes.getOutput()).toContain('Team A');
  });

  // --------------------------------------------------------------------------
  // 2. Process restart skip window
  // --------------------------------------------------------------------------
  it('REPRODUCTION: restart blindly advances watermark to latest event, skipping un-dispatched events', async () => {
    const hackathon = await createTestHackathon();
    const user = await createTestUser();
    const mockRes = createMockSseResponse();

    const db = getDatabase();
    const now = new Date();

    // Event committed while service was down / restarting
    const unDispatchedDoc: OutboxEventDocument = {
      _id: new ObjectId(),
      hackathonId: hackathon._id,
      teamId: null,
      userId: null,
      scope: 'public-hackathon',
      eventType: 'team.created',
      payload: { name: 'Restart Pending Team' },
      createdAt: now,
      expiresAt: new Date(now.getTime() + 7200000)
    };
    await db.collection('realtime_events').insertOne(unDispatchedDoc);

    // Create a new dispatcher instance simulating a restart
    const newDispatcher = new OutboxDispatcher({ pollIntervalMs: 50 });
    connectionManager.addConnection(user._id, hackathon._id, null, mockRes);

    await newDispatcher.start();
    // Run poll
    await newDispatcher.pollAndDispatch();
    await newDispatcher.stop();

    // The robust implementation must recover recent events within the lookback window
    expect(mockRes.getOutput()).toContain('Restart Pending Team');
  });

  // --------------------------------------------------------------------------
  // 3. Concurrent change stream & poller deduplication
  // --------------------------------------------------------------------------
  it('REPRODUCTION: concurrent change stream and poller do not deliver duplicate events', async () => {
    const hackathon = await createTestHackathon();
    const user = await createTestUser();
    const mockRes = createMockSseResponse();

    connectionManager.addConnection(user._id, hackathon._id, null, mockRes);

    const event = await outboxRepo.insertEvent({
      hackathonId: hackathon._id,
      scope: 'public-hackathon',
      eventType: 'team.created',
      payload: { name: 'Dedup Check Team' }
    });

    // Simultaneously trigger change stream dispatch and polling dispatch for the same event
    await Promise.all([
      outboxDispatcher.enqueueAndDispatch(event),
      outboxDispatcher.enqueueAndDispatch(event),
      outboxDispatcher.pollAndDispatch()
    ]);

    // Check occurrences of event message in output (one message per event)
    const matches = mockRes.getOutput().match(new RegExp(`id: ${event._id.toHexString()}`, 'g')) || [];
    expect(matches.length).toBe(1);
  });

  // --------------------------------------------------------------------------
  // 4. Authorization lookup failure does not permanently drop event
  // --------------------------------------------------------------------------
  it('REPRODUCTION: transient membership lookup failure is retried and not permanently dropped', async () => {
    const hackathon = await createTestHackathon();
    const teamId = new ObjectId();
    const user = await createTestUser();
    const mockRes = createMockSseResponse();

    connectionManager.addConnection(user._id, hackathon._id, teamId, mockRes);

    // Mock membershipRepo.findTeamMembers
    let attempts = 0;
    const originalFind = membershipRepo.findTeamMembers.bind(membershipRepo);
    vi.spyOn(membershipRepo, 'findTeamMembers').mockImplementation(async (tid) => {
      attempts++;
      if (attempts === 1) {
        throw new Error('Transient MongoDB connection pool timeout');
      }
      return originalFind(tid);
    });

    // Create team membership in DB so user is authoritatively authorized
    const db = getDatabase();
    await db.collection('memberships').insertOne({
      hackathonId: hackathon._id,
      teamId,
      userId: user._id,
      role: 'member',
      joinedAt: new Date()
    });

    const event = await outboxRepo.insertEvent({
      hackathonId: hackathon._id,
      teamId,
      scope: 'team',
      eventType: 'team.updated',
      payload: { description: 'Updated with retry' }
    });

    await outboxDispatcher.enqueueAndDispatch(event);

    expect(mockRes.getOutput()).toContain('Updated with retry');
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // 5. Replay-to-live registration race gap
  // --------------------------------------------------------------------------
  it('REPRODUCTION: event committed during SSE connection handshake is not lost', async () => {
    const hackathon = await createTestHackathon();
    const user = await createTestUser();
    const { sessionCookie } = await createTestSession(user._id);

    // Initial event prior to disconnect
    const initialEvent = await outboxRepo.insertEvent({
      hackathonId: hackathon._id,
      scope: 'public-hackathon',
      eventType: 'team.created',
      payload: { name: 'Initial Team' }
    });

    // Now client connects with Last-Event-ID = initialEvent._id
    // We simulate an event being inserted in the exact gap between getReplayEvents and addConnection
    const originalGetReplay = outboxDispatcher.getReplayEvents.bind(outboxDispatcher);
    let gapEvent: OutboxEventDocument | null = null;

    vi.spyOn(outboxDispatcher, 'getReplayEvents').mockImplementation(async (hid, lastId, limit) => {
      const result = await originalGetReplay(hid, lastId, limit);
      // While replay query is executing or just finished, an in-flight transaction commits!
      gapEvent = await outboxRepo.insertEvent({
        hackathonId: hackathon._id,
        scope: 'public-hackathon',
        eventType: 'team.created',
        payload: { name: 'Gap Team Created During Handshake' }
      });
      // Dispatcher broadcasts gapEvent right now, before addConnection registers the client!
      await outboxDispatcher.enqueueAndDispatch(gapEvent);
      return result;
    });

    const { output, statusCode } = await connectSseStream({
      cookie: sessionCookie,
      hackathonId: hackathon._id.toHexString(),
      lastEventId: initialEvent._id.toHexString(),
      durationMs: 400
    });

    expect(statusCode).toBe(200);
    // In the vulnerable implementation:
    // gapEvent is neither in getReplayEvents (queried before gapEvent was inserted)
    // nor delivered via broadcastEvent (client wasn't in connectionManager yet).
    // The robust implementation must buffer/capture it so gapEvent is delivered!
    expect(output).toContain('Gap Team Created During Handshake');
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // 6. Replay limit truncation (>50 events) signals sync.gap
  // --------------------------------------------------------------------------
  it('REPRODUCTION: replay overflow (>50 events) sends sync.gap event instead of silent truncation', async () => {
    const hackathon = await createTestHackathon();
    const user = await createTestUser();
    const { sessionCookie } = await createTestSession(user._id);

    const initialEvent = await outboxRepo.insertEvent({
      hackathonId: hackathon._id,
      scope: 'public-hackathon',
      eventType: 'team.created',
      payload: { name: 'Base Event' }
    });

    // Insert 55 events after initialEvent
    const db = getDatabase();
    const now = new Date();
    const bulkDocs = [];
    for (let i = 1; i <= 55; i++) {
      bulkDocs.push({
        _id: new ObjectId(),
        hackathonId: hackathon._id,
        teamId: null,
        userId: null,
        scope: 'public-hackathon' as const,
        eventType: 'team.updated' as const,
        payload: { iteration: i },
        createdAt: now,
        expiresAt: new Date(now.getTime() + 7200000)
      });
    }
    await db.collection('realtime_events').insertMany(bulkDocs);

    const { output, statusCode } = await connectSseStream({
      cookie: sessionCookie,
      hackathonId: hackathon._id.toHexString(),
      lastEventId: initialEvent._id.toHexString(),
      durationMs: 400
    });

    expect(statusCode).toBe(200);
    // In the vulnerable implementation:
    // Server blindly returns first 50 events without indicating events were truncated!
    // In the robust implementation:
    // Server detects overflow and emits `event: sync.gap` with reason "overflow"
    expect(output).toContain('event: sync.gap');
    expect(output).toContain('"reason":"overflow"');
  });

  // --------------------------------------------------------------------------
  // 7. Expired Last-Event-ID signals sync.gap
  // --------------------------------------------------------------------------
  it('REPRODUCTION: expired Last-Event-ID evicted from collection sends sync.gap event', async () => {
    const hackathon = await createTestHackathon();
    const user = await createTestUser();
    const { sessionCookie } = await createTestSession(user._id);

    // Old Last-Event-ID from 3 hours ago (evicted from DB)
    const expiredLastEventId = makeObjectIdWithTimestamp(3 * 3600);

    // New active event exists in the collection (e.g. from 10 minutes ago)
    await outboxRepo.insertEvent({
      hackathonId: hackathon._id,
      scope: 'public-hackathon',
      eventType: 'team.created',
      payload: { name: 'Current Active Team' }
    });

    const { output, statusCode } = await connectSseStream({
      cookie: sessionCookie,
      hackathonId: hackathon._id.toHexString(),
      lastEventId: expiredLastEventId.toHexString(),
      durationMs: 400
    });

    expect(statusCode).toBe(200);
    // In the vulnerable implementation:
    // getReplayEvents returns empty or partial events without warning of the TTL gap!
    // In the robust implementation:
    // Server detects that expiredLastEventId is older than the oldest retained event and emits sync.gap!
    expect(output).toContain('event: sync.gap');
    expect(output).toContain('"reason":"expired"');
  });

  // --------------------------------------------------------------------------
  // 8. Graceful shutdown drains dispatchQueue
  // --------------------------------------------------------------------------
  it('REPRODUCTION: graceful shutdown drains in-flight broadcasts before closing', async () => {
    const hackathon = await createTestHackathon();
    const user = await createTestUser();
    const mockRes = createMockSseResponse();

    connectionManager.addConnection(user._id, hackathon._id, null, mockRes);

    const event = await outboxRepo.insertEvent({
      hackathonId: hackathon._id,
      scope: 'public-hackathon',
      eventType: 'team.created',
      payload: { name: 'Shutdown In-flight Team' }
    });

    // Enqueue event
    outboxDispatcher.enqueueAndDispatch(event);

    // Immediately trigger stop
    await outboxDispatcher.stop();

    // The event should have been drained and delivered before stop resolved
    expect(mockRes.getOutput()).toContain('Shutdown In-flight Team');
  });

  // --------------------------------------------------------------------------
  // 9. Multi-instance independent delivery
  // --------------------------------------------------------------------------
  it('multi-instance delivery: two independent dispatchers deliver outbox event to their respective clients', async () => {
    const hackathon = await createTestHackathon();
    const userA = await createTestUser();
    const userB = await createTestUser();

    // Instance 1 connection manager and dispatcher
    const mockResA = createMockSseResponse();
    connectionManager.addConnection(userA._id, hackathon._id, null, mockResA);

    // Instance 2 connection manager and dispatcher
    const mockResB = createMockSseResponse();
    const siblingManager = new (connectionManager.constructor as any)();
    siblingManager.addConnection(userB._id, hackathon._id, null, mockResB);

    const event = await outboxRepo.insertEvent({
      hackathonId: hackathon._id,
      scope: 'public-hackathon',
      eventType: 'team.created',
      payload: { name: 'Multi-instance Event' }
    });

    // Both instances receive and broadcast the event
    await Promise.all([
      connectionManager.broadcastEvent(event),
      siblingManager.broadcastEvent(event)
    ]);

    expect(mockResA.getOutput()).toContain('Multi-instance Event');
    expect(mockResB.getOutput()).toContain('Multi-instance Event');

    siblingManager.closeAll();
  });
});
