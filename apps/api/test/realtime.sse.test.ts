import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { ObjectId } from 'mongodb';
import { createApp } from '../src/app.js';
import {
  clearTestCollections,
  createTestUser,
  createTestSession,
  createTestHackathon
} from './setup.js';
import { connectionManager } from '../src/realtime/connection.manager.js';
import { outboxDispatcher } from '../src/realtime/dispatcher.js';
import { outboxRepo } from '../src/realtime/outbox.repo.js';
import { membershipRepo } from '../src/modules/membership/membership.repo.js';

describe('Checkpoint M3-C: Real-time SSE & Outbox Dispatcher Tests', () => {
  const app = createApp();

  beforeEach(async () => {
    await clearTestCollections();
    connectionManager.closeAll();
  });

  afterEach(async () => {
    connectionManager.closeAll();
    await outboxDispatcher.stop();
  });

  // --------------------------------------------------------------------------
  // Authorization & Connection Setup
  // --------------------------------------------------------------------------
  it('rejects unauthenticated SSE connection with 401 UNAUTHENTICATED', async () => {
    const hackathon = await createTestHackathon();

    const res = await request(app).get(`/api/v1/hackathons/${hackathon._id.toHexString()}/events`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects connection to non-existent hackathon with 404', async () => {
    const user = await createTestUser();
    const { sessionCookie } = await createTestSession(user._id);

    const nonExistentId = new ObjectId().toHexString();
    const res = await request(app)
      .get(`/api/v1/hackathons/${nonExistentId}/events`)
      .set('Cookie', sessionCookie);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('TEAM_NOT_FOUND');
  });

  // --------------------------------------------------------------------------
  // Event Broadcasting & Data Isolation
  // --------------------------------------------------------------------------
  it('delivers public-hackathon events to all subscribers on that hackathon', async () => {
    const hackathon = await createTestHackathon();
    const user1 = await createTestUser();
    const user2 = await createTestUser();

    // Mock response writers to capture stream output
    let user1Output = '';
    let user2Output = '';

    const mockRes1: any = {
      write: (chunk: string) => {
        user1Output += chunk;
      },
      flush: () => {}
    };

    const mockRes2: any = {
      write: (chunk: string) => {
        user2Output += chunk;
      },
      flush: () => {}
    };

    connectionManager.addConnection(user1._id, hackathon._id, null, mockRes1);
    connectionManager.addConnection(user2._id, hackathon._id, null, mockRes2);

    expect(connectionManager.getActiveConnectionsCount()).toBe(2);

    // Create a public outbox event
    const event = await outboxRepo.insertEvent({
      hackathonId: hackathon._id,
      scope: 'public-hackathon',
      eventType: 'team.created',
      payload: { name: 'New Avengers', memberCount: 1 }
    });

    // Broadcast via ConnectionManager
    await connectionManager.broadcastEvent(event);

    expect(user1Output).toContain('event: team.created');
    expect(user1Output).toContain('New Avengers');
    expect(user2Output).toContain('event: team.created');
    expect(user2Output).toContain('New Avengers');
  });

  it('enforces data isolation: team-scoped events are delivered ONLY to that team members', async () => {
    const hackathon = await createTestHackathon();
    const teamAId = new ObjectId();
    const teamBId = new ObjectId();

    const memberTeamA = await createTestUser();
    const memberTeamB = await createTestUser();
    const unassignedUser = await createTestUser();

    let outputTeamA = '';
    let outputTeamB = '';
    let outputUnassigned = '';

    const mockResA: any = {
      write: (chunk: string) => {
        outputTeamA += chunk;
      },
      flush: () => {}
    };
    const mockResB: any = {
      write: (chunk: string) => {
        outputTeamB += chunk;
      },
      flush: () => {}
    };
    const mockResU: any = {
      write: (chunk: string) => {
        outputUnassigned += chunk;
      },
      flush: () => {}
    };

    await membershipRepo.insertMembership({
      hackathonId: hackathon._id,
      teamId: teamAId,
      userId: memberTeamA._id,
      joinedAt: new Date()
    });
    await membershipRepo.insertMembership({
      hackathonId: hackathon._id,
      teamId: teamBId,
      userId: memberTeamB._id,
      joinedAt: new Date()
    });

    connectionManager.addConnection(memberTeamA._id, hackathon._id, teamAId, mockResA);
    connectionManager.addConnection(memberTeamB._id, hackathon._id, teamBId, mockResB);
    connectionManager.addConnection(unassignedUser._id, hackathon._id, null, mockResU);

    // Private team-scoped event for Team A
    const event = await outboxRepo.insertEvent({
      hackathonId: hackathon._id,
      teamId: teamAId,
      scope: 'team',
      eventType: 'request.created',
      payload: { requestId: new ObjectId().toHexString() }
    });

    await connectionManager.broadcastEvent(event);

    // Only Member of Team A should receive the event!
    expect(outputTeamA).toContain('event: request.created');
    expect(outputTeamB).toBe('');
    expect(outputUnassigned).toBe('');
  });

  it('enforces data isolation: user-scoped events are delivered ONLY to targeted user', async () => {
    const hackathon = await createTestHackathon();
    const userTarget = await createTestUser();
    const userOther = await createTestUser();

    let outputTarget = '';
    let outputOther = '';

    const mockResTarget: any = {
      write: (chunk: string) => {
        outputTarget += chunk;
      },
      flush: () => {}
    };
    const mockResOther: any = {
      write: (chunk: string) => {
        outputOther += chunk;
      },
      flush: () => {}
    };

    connectionManager.addConnection(userTarget._id, hackathon._id, null, mockResTarget);
    connectionManager.addConnection(userOther._id, hackathon._id, null, mockResOther);

    // Private user-scoped event for userTarget
    const event = await outboxRepo.insertEvent({
      hackathonId: hackathon._id,
      userId: userTarget._id,
      scope: 'user',
      eventType: 'request.resolved',
      payload: { status: 'accepted' }
    });

    await connectionManager.broadcastEvent(event);

    expect(outputTarget).toContain('event: request.resolved');
    expect(outputOther).toBe('');
  });

  it('enforces hackathon boundary: events from Hackathon A are NOT delivered to Hackathon B subscribers', async () => {
    const hackathonA = await createTestHackathon({ slug: 'hack-a' });
    const hackathonB = await createTestHackathon({ slug: 'hack-b' });

    const userA = await createTestUser();
    const userB = await createTestUser();

    let outputA = '';
    let outputB = '';

    connectionManager.addConnection(userA._id, hackathonA._id, null, {
      write: (c: string) => {
        outputA += c;
      },
      flush: () => {}
    } as any);

    connectionManager.addConnection(userB._id, hackathonB._id, null, {
      write: (c: string) => {
        outputB += c;
      },
      flush: () => {}
    } as any);

    // Event on Hackathon A
    const eventA = await outboxRepo.insertEvent({
      hackathonId: hackathonA._id,
      scope: 'public-hackathon',
      eventType: 'team.created',
      payload: { name: 'Hack A Team' }
    });

    await connectionManager.broadcastEvent(eventA);

    expect(outputA).toContain('Hack A Team');
    expect(outputB).toBe('');
  });

  // --------------------------------------------------------------------------
  // Last-Event-ID Replay & Crash Recovery
  // --------------------------------------------------------------------------
  it('replays missed events when connecting with Last-Event-ID header', async () => {
    const hackathon = await createTestHackathon();
    const user = await createTestUser();
    await createTestSession(user._id);

    // Create 3 events in outbox
    const e1 = await outboxRepo.insertEvent({
      hackathonId: hackathon._id,
      scope: 'public-hackathon',
      eventType: 'team.created',
      payload: { index: 1 }
    });
    const e2 = await outboxRepo.insertEvent({
      hackathonId: hackathon._id,
      scope: 'public-hackathon',
      eventType: 'team.created',
      payload: { index: 2 }
    });
    const e3 = await outboxRepo.insertEvent({
      hackathonId: hackathon._id,
      scope: 'public-hackathon',
      eventType: 'team.created',
      payload: { index: 3 }
    });

    // Replay events with Last-Event-ID = e1._id: should receive e2 and e3
    const replayEvents = await outboxDispatcher.getReplayEvents(hackathon._id, e1._id, 10);

    expect(replayEvents.length).toBe(2);
    expect(replayEvents[0]!._id.toHexString()).toBe(e2._id.toHexString());
    expect(replayEvents[1]!._id.toHexString()).toBe(e3._id.toHexString());
  });

  it('outbox dispatcher crash recovery: catches up on un-dispatched events on poll', async () => {
    const hackathon = await createTestHackathon();
    const user = await createTestUser();

    let output = '';
    connectionManager.addConnection(user._id, hackathon._id, null, {
      write: (c: string) => {
        output += c;
      },
      flush: () => {}
    } as any);

    // Dispatcher was offline when transactions wrote events
    outboxDispatcher.setLastDispatchedId(null);

    await outboxRepo.insertEvent({
      hackathonId: hackathon._id,
      scope: 'public-hackathon',
      eventType: 'team.created',
      payload: { name: 'Offline Team 1' }
    });
    await outboxRepo.insertEvent({
      hackathonId: hackathon._id,
      scope: 'public-hackathon',
      eventType: 'team.created',
      payload: { name: 'Offline Team 2' }
    });

    // Dispatcher starts and polls
    const count = await outboxDispatcher.pollAndDispatch();
    expect(count).toBe(2);

    expect(output).toContain('Offline Team 1');
    expect(output).toContain('Offline Team 2');
  });

  it('heartbeat comment is sent periodically without breaking event stream format', () => {
    let output = '';
    connectionManager.addConnection(new ObjectId(), new ObjectId(), null, {
      write: (c: string) => {
        output += c;
      },
      flush: () => {}
    } as any);

    connectionManager.sendHeartbeat();
    expect(output).toBe(': keepalive\n\n');
  });
});
