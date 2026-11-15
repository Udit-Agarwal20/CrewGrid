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

  // --------------------------------------------------------------------------
  // 10. Investigation 1: Non-monotonic ObjectId replay
  // --------------------------------------------------------------------------
  it('REPRODUCTION INV 1: non-monotonic replay: Event B (higher ID) commits first, Event A (lower ID) commits afterward; reconnecting with Event B ID must not lose Event A', async () => {
    const hackathon = await createTestHackathon();
    const user = await createTestUser();
    const { sessionCookie } = await createTestSession(user._id);

    const db = getDatabase();
    const now = new Date();

    // Event B has higher ObjectId
    const idB = new ObjectId();
    // Event A has lower ObjectId (allocated 10s earlier)
    const idA = makeObjectIdWithTimestamp(10);
    expect(idA.toHexString() < idB.toHexString()).toBe(true);

    // Event B commits first
    const docB: OutboxEventDocument = {
      _id: idB,
      hackathonId: hackathon._id,
      teamId: null,
      userId: null,
      scope: 'public-hackathon',
      eventType: 'team.created',
      payload: { name: 'Committed First (Event B)' },
      createdAt: now,
      expiresAt: new Date(now.getTime() + 7200000)
    };
    await db.collection('realtime_events').insertOne(docB);
    await outboxDispatcher.enqueueAndDispatch(docB);

    // Client receives Event B and disconnects with Last-Event-ID = idB
    // Now Event A commits second
    const docA: OutboxEventDocument = {
      _id: idA,
      hackathonId: hackathon._id,
      teamId: null,
      userId: null,
      scope: 'public-hackathon',
      eventType: 'team.created',
      payload: { name: 'Committed Second (Event A with lower ID)' },
      createdAt: now,
      expiresAt: new Date(now.getTime() + 7200000)
    };
    await db.collection('realtime_events').insertOne(docA);
    await outboxDispatcher.enqueueAndDispatch(docA);

    // Client reconnects with Last-Event-ID = idB (which is numerically > idA)
    const { output, statusCode } = await connectSseStream({
      cookie: sessionCookie,
      hackathonId: hackathon._id.toHexString(),
      lastEventId: idB.toHexString(),
      durationMs: 400
    });

    expect(statusCode).toBe(200);
    // Either Event A must be delivered in replay, OR an explicit sync.gap must be sent
    const hasEventA = output.includes('Committed Second (Event A with lower ID)');
    const hasSyncGap = output.includes('event: sync.gap');
    expect(hasEventA || hasSyncGap).toBe(true);
  });

  it('REPRODUCTION INV 1: lower-ID event arriving during replay-to-live handshake must not be skipped by flushBuffer', async () => {
    const hackathon = await createTestHackathon();
    const user = await createTestUser();
    const mockRes = createMockSseResponse();

    // Connection starts in buffering mode during handshake
    const connectionId = connectionManager.addConnection(user._id, hackathon._id, null, mockRes, 'dummy-token', {
      buffering: true
    });

    // An event with lower ObjectId arrives while handshake is buffering
    const lowerId = makeObjectIdWithTimestamp(5);
    const now = new Date();
    const handshakeEvent: OutboxEventDocument = {
      _id: lowerId,
      hackathonId: hackathon._id,
      teamId: null,
      userId: null,
      scope: 'public-hackathon',
      eventType: 'team.created',
      payload: { name: 'Lower ID Handshake Event' },
      createdAt: now,
      expiresAt: new Date(now.getTime() + 7200000)
    };

    // Broadcasts during handshake -> gets buffered
    await connectionManager.broadcastEvent(handshakeEvent);

    // Suppose replay replayed a higher event ID
    const higherReplayedId = new ObjectId();
    expect(lowerId.toHexString() < higherReplayedId.toHexString()).toBe(true);

    // Pass the actual replayed IDs set (Investigation 1 fix)
    const replayedSet = new Set([higherReplayedId.toHexString()]);
    await connectionManager.flushBuffer(connectionId, replayedSet);

    // lowerId arrived during handshake, was not in replayedSet, and must be delivered!
    expect(mockRes.getOutput()).toContain('Lower ID Handshake Event');
  });

  // --------------------------------------------------------------------------
  // 11. Investigation 2: Buffered event authorization leakage
  // --------------------------------------------------------------------------
  it('REPRODUCTION INV 2: user removed while private team event is buffered -> flushBuffer must NOT leak private event', async () => {
    const hackathon = await createTestHackathon();
    const teamId = new ObjectId();
    const user = await createTestUser();
    const mockRes = createMockSseResponse();
    const db = getDatabase();

    // 1. User starts as active member in DB
    await db.collection('memberships').insertOne({
      hackathonId: hackathon._id,
      teamId,
      userId: user._id,
      role: 'member',
      joinedAt: new Date()
    });

    // Connection opened in buffering mode for teamId
    const connectionId = connectionManager.addConnection(user._id, hackathon._id, teamId, mockRes, 'token-hash-x', {
      buffering: true
    });

    // 2. A team-private event is authorized and buffered on connection
    const privateEvent: OutboxEventDocument = {
      _id: new ObjectId(),
      hackathonId: hackathon._id,
      teamId,
      userId: null,
      scope: 'team',
      eventType: 'request.created',
      payload: { secret: 'Classified Team Intel 007' },
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7200000)
    };
    await connectionManager.broadcastEvent(privateEvent);

    // 3. User's membership is removed and the removal transaction commits
    await db.collection('memberships').deleteOne({ hackathonId: hackathon._id, teamId, userId: user._id });
    connectionManager.updateClientTeam(user._id, hackathon._id, null, teamId);

    // 4. Replay finishes and flushBuffer runs
    await connectionManager.flushBuffer(connectionId, new Set());

    // In the vulnerable implementation:
    // flushBuffer blindly writes buffered messages without re-verifying current authorization!
    // In the robust implementation:
    // flushBuffer checks authorization at the socket delivery boundary and suppresses the leaked message!
    expect(mockRes.getOutput()).not.toContain('Classified Team Intel 007');
    expect(mockRes.getOutput()).toBe('');
  });

  // --------------------------------------------------------------------------
  // 12. Investigation 3: Poller starvation (>200 records in lookback window)
  // --------------------------------------------------------------------------
  it('REPRODUCTION INV 3: poller discovers and dispatches events beyond the first 200 already-dispatched records', async () => {
    const hackathon = await createTestHackathon();
    const user = await createTestUser();
    const mockRes = createMockSseResponse();
    connectionManager.addConnection(user._id, hackathon._id, null, mockRes);

    const db = getDatabase();
    const now = new Date();

    // Create a custom dispatcher with lookback window of 60s
    const starvationDispatcher = new OutboxDispatcher({ pollIntervalMs: 50, lookbackMs: 60_000 });

    // Insert 220 events in the lookback window
    const docs: OutboxEventDocument[] = [];
    for (let i = 1; i <= 220; i++) {
      docs.push({
        _id: new ObjectId(),
        hackathonId: hackathon._id,
        teamId: null,
        userId: null,
        scope: 'public-hackathon',
        eventType: 'team.updated',
        payload: { index: i },
        createdAt: now,
        expiresAt: new Date(now.getTime() + 7200000)
      });
    }
    await db.collection('realtime_events').insertMany(docs);

    // First 200 records are already dispatched (e.g. earlier by change stream)
    for (let i = 0; i < 200; i++) {
      starvationDispatcher.setLastDispatchedId(docs[i]!._id);
    }

    // Now change stream is down; polling runs
    // In the flawed implementation:
    // query does .limit(200) without pagination. The first 200 records are all already dispatched.
    // Records 201..220 are NEVER fetched or dispatched!
    // In the robust implementation:
    // Poller pages through until it discovers and dispatches the un-dispatched records 201..220!
    await starvationDispatcher.pollAndDispatch();
    await starvationDispatcher.stop();

    // Record 210 and 220 MUST have been dispatched to mockRes
    expect(mockRes.getOutput()).toContain('"index":210');
    expect(mockRes.getOutput()).toContain('"index":220');
  });

  // --------------------------------------------------------------------------
  // 13. Investigation 5: Safe sync.gap without misleading future replay cursor
  // --------------------------------------------------------------------------
  it('REPRODUCTION INV 5: sync.gap control message does NOT include a misleading synthetic id line', async () => {
    const hackathonId = new ObjectId();
    const message = connectionManager.formatSyncGapMessage(hackathonId, 'overflow');

    // In the flawed implementation:
    // formatSyncGapMessage emitted `id: <randomObjectId>\nevent: sync.gap\n...`
    // which causes the browser EventSource to update its Last-Event-ID to a non-existent ID!
    // In the robust implementation:
    // sync.gap must NOT advance the replay cursor to a synthetic ID
    expect(message).toContain('event: sync.gap');
    expect(message).not.toMatch(/^id:\s+[0-9a-f]{24}/m);
  });

  it('REPRODUCTION INV 5: handshake buffer hard limit: exceeding 100 buffered events triggers safe sync.gap and drops buffer', async () => {
    const hackathon = await createTestHackathon();
    const user = await createTestUser();
    const mockRes = createMockSseResponse();

    const connectionId = connectionManager.addConnection(user._id, hackathon._id, null, mockRes, 'tok', {
      buffering: true
    });

    // Broadcast 105 events while handshake is buffering
    for (let i = 1; i <= 105; i++) {
      const event: OutboxEventDocument = {
        _id: new ObjectId(),
        hackathonId: hackathon._id,
        teamId: null,
        userId: null,
        scope: 'public-hackathon',
        eventType: 'team.created',
        payload: { item: i },
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 7200000)
      };
      await connectionManager.broadcastEvent(event);
    }

    // Must have emitted sync.gap on overflow
    expect(mockRes.getOutput()).toContain('event: sync.gap');
    expect(mockRes.getOutput()).toContain('"reason":"overflow"');

    // Flush buffer
    await connectionManager.flushBuffer(connectionId, new Set());
  });

  // --------------------------------------------------------------------------
  // 14. Finding 1: Polling-order vs commit-order during change-stream outage & cold restart
  // --------------------------------------------------------------------------
  it('REPRODUCTION FINDING 1: reversed ObjectId commit ordering during change-stream outage triggers explicit sync.gap on replay', async () => {
    const hackathon1 = await createTestHackathon();
    const hackathon2 = await createTestHackathon();
    const user = await createTestUser();
    const { sessionCookie } = await createTestSession(user._id);
    const db = getDatabase();

    // Event B has higher ObjectId but commits at T1
    const idB = new ObjectId();
    // Event A has lower ObjectId (allocated earlier) but commits at T2
    const idA = makeObjectIdWithTimestamp(10);
    expect(idA.toHexString() < idB.toHexString()).toBe(true);

    const now = new Date();
    const docB: OutboxEventDocument = {
      _id: idB,
      hackathonId: hackathon1._id,
      teamId: null,
      userId: null,
      scope: 'public-hackathon',
      eventType: 'team.created',
      payload: { name: 'Committed First at T1 (Higher ID B)' },
      createdAt: new Date(now.getTime() - 5000),
      expiresAt: new Date(now.getTime() + 7200000)
    };
    const docA: OutboxEventDocument = {
      _id: idA,
      hackathonId: hackathon1._id,
      teamId: null,
      userId: null,
      scope: 'public-hackathon',
      eventType: 'team.created',
      payload: { name: 'Committed Second at T2 (Lower ID A)' },
      createdAt: new Date(now.getTime() - 4000),
      expiresAt: new Date(now.getTime() + 7200000)
    };
    const docOther: OutboxEventDocument = {
      _id: new ObjectId(),
      hackathonId: hackathon2._id,
      teamId: null,
      userId: null,
      scope: 'public-hackathon',
      eventType: 'team.created',
      payload: { name: 'Other Hackathon Event' },
      createdAt: now,
      expiresAt: new Date(now.getTime() + 7200000)
    };

    await db.collection('realtime_events').insertMany([docB, docA, docOther]);

    // Simulate change-stream outage: start dispatcher in polling-only recovery mode
    const fallbackDispatcher = new OutboxDispatcher();
    (fallbackDispatcher as any).changeStream = null;
    (fallbackDispatcher as any).isRunning = true;

    // Poller runs recovery
    await fallbackDispatcher.pollAndDispatch();

    // Verify polling recovery occurred
    expect(fallbackDispatcher.hasFallbackOccurred()).toBe(true);

    // Browser client reconnects with Last-Event-ID = idB
    // In flawed implementation:
    // Polling sorted by _id: 1 and put [A, B] into commitOrderedBuffer, or DB replay queried _id > idB.
    // In both cases, Event A (committed second with lower ID) was permanently lost during replay!
    // In robust implementation:
    // Since commit order cannot be demonstrated from polling/fallback, replay returns sync.gap!
    const replayResult = await fallbackDispatcher.getReplayEvents(hackathon1._id, idB, 10);
    expect(replayResult.gap).toBe(true);
    expect(replayResult.reason).toBe('fallback');

    // Also verify cold restart with empty in-memory replay buffer while running returns sync.gap
    const restartDispatcher = new OutboxDispatcher();
    (restartDispatcher as any).isRunning = true; // Simulates running instance after cold restart before buffer fills
    const coldReplayResult = await restartDispatcher.getReplayEvents(hackathon1._id, idB, 10);
    expect(coldReplayResult.gap).toBe(true);
    expect(coldReplayResult.reason).toBe('fallback');

    // Verify HTTP SSE stream emits sync.gap on polling fallback
    vi.spyOn(outboxDispatcher, 'getReplayEvents').mockImplementationOnce(async (hid, lastId, limit) => {
      return fallbackDispatcher.getReplayEvents(hid, lastId, limit);
    });
    const { output } = await connectSseStream({
      cookie: sessionCookie,
      hackathonId: hackathon1._id.toHexString(),
      lastEventId: idB.toHexString(),
      durationMs: 400
    });
    expect(output).toContain('event: sync.gap');
    expect(output).toContain('"reason":"fallback"');

    await fallbackDispatcher.stop();
    await restartDispatcher.stop();
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // 15. Finding 2: Direct replay authoritative membership verification at delivery time
  // --------------------------------------------------------------------------
  it('REPRODUCTION FINDING 2: user removed in DB while replay is in-flight -> replay MUST NOT disclose private team events', async () => {
    const hackathon = await createTestHackathon();
    const teamId = new ObjectId();
    const user = await createTestUser();
    const { sessionCookie } = await createTestSession(user._id);
    const db = getDatabase();

    // 1. User starts as active member in DB
    await db.collection('memberships').insertOne({
      hackathonId: hackathon._id,
      teamId,
      userId: user._id,
      role: 'member',
      joinedAt: new Date()
    });

    const baseEvent = await outboxRepo.insertEvent({
      hackathonId: hackathon._id,
      scope: 'public-hackathon',
      eventType: 'team.created',
      payload: { name: 'Base Public Team' }
    });

    // Insert a private team event, a public event, and a user-scoped event
    const now = new Date();
    const privateEvent = {
      _id: new ObjectId(),
      hackathonId: hackathon._id,
      teamId,
      userId: null,
      scope: 'team' as const,
      eventType: 'request.created' as const,
      payload: { secret: 'Secret Team Replay Intel' },
      createdAt: now,
      expiresAt: new Date(now.getTime() + 7200000)
    };
    const publicEvent = {
      _id: new ObjectId(),
      hackathonId: hackathon._id,
      teamId: null,
      userId: null,
      scope: 'public-hackathon' as const,
      eventType: 'team.updated' as const,
      payload: { announcement: 'Public Hackathon Update' },
      createdAt: now,
      expiresAt: new Date(now.getTime() + 7200000)
    };
    const userScopedEvent = {
      _id: new ObjectId(),
      hackathonId: hackathon._id,
      teamId: null,
      userId: user._id,
      scope: 'user' as const,
      eventType: 'invite.created' as const,
      payload: { inviteCode: 'USER-SPECIFIC-CODE' },
      createdAt: now,
      expiresAt: new Date(now.getTime() + 7200000)
    };
    await db.collection('realtime_events').insertMany([privateEvent, publicEvent, userScopedEvent]);

    // Hook getReplayEvents to remove user from team in DB during replay lookup
    const originalGetReplay = outboxDispatcher.getReplayEvents.bind(outboxDispatcher);
    vi.spyOn(outboxDispatcher, 'getReplayEvents').mockImplementation(async (hid, lastId, limit) => {
      const res = await originalGetReplay(hid, lastId, limit);
      // SIMULATE: Member removal transaction commits in database right now!
      // But connectionManager in-memory cached teamId has NOT been updated yet
      await db.collection('memberships').deleteOne({ userId: user._id, hackathonId: hackathon._id });
      return res;
    });

    const { output, statusCode } = await connectSseStream({
      cookie: sessionCookie,
      hackathonId: hackathon._id.toHexString(),
      lastEventId: baseEvent._id.toHexString(),
      durationMs: 400
    });

    expect(statusCode).toBe(200);
    // In the flawed implementation:
    // Replay loop checked connectionManager.getClientTeamId(connectionId) which was still teamId!
    // Private event was leaked to the removed user!
    // In the robust implementation:
    // Replay loop authoritatively checks membershipRepo.findActiveMembership at delivery time.
    // Private team event MUST NOT be disclosed!
    expect(output).not.toContain('Secret Team Replay Intel');
    // Public and user-scoped events MUST still be delivered!
    expect(output).toContain('Public Hackathon Update');
    expect(output).toContain('USER-SPECIFIC-CODE');

    vi.restoreAllMocks();
  });

  it('REPRODUCTION FINDING 2: transient DB error during replay authorization suppresses private event without cache corruption', async () => {
    const hackathon = await createTestHackathon();
    const teamId = new ObjectId();
    const user = await createTestUser();
    const { sessionCookie } = await createTestSession(user._id);
    const db = getDatabase();

    // User is active member in DB
    await db.collection('memberships').insertOne({
      hackathonId: hackathon._id,
      teamId,
      userId: user._id,
      role: 'member',
      joinedAt: new Date()
    });

    const baseEvent = await outboxRepo.insertEvent({
      hackathonId: hackathon._id,
      scope: 'public-hackathon',
      eventType: 'team.created',
      payload: { name: 'Base Public Team' }
    });

    const now = new Date();
    const privateEvent = {
      _id: new ObjectId(),
      hackathonId: hackathon._id,
      teamId,
      userId: null,
      scope: 'team' as const,
      eventType: 'request.created' as const,
      payload: { secret: 'Transient Error Private Intel' },
      createdAt: now,
      expiresAt: new Date(now.getTime() + 7200000)
    };
    await db.collection('realtime_events').insertOne(privateEvent);

    // Mock membershipRepo.findActiveMembership to throw transient error specifically during replay delivery
    let callCount = 0;
    const originalFindActive = membershipRepo.findActiveMembership.bind(membershipRepo);
    let errorThrown = false;
    vi.spyOn(membershipRepo, 'findActiveMembership').mockImplementation(async (hid, uid, session) => {
      callCount++;
      if (callCount === 1) {
        // Initial SSE route connection setup succeeds
        return originalFindActive(hid, uid, session);
      }
      // Subsequent call (during replay delivery authorization) throws transient DB error
      errorThrown = true;
      throw new Error('Transient MongoDB connection pool timeout during replay');
    });

    const { output, statusCode } = await connectSseStream({
      cookie: sessionCookie,
      hackathonId: hackathon._id.toHexString(),
      lastEventId: baseEvent._id.toHexString(),
      durationMs: 400
    });

    expect(statusCode).toBe(200);
    expect(errorThrown).toBe(true);
    // Private event MUST be suppressed on transient error (fail-safe zero leakage)
    expect(output).not.toContain('Transient Error Private Intel');

    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // 16. Finding 3: Poller starvation beyond 1,000 events & bounded progress
  // --------------------------------------------------------------------------
  it('REPRODUCTION FINDING 3: lookback window with 1,500 events -> bounded poller makes progress across cycles without starving events 1001-1500', async () => {
    const hackathon = await createTestHackathon();
    const user = await createTestUser();
    const mockRes = createMockSseResponse();
    const db = getDatabase();

    // Register active listener
    connectionManager.addConnection(user._id, hackathon._id, null, mockRes, 'tok-starvation-1500');

    // Insert 1,500 events within lookback window
    const now = new Date();
    const bulkDocs = [];
    for (let i = 1; i <= 1500; i++) {
      bulkDocs.push({
        _id: new ObjectId(),
        hackathonId: hackathon._id,
        teamId: null,
        userId: null,
        scope: 'public-hackathon' as const,
        eventType: 'team.created' as const,
        payload: { itemIndex: i },
        createdAt: new Date(now.getTime() - (1500 - i) * 10), // chronologically incrementing within lookback
        expiresAt: new Date(now.getTime() + 7200000)
      });
    }
    await db.collection('realtime_events').insertMany(bulkDocs);

    const pollerDispatcher = new OutboxDispatcher();
    // In polling-only mode (change stream disabled)
    (pollerDispatcher as any).changeStream = null;
    (pollerDispatcher as any).isRunning = true;

    // Cycle 1: bounded work (processes up to 10 batches = 1,000 events)
    const cycle1Count = await pollerDispatcher.pollAndDispatch();
    expect(cycle1Count).toBe(1000);
    expect(pollerDispatcher.getPollCursor()).not.toBeNull();

    // In the flawed implementation:
    // lastBatchId was local and reset to null on each pollAndDispatch() call!
    // Calling pollAndDispatch() in Cycle 2 re-scanned the first 1,000 records, found they were all dispatched,
    // hit the 10-batch limit, and returned 0! Events 1001..1500 were permanently starved!
    // In the robust implementation:
    // pollCursor is maintained across cycles, so Cycle 2 resumes at event 1,000!
    const cycle2Count = await pollerDispatcher.pollAndDispatch();
    expect(cycle2Count).toBe(500);

    // After finishing all available events, pollCursor resets to null for next full window sweep
    expect(pollerDispatcher.getPollCursor()).toBeNull();

    // Verify mockRes received both event 1,000 and event 1,500
    const out = mockRes.getOutput();
    expect(out).toContain('"itemIndex":1');
    expect(out).toContain('"itemIndex":1000');
    expect(out).toContain('"itemIndex":1001');
    expect(out).toContain('"itemIndex":1500');

    // Cycle 3: cursor is null, sweeps from since again, all 1500 are dispatched -> returns 0
    const cycle3Count = await pollerDispatcher.pollAndDispatch();
    expect(cycle3Count).toBe(0);

    // Test time-window expiration: if cursor is artificially set to an expired date (>60s ago)
    (pollerDispatcher as any).pollCursor = {
      createdAt: new Date(Date.now() - 120000),
      _id: new ObjectId()
    };
    // Clear collection to verify cursor is reset to null when expired
    await db.collection('realtime_events').deleteMany({});
    await pollerDispatcher.pollAndDispatch();
    // Cursor should have been reset to null due to window expiration
    expect(pollerDispatcher.getPollCursor()).toBeNull();

    await pollerDispatcher.stop();
  });

  // --------------------------------------------------------------------------
  // 20. Finding A: Asynchronous flush ordering race
  // --------------------------------------------------------------------------
  it('REPRODUCTION FINDING A: concurrent broadcast during async flushBuffer cannot overtake earlier buffered event', async () => {
    const hackathon = await createTestHackathon();
    const teamId = new ObjectId();
    const user = await createTestUser();
    const mockRes = createMockSseResponse();
    const db = getDatabase();

    await db.collection('memberships').insertOne({
      hackathonId: hackathon._id,
      teamId,
      userId: user._id,
      role: 'member',
      joinedAt: new Date()
    });

    // Connection starts in buffering mode with active teamId
    const connectionId = connectionManager.addConnection(user._id, hackathon._id, teamId, mockRes, 'token-order-test', {
      buffering: true
    });

    // 1. Earlier buffered team-private Event A
    const eventA: OutboxEventDocument = {
      _id: new ObjectId(),
      hackathonId: hackathon._id,
      teamId,
      userId: null,
      scope: 'team',
      eventType: 'team.created',
      payload: { name: 'Event A - Earlier Buffered' },
      createdAt: new Date(Date.now() - 5000),
      expiresAt: new Date(Date.now() + 7200000)
    };
    await connectionManager.broadcastEvent(eventA);

    // 2. Install a controlled promise barrier on membershipRepo.findActiveMembership
    // so when flushBuffer checks authorization for Event A, we pause it deterministically.
    const origFindActiveMembership = membershipRepo.findActiveMembership;
    let barrierReached = false;
    let resolveBarrier: () => void = () => {};
    const barrierPromise = new Promise<void>((resolve) => {
      resolveBarrier = resolve;
    });

    membershipRepo.findActiveMembership = async (hackathonId: ObjectId, userId: ObjectId) => {
      if (!barrierReached) {
        barrierReached = true;
        await barrierPromise;
      }
      return origFindActiveMembership.call(membershipRepo, hackathonId, userId);
    };

    try {
      // 3. Initiate flushBuffer in the background
      const flushPromise = connectionManager.flushBuffer(connectionId, new Set());

      // Deterministically wait until flushBuffer begins authorization check for Event A
      while (!barrierReached) {
        await new Promise((r) => setImmediate(r));
      }

      // 4. While Event A's DB lookup is paused, broadcast newer Event B
      const eventB: OutboxEventDocument = {
        _id: new ObjectId(),
        hackathonId: hackathon._id,
        teamId: null,
        userId: null,
        scope: 'public-hackathon',
        eventType: 'team.updated',
        payload: { name: 'Event B - Newer Live' },
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 7200000)
      };

      await connectionManager.broadcastEvent(eventB);

      // Under the flawed/unpatched implementation:
      // conn.buffering was already set to false before Event A was written!
      // Thus, Event B was written immediately to mockRes, overtaking Event A!
      // Under the robust/patched implementation:
      // conn.buffering remains true while flushing; Event B is queued behind Event A in conn.buffer!
      // At this point (barrier still paused), Event B MUST NOT have been written yet:
      expect(mockRes.getOutput()).not.toContain('Event B - Newer Live');

      // 5. Release barrier and await flushBuffer completion
      resolveBarrier();
      await flushPromise;

      // 6. Verify delivery and strict FIFO order
      const output = mockRes.getOutput();
      expect(output).toContain('Event A - Earlier Buffered');
      expect(output).toContain('Event B - Newer Live');

      const idxA = output.indexOf('Event A - Earlier Buffered');
      const idxB = output.indexOf('Event B - Newer Live');
      expect(idxA).toBeGreaterThan(-1);
      expect(idxB).toBeGreaterThan(-1);
      expect(idxA).toBeLessThan(idxB); // Event A MUST precede Event B!
    } finally {
      membershipRepo.findActiveMembership = origFindActiveMembership;
      resolveBarrier();
    }
  });

  it('Finding A: bounded drain limit triggers sync.gap overflow fallback under sustained throughput', async () => {
    const hackathon = await createTestHackathon();
    const teamId = new ObjectId();
    const user = await createTestUser();
    const mockRes = createMockSseResponse();
    const db = getDatabase();

    await db.collection('memberships').insertOne({
      hackathonId: hackathon._id,
      teamId,
      userId: user._id,
      role: 'member',
      joinedAt: new Date()
    });

    const connectionId = connectionManager.addConnection(user._id, hackathon._id, teamId, mockRes, 'token-overflow-pass', {
      buffering: true
    });

    // Seed 1 event so flush has work
    await connectionManager.broadcastEvent({
      _id: new ObjectId(),
      hackathonId: hackathon._id,
      teamId,
      userId: null,
      scope: 'team',
      eventType: 'team.created',
      payload: { pass: 0 },
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7200000)
    });

    // Intercept findActiveMembership to inject a new event into the buffer on each pass
    let passCount = 0;
    const origFindActiveMembership = membershipRepo.findActiveMembership;
    membershipRepo.findActiveMembership = async (hackathonId: ObjectId, userId: ObjectId) => {
      passCount++;
      // Inject next event while flush is in progress (up to 12 times)
      if (passCount <= 12) {
        await connectionManager.broadcastEvent({
          _id: new ObjectId(),
          hackathonId: hackathon._id,
          teamId,
          userId: null,
          scope: 'team',
          eventType: 'team.created',
          payload: { pass: passCount },
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 7200000)
        });
      }
      return origFindActiveMembership.call(membershipRepo, hackathonId, userId);
    };

    try {
      await connectionManager.flushBuffer(connectionId, new Set());

      // After 10 passes, the drain limit is hit and sync.gap (overflow) is triggered
      const output = mockRes.getOutput();
      expect(output).toContain('event: sync.gap');
      expect(output).toContain('"reason":"overflow"');

      // The connection must have transitioned out of buffering mode
      const conn = (connectionManager as any).connections.get(connectionId);
      expect(conn.buffering).toBe(false);
      expect(conn.buffer).toBeUndefined();
    } finally {
      membershipRepo.findActiveMembership = origFindActiveMembership;
    }
  });
});
