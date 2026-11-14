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
import { outboxRepo, OutboxEventDocument } from '../src/realtime/outbox.repo.js';
import { membershipRepo } from '../src/modules/membership/membership.repo.js';
import { teamRepo } from '../src/modules/teams/team.repo.js';
import { hashToken } from '../src/middleware/session.js';

describe('C01: SSE Authorization Security & Freshness Tests', () => {
  const app = createApp();

  beforeEach(async () => {
    await clearTestCollections();
    connectionManager.closeAll();
  });

  afterEach(() => {
    connectionManager.closeAll();
    outboxDispatcher.stop();
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

  // Helper to setup team with leader and member
  async function setupTeamWithMember() {
    const hackathon = await createTestHackathon({ minTeamSize: 2, maxTeamSize: 5 });
    const leader = await createTestUser({ displayName: 'Leader' });
    const member = await createTestUser({ displayName: 'Member' });

    const { sessionCookie: leaderCookie, csrfToken: leaderCsrf } = await createTestSession(leader._id);
    const { sessionCookie: memberCookie, csrfToken: memberCsrf } = await createTestSession(member._id);

    // Leader creates team
    const createRes = await request(app)
      .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
      .set('Cookie', leaderCookie)
      .set('X-CSRF-Token', leaderCsrf)
      .send({ name: 'Security Alpha Team', minSize: 2, maxSize: 5 });

    const teamId = new ObjectId(createRes.body.data.id);

    // Leader creates invite
    const invRes = await request(app)
      .post(`/api/v1/teams/${teamId.toHexString()}/invites`)
      .set('Cookie', leaderCookie)
      .set('X-CSRF-Token', leaderCsrf)
      .send({});

    // Member joins via invite
    await request(app)
      .post('/api/v1/invites/redeem')
      .set('Cookie', memberCookie)
      .set('X-CSRF-Token', memberCsrf)
      .send({ token: invRes.body.data.token });

    return {
      hackathon,
      teamId,
      leader,
      leaderCookie,
      leaderCsrf,
      member,
      memberCookie,
      memberCsrf
    };
  }

  // ==========================================================================
  // Scenario 1: User joins a team and receives authorized team events
  // ==========================================================================
  it('Scenario 1: User on a team receives authorized team-scoped events', async () => {
    const { hackathon, teamId, member } = await setupTeamWithMember();

    const mockRes = createMockSseResponse();
    // Member connects to SSE while on team
    connectionManager.addConnection(member._id, hackathon._id, teamId, mockRes);

    const event = await outboxRepo.insertEvent({
      hackathonId: hackathon._id,
      teamId,
      scope: 'team',
      eventType: 'member.joined',
      payload: { teamId: teamId.toHexString(), newMember: 'Dave' }
    });

    await connectionManager.broadcastEvent(event);

    expect(mockRes.getOutput()).toContain('event: member.joined');
    expect(mockRes.getOutput()).toContain('Dave');
  });

  // ==========================================================================
  // Scenario 2: User leaves the team while keeping SSE connection open
  // ==========================================================================
  it('Scenario 2: User leaves team while keeping SSE open -> must NOT receive subsequent team events', async () => {
    const { hackathon, teamId, member, memberCookie, memberCsrf } = await setupTeamWithMember();

    const mockRes = createMockSseResponse();
    // Member connects to SSE while on team
    connectionManager.addConnection(member._id, hackathon._id, teamId, mockRes);

    // Member leaves team via API
    const leaveRes = await request(app)
      .post(`/api/v1/teams/${teamId.toHexString()}/leave`)
      .set('Cookie', memberCookie)
      .set('X-CSRF-Token', memberCsrf);
    expect(leaveRes.status).toBe(200);

    mockRes.clearOutput();

    // Now a new private team event is created for the team
    const privateEvent = await outboxRepo.insertEvent({
      hackathonId: hackathon._id,
      teamId,
      scope: 'team',
      eventType: 'request.created',
      payload: { teamId: teamId.toHexString(), secretData: 'Confidential Team Secret' }
    });

    // Broadcast the event
    await connectionManager.broadcastEvent(privateEvent);

    // MUST NOT receive the private team event after leaving!
    expect(mockRes.getOutput()).not.toContain('Confidential Team Secret');
    expect(mockRes.getOutput()).not.toContain('event: request.created');
  });

  // ==========================================================================
  // Scenario 3: User is removed by leader while keeping SSE open
  // ==========================================================================
  it('Scenario 3: User is removed by leader while keeping SSE open -> must NOT receive subsequent team events', async () => {
    const { hackathon, teamId, leaderCookie, leaderCsrf, member } = await setupTeamWithMember();

    const mockRes = createMockSseResponse();
    // Member connects to SSE while on team
    connectionManager.addConnection(member._id, hackathon._id, teamId, mockRes);

    // Leader removes member
    const removeRes = await request(app)
      .delete(`/api/v1/teams/${teamId.toHexString()}/members/${member._id.toHexString()}`)
      .set('Cookie', leaderCookie)
      .set('X-CSRF-Token', leaderCsrf);
    expect(removeRes.status).toBe(204);

    mockRes.clearOutput();

    // Private team event dispatched
    const privateEvent = await outboxRepo.insertEvent({
      hackathonId: hackathon._id,
      teamId,
      scope: 'team',
      eventType: 'leader.transferred',
      payload: { teamId: teamId.toHexString(), newLeaderId: 'someone-else', sensitiveStrategy: 'Plan B' }
    });

    await connectionManager.broadcastEvent(privateEvent);

    // MUST NOT receive private team events after removal!
    expect(mockRes.getOutput()).not.toContain('Plan B');
    expect(mockRes.getOutput()).not.toContain('event: leader.transferred');
  });

  // ==========================================================================
  // Scenario 4: Unassigned user joins a team while SSE connection is open
  // ==========================================================================
  it('Scenario 4: Previously unassigned user joins a team -> MUST receive authorized team events on open SSE', async () => {
    const hackathon = await createTestHackathon({ minTeamSize: 2, maxTeamSize: 5 });
    const leader = await createTestUser({ displayName: 'Leader' });
    const applicant = await createTestUser({ displayName: 'Applicant' });

    const { sessionCookie: leaderCookie, csrfToken: leaderCsrf } = await createTestSession(leader._id);
    const { sessionCookie: applicantCookie, csrfToken: applicantCsrf } = await createTestSession(applicant._id);

    // Applicant connects to SSE while UNASSIGNED
    const mockRes = createMockSseResponse();
    connectionManager.addConnection(applicant._id, hackathon._id, null, mockRes);

    // Leader creates team
    const createRes = await request(app)
      .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
      .set('Cookie', leaderCookie)
      .set('X-CSRF-Token', leaderCsrf)
      .send({ name: 'Delta Force', minSize: 2, maxSize: 5 });
    const teamId = new ObjectId(createRes.body.data.id);

    // Leader creates invite
    const invRes = await request(app)
      .post(`/api/v1/teams/${teamId.toHexString()}/invites`)
      .set('Cookie', leaderCookie)
      .set('X-CSRF-Token', leaderCsrf)
      .send({});

    // Applicant redeems invite while keeping original SSE open
    const redeemRes = await request(app)
      .post('/api/v1/invites/redeem')
      .set('Cookie', applicantCookie)
      .set('X-CSRF-Token', applicantCsrf)
      .send({ token: invRes.body.data.token });
    expect(redeemRes.status).toBe(200);

    mockRes.clearOutput();

    // Now a team-scoped event arrives for Delta Force
    const teamEvent = await outboxRepo.insertEvent({
      hackathonId: hackathon._id,
      teamId,
      scope: 'team',
      eventType: 'member.joined',
      payload: { teamId: teamId.toHexString(), welcomeMessage: 'Welcome to Delta Force' }
    });

    await connectionManager.broadcastEvent(teamEvent);

    // MUST receive the team event on their open connection now that they joined!
    expect(mockRes.getOutput()).toContain('event: member.joined');
    expect(mockRes.getOutput()).toContain('Welcome to Delta Force');
  });

  // ==========================================================================
  // Scenario 5: User switches teams where permitted
  // ==========================================================================
  it('Scenario 5: User leaves Team A and creates Team B -> receives Team B events, NOT Team A events', async () => {
    const { hackathon, teamId: teamAId, member, memberCookie, memberCsrf } = await setupTeamWithMember();

    const mockRes = createMockSseResponse();
    // Member connects to SSE while on Team A
    connectionManager.addConnection(member._id, hackathon._id, teamAId, mockRes);

    // Member leaves Team A
    await request(app)
      .post(`/api/v1/teams/${teamAId.toHexString()}/leave`)
      .set('Cookie', memberCookie)
      .set('X-CSRF-Token', memberCsrf);

    // Member creates Team B
    const createBRes = await request(app)
      .post(`/api/v1/hackathons/${hackathon._id.toHexString()}/teams`)
      .set('Cookie', memberCookie)
      .set('X-CSRF-Token', memberCsrf)
      .send({ name: 'Team Bravo', minSize: 2, maxSize: 5 });
    const teamBId = new ObjectId(createBRes.body.data.id);

    mockRes.clearOutput();

    // Team A emits private event
    const teamAEvent = await outboxRepo.insertEvent({
      hackathonId: hackathon._id,
      teamId: teamAId,
      scope: 'team',
      eventType: 'request.created',
      payload: { teamId: teamAId.toHexString(), teamASecret: 'Private Team A data' }
    });

    // Team B emits private event
    const teamBEvent = await outboxRepo.insertEvent({
      hackathonId: hackathon._id,
      teamId: teamBId,
      scope: 'team',
      eventType: 'request.created',
      payload: { teamId: teamBId.toHexString(), teamBSecret: 'Welcome to Team Bravo' }
    });

    await connectionManager.broadcastEvent(teamAEvent);
    await connectionManager.broadcastEvent(teamBEvent);

    // MUST NOT receive Team A data
    expect(mockRes.getOutput()).not.toContain('Private Team A data');
    // MUST receive Team B data
    expect(mockRes.getOutput()).toContain('Welcome to Team Bravo');
  });

  // ==========================================================================
  // Scenario 6: User attempts to receive events from another team or hackathon
  // ==========================================================================
  it('Scenario 6: User never receives events from another team or different hackathon', async () => {
    const hackathonA = await createTestHackathon({ slug: 'hack-alpha' });
    const hackathonB = await createTestHackathon({ slug: 'hack-beta' });
    const userA = await createTestUser();
    const teamA = new ObjectId();
    const otherTeam = new ObjectId();

    const mockRes = createMockSseResponse();
    connectionManager.addConnection(userA._id, hackathonA._id, teamA, mockRes);

    // Event for other team in same hackathon
    const otherTeamEvent = await outboxRepo.insertEvent({
      hackathonId: hackathonA._id,
      teamId: otherTeam,
      scope: 'team',
      eventType: 'request.created',
      payload: { secret: 'Other Team Secret' }
    });

    // Event in completely different hackathon
    const diffHackathonEvent = await outboxRepo.insertEvent({
      hackathonId: hackathonB._id,
      teamId: teamA,
      scope: 'team',
      eventType: 'request.created',
      payload: { secret: 'Diff Hackathon Secret' }
    });

    await connectionManager.broadcastEvent(otherTeamEvent);
    await connectionManager.broadcastEvent(diffHackathonEvent);

    expect(mockRes.getOutput()).toBe('');
  });

  // ==========================================================================
  // Scenario 7: Public-hackathon and user-scoped events remain authorized
  // ==========================================================================
  it('Scenario 7: Public-hackathon and user-scoped events remain authorized regardless of team state', async () => {
    const hackathon = await createTestHackathon();
    const user = await createTestUser();
    const otherUser = await createTestUser();

    const mockRes = createMockSseResponse();
    // User with no team
    connectionManager.addConnection(user._id, hackathon._id, null, mockRes);

    // Public event
    const publicEvent = await outboxRepo.insertEvent({
      hackathonId: hackathon._id,
      scope: 'public-hackathon',
      eventType: 'team.created',
      payload: { name: 'Public Team' }
    });

    // User-scoped event for this user
    const userEvent = await outboxRepo.insertEvent({
      hackathonId: hackathon._id,
      userId: user._id,
      scope: 'user',
      eventType: 'request.resolved',
      payload: { status: 'approved' }
    });

    // User-scoped event for another user
    const otherUserEvent = await outboxRepo.insertEvent({
      hackathonId: hackathon._id,
      userId: otherUser._id,
      scope: 'user',
      eventType: 'request.resolved',
      payload: { status: 'rejected' }
    });

    await connectionManager.broadcastEvent(publicEvent);
    await connectionManager.broadcastEvent(userEvent);
    await connectionManager.broadcastEvent(otherUserEvent);

    expect(mockRes.getOutput()).toContain('Public Team');
    expect(mockRes.getOutput()).toContain('request.resolved');
    expect(mockRes.getOutput()).toContain('approved');
    expect(mockRes.getOutput()).not.toContain('rejected');
  });

  // ==========================================================================
  // Scenario 8: Concurrent membership changes vs event broadcast
  // ==========================================================================
  it('Scenario 8: Concurrent membership changes cannot disclose unauthorized private data', async () => {
    const { hackathon, teamId, member, memberCookie, memberCsrf } = await setupTeamWithMember();

    const mockRes = createMockSseResponse();
    connectionManager.addConnection(member._id, hackathon._id, teamId, mockRes);

    // Execute member leave concurrently with event insertions and broadcasts
    const privateEvents: OutboxEventDocument[] = [];
    for (let i = 0; i < 5; i++) {
      privateEvents.push(
        await outboxRepo.insertEvent({
          hackathonId: hackathon._id,
          teamId,
          scope: 'team',
          eventType: 'request.created',
          payload: { index: i, secret: `Confidential Message ${i}` }
        })
      );
    }

    // Leave the team
    await request(app)
      .post(`/api/v1/teams/${teamId.toHexString()}/leave`)
      .set('Cookie', memberCookie)
      .set('X-CSRF-Token', memberCsrf);

    mockRes.clearOutput();

    // Emit event AFTER leave committed
    const postLeaveEvent = await outboxRepo.insertEvent({
      hackathonId: hackathon._id,
      teamId,
      scope: 'team',
      eventType: 'request.created',
      payload: { secret: 'Post-Leave Secret Leaked?' }
    });

    await connectionManager.broadcastEvent(postLeaveEvent);

    // Post leave secret must NEVER appear
    expect(mockRes.getOutput()).not.toContain('Post-Leave Secret Leaked?');
  });

  // ==========================================================================
  // Investigation 1: Deterministic TOCTOU race barrier test
  // ==========================================================================
  it('Investigation 1: TOCTOU race barrier test - removal transaction committing during in-flight lookup prevents delivery', async () => {
    const { hackathon, teamId, leaderCookie, leaderCsrf, member } = await setupTeamWithMember();

    const mockRes = createMockSseResponse();
    connectionManager.addConnection(member._id, hackathon._id, teamId, mockRes);

    const privateEvent = await outboxRepo.insertEvent({
      hackathonId: hackathon._id,
      teamId,
      scope: 'team',
      eventType: 'request.created',
      payload: { secret: 'Ultra-Sensitive TOCTOU Secret' }
    });

    // Deterministic barrier hooks
    let lookupStarted = false;
    let resumeLookup: () => void = () => {};
    const resumePromise = new Promise<void>((resolve) => {
      resumeLookup = resolve;
    });

    const origFindTeamMembers = membershipRepo.findTeamMembers.bind(membershipRepo);
    let barrierActive = true;

    // Spy on findTeamMembers to freeze execution right after fetching pre-removal members
    membershipRepo.findTeamMembers = async (tId, session) => {
      const result = await origFindTeamMembers(tId, session);
      if (barrierActive && tId.equals(teamId)) {
        lookupStarted = true;
        // Pause here: the pre-removal snapshot has been obtained
        await resumePromise;
      }
      return result;
    };

    try {
      // Step 1 & 2: Dispatcher begins authoritative lookup in background
      const broadcastPromise = connectionManager.broadcastEvent(privateEvent);

      // Wait until lookup has started and paused at barrier
      while (!lookupStarted) {
        await new Promise((r) => setTimeout(r, 10));
      }

      // Step 3: Removal transaction executes and commits while lookup is paused
      const removeRes = await request(app)
        .delete(`/api/v1/teams/${teamId.toHexString()}/members/${member._id.toHexString()}`)
        .set('Cookie', leaderCookie)
        .set('X-CSRF-Token', leaderCsrf);
      expect(removeRes.status).toBe(204);

      // Verify that removal updated connectionManager state
      barrierActive = false;
      // Step 4: Dispatcher resumes with the pre-removal DB snapshot
      resumeLookup();
      await broadcastPromise;

      // Verification: Under our TOCTOU defense, even though DB lookup had returned the user,
      // the in-memory revocation check at write time detects conn.teamId is null,
      // so the private event must NOT be delivered!
      expect(mockRes.getOutput()).not.toContain('Ultra-Sensitive TOCTOU Secret');
      expect(mockRes.getOutput()).not.toContain('event: request.created');
    } finally {
      membershipRepo.findTeamMembers = origFindTeamMembers;
    }
  });

  // ==========================================================================
  // Investigation 2: Serialized change-stream ordering & delayed dispatch
  // ==========================================================================
  it('Investigation 2: Serialized dispatch guarantees in-order event delivery even when earlier event lookup is delayed', async () => {
    const { hackathon, teamId, member } = await setupTeamWithMember();

    const mockRes = createMockSseResponse();
    connectionManager.addConnection(member._id, hackathon._id, teamId, mockRes);

    const event1 = await outboxRepo.insertEvent({
      hackathonId: hackathon._id,
      teamId,
      scope: 'team',
      eventType: 'member.joined',
      payload: { index: 1, text: 'EVENT_1_FIRST' }
    });

    const event2 = await outboxRepo.insertEvent({
      hackathonId: hackathon._id,
      teamId,
      scope: 'team',
      eventType: 'member.joined',
      payload: { index: 2, text: 'EVENT_2_SECOND' }
    });

    // Delay event1 lookup
    const origFindTeamMembers = membershipRepo.findTeamMembers.bind(membershipRepo);
    let delayedEvent1 = true;

    membershipRepo.findTeamMembers = async (tId, session) => {
      if (delayedEvent1) {
        delayedEvent1 = false;
        // Introduce deliberate delay for Event 1
        await new Promise((r) => setTimeout(r, 60));
      }
      return origFindTeamMembers(tId, session);
    };

    try {
      // Dispatch both through dispatcher's serialized queue
      const p1 = outboxDispatcher.enqueueAndDispatch(event1);
      const p2 = outboxDispatcher.enqueueAndDispatch(event2);
      await Promise.all([p1, p2]);

      const output = mockRes.getOutput();
      expect(output).toContain('EVENT_1_FIRST');
      expect(output).toContain('EVENT_2_SECOND');

      const pos1 = output.indexOf('EVENT_1_FIRST');
      const pos2 = output.indexOf('EVENT_2_SECOND');

      // Strict FIFO order check
      expect(pos1).toBeLessThan(pos2);
    } finally {
      membershipRepo.findTeamMembers = origFindTeamMembers;
    }
  });

  // ==========================================================================
  // Investigation 3: Failure behavior & Session Revocation
  // ==========================================================================
  it('Investigation 3: Database query error during team authorization drops event fail-safe without leaking private data', async () => {
    const { hackathon, teamId, member } = await setupTeamWithMember();

    const mockRes = createMockSseResponse();
    connectionManager.addConnection(member._id, hackathon._id, teamId, mockRes);

    const privateEvent = await outboxRepo.insertEvent({
      hackathonId: hackathon._id,
      teamId,
      scope: 'team',
      eventType: 'request.created',
      payload: { secret: 'Failsafe Secret Under DB Crash' }
    });

    // Simulate transient database failure during lookup
    const origFindTeamMembers = membershipRepo.findTeamMembers.bind(membershipRepo);
    membershipRepo.findTeamMembers = async () => {
      throw new Error('SIMULATED_DB_NETWORK_TIMEOUT');
    };

    try {
      // Should not throw unhandled exception
      await connectionManager.broadcastEvent(privateEvent);

      // Fail-safe: nothing should be delivered
      expect(mockRes.getOutput()).not.toContain('Failsafe Secret Under DB Crash');
      expect(mockRes.getOutput()).toBe('');
    } finally {
      membershipRepo.findTeamMembers = origFindTeamMembers;
    }
  });

  it('Investigation 3: Session logout terminates active SSE socket and revokes session', async () => {
    const user = await createTestUser();
    const { sessionCookie, csrfToken } = await createTestSession(user._id);
    const hackathon = await createTestHackathon();

    const rawToken = sessionCookie.split(';')[0]!.split('=')[1] ?? '';
    const tokenHash = hashToken(rawToken);

    const mockRes = createMockSseResponse();
    connectionManager.addConnection(user._id, hackathon._id, null, mockRes, tokenHash);

    expect(connectionManager.getActiveConnectionsCount()).toBe(1);

    // Call logout endpoint
    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', sessionCookie)
      .set('X-CSRF-Token', csrfToken);

    expect(logoutRes.status).toBe(204);

    // Socket must be closed and removed from connectionManager
    expect(mockRes.isClosed()).toBe(true);
    expect(connectionManager.getActiveConnectionsCount()).toBe(0);

    // Reconnection attempt with same session must fail 401
    const reconnectRes = await request(app)
      .get(`/api/v1/hackathons/${hackathon._id.toHexString()}/events`)
      .set('Cookie', sessionCookie);

    expect(reconnectRes.status).toBe(401);
    expect(reconnectRes.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('Investigation 3: Multiple connections for same user across tabs are updated and revoked consistently', async () => {
    const { hackathon, teamId, leaderCookie, leaderCsrf, member } = await setupTeamWithMember();

    // Member has 3 open tabs
    const tab1 = createMockSseResponse();
    const tab2 = createMockSseResponse();
    const tab3 = createMockSseResponse();

    connectionManager.addConnection(member._id, hackathon._id, teamId, tab1);
    connectionManager.addConnection(member._id, hackathon._id, teamId, tab2);
    connectionManager.addConnection(member._id, hackathon._id, teamId, tab3);

    // Leader removes member
    await request(app)
      .delete(`/api/v1/teams/${teamId.toHexString()}/members/${member._id.toHexString()}`)
      .set('Cookie', leaderCookie)
      .set('X-CSRF-Token', leaderCsrf);

    const postRemovalEvent = await outboxRepo.insertEvent({
      hackathonId: hackathon._id,
      teamId,
      scope: 'team',
      eventType: 'request.created',
      payload: { secret: 'Multi-Tab Secret' }
    });

    await connectionManager.broadcastEvent(postRemovalEvent);

    // None of the 3 tabs should receive the secret
    expect(tab1.getOutput()).not.toContain('Multi-Tab Secret');
    expect(tab2.getOutput()).not.toContain('Multi-Tab Secret');
    expect(tab3.getOutput()).not.toContain('Multi-Tab Secret');
  });

  // ==========================================================================
  // Post-Commit Revocation Gap & Synchronous Fix Verification
  // ==========================================================================
  it('Post-Commit Gap: removal commits and synchronously revokes in-memory authorization without post-commit findById', async () => {
    const { hackathon, teamId, leaderCookie, leaderCsrf, member } = await setupTeamWithMember();

    const mockRes = createMockSseResponse();
    connectionManager.addConnection(member._id, hackathon._id, teamId, mockRes);

    const privateEvent = await outboxRepo.insertEvent({
      hackathonId: hackathon._id,
      teamId,
      scope: 'team',
      eventType: 'request.created',
      payload: { secret: 'Post-Commit Gap Zero-Latency Secret' }
    });

    // Track un-sessioned findById calls
    let unSessionedFindByIdCalls = 0;
    const origFindById = teamRepo.findById.bind(teamRepo);
    teamRepo.findById = async (id, session) => {
      if (!session) {
        unSessionedFindByIdCalls++;
      }
      return origFindById(id, session);
    };

    let lookupStarted = false;
    let resumeLookup: () => void = () => {};
    const resumePromise = new Promise<void>((resolve) => {
      resumeLookup = resolve;
    });

    const origFindTeamMembers = membershipRepo.findTeamMembers.bind(membershipRepo);
    let barrierActive = true;

    membershipRepo.findTeamMembers = async (tId, session) => {
      const result = await origFindTeamMembers(tId, session);
      if (barrierActive && tId.equals(teamId)) {
        lookupStarted = true;
        // Pre-removal snapshot obtained; pause broadcast
        await resumePromise;
      }
      return result;
    };

    try {
      // 1. Begin broadcast in background
      const broadcastPromise = connectionManager.broadcastEvent(privateEvent);

      while (!lookupStarted) {
        await new Promise((r) => setTimeout(r, 10));
      }

      // 2. Removal transaction executes and commits
      const removeRes = await request(app)
        .delete(`/api/v1/teams/${teamId.toHexString()}/members/${member._id.toHexString()}`)
        .set('Cookie', leaderCookie)
        .set('X-CSRF-Token', leaderCsrf);
      expect(removeRes.status).toBe(204);

      // Verify ZERO un-sessioned findById calls were made after commit
      expect(unSessionedFindByIdCalls).toBe(0);

      // Verify in-memory authorization was synchronously revoked to null immediately upon commit
      const conns = connectionManager.getConnectionsForHackathon(hackathon._id);
      const memberConn = conns.find((c) => c.userId.equals(member._id));
      expect(memberConn).toBeDefined();
      expect(memberConn!.teamId).toBeNull();

      // 3. Resume broadcast with pre-removal DB snapshot
      barrierActive = false;
      resumeLookup();
      await broadcastPromise;

      // In-memory revocation prevented delivery fail-safe
      expect(mockRes.getOutput()).not.toContain('Post-Commit Gap Zero-Latency Secret');
    } finally {
      teamRepo.findById = origFindById;
      membershipRepo.findTeamMembers = origFindTeamMembers;
    }
  });

  it('Post-Commit Gap: voluntary leave commits and synchronously revokes without post-commit findById', async () => {
    const { hackathon, teamId, memberCookie, memberCsrf, member } = await setupTeamWithMember();

    const mockRes = createMockSseResponse();
    connectionManager.addConnection(member._id, hackathon._id, teamId, mockRes);

    let unSessionedFindByIdCalls = 0;
    const origFindById = teamRepo.findById.bind(teamRepo);
    teamRepo.findById = async (id, session) => {
      if (!session) {
        unSessionedFindByIdCalls++;
      }
      return origFindById(id, session);
    };

    try {
      const leaveRes = await request(app)
        .post(`/api/v1/teams/${teamId.toHexString()}/leave`)
        .set('Cookie', memberCookie)
        .set('X-CSRF-Token', memberCsrf);
      expect(leaveRes.status).toBe(200);

      // Verify ZERO un-sessioned findById calls occurred
      expect(unSessionedFindByIdCalls).toBe(0);

      // In-memory authorization must be null synchronously
      const conns = connectionManager.getConnectionsForHackathon(hackathon._id);
      const memberConn = conns.find((c) => c.userId.equals(member._id));
      expect(memberConn).toBeDefined();
      expect(memberConn!.teamId).toBeNull();
    } finally {
      teamRepo.findById = origFindById;
    }
  });

  it('Post-Commit Gap: database failure on findById does not impair member removal or revocation', async () => {
    const { hackathon, teamId, leaderCookie, leaderCsrf, member } = await setupTeamWithMember();

    const mockRes = createMockSseResponse();
    connectionManager.addConnection(member._id, hackathon._id, teamId, mockRes);

    const origFindById = teamRepo.findById.bind(teamRepo);
    // If an un-sessioned findById was attempted post-commit, simulate database network failure
    teamRepo.findById = async (id, session) => {
      if (!session) {
        throw new Error('SIMULATED_POST_COMMIT_CRASH');
      }
      return origFindById(id, session);
    };

    try {
      const removeRes = await request(app)
        .delete(`/api/v1/teams/${teamId.toHexString()}/members/${member._id.toHexString()}`)
        .set('Cookie', leaderCookie)
        .set('X-CSRF-Token', leaderCsrf);
      expect(removeRes.status).toBe(204);

      // Revocation succeeded synchronously without calling findById
      const conns = connectionManager.getConnectionsForHackathon(hackathon._id);
      const memberConn = conns.find((c) => c.userId.equals(member._id));
      expect(memberConn).toBeDefined();
      expect(memberConn!.teamId).toBeNull();
    } finally {
      teamRepo.findById = origFindById;
    }
  });

  // ==========================================================================
  // Multi-Instance Synchronization & Eventual Consistency Tests
  // ==========================================================================
  it('Multi-Instance: cross-instance query against MongoDB prevents private event leak before outbox event arrives', async () => {
    const { hackathon, teamId, leaderCookie, leaderCsrf, member } = await setupTeamWithMember();

    // Simulate remote server instance: Member has active SSE connection with cached teamId
    const remoteMockRes = createMockSseResponse();
    connectionManager.addConnection(member._id, hackathon._id, teamId, remoteMockRes);

    // Instance 1 handles member removal in DB transaction
    const removeRes = await request(app)
      .delete(`/api/v1/teams/${teamId.toHexString()}/members/${member._id.toHexString()}`)
      .set('Cookie', leaderCookie)
      .set('X-CSRF-Token', leaderCsrf);
    expect(removeRes.status).toBe(204);

    // Simulate that on Remote Instance, in-memory conn.teamId is still pointing to teamId
    // (e.g. outbox event has not yet been processed across instances)
    const conns = connectionManager.getConnectionsForHackathon(hackathon._id);
    const memberConn = conns.find((c) => c.userId.equals(member._id));
    expect(memberConn).toBeDefined();
    // Deliberately reset teamId to simulate delayed outbox notification on remote instance
    memberConn!.teamId = teamId;

    const privateEvent = await outboxRepo.insertEvent({
      hackathonId: hackathon._id,
      teamId,
      scope: 'team',
      eventType: 'request.created',
      payload: { secret: 'Cross-Instance Sensitive Data' }
    });

    // Remote instance executes broadcast: Layer 2 queries MongoDB findTeamMembers
    await connectionManager.broadcastEvent(privateEvent);

    // Delivery is blocked because MongoDB confirmed member is no longer active in team
    expect(remoteMockRes.getOutput()).not.toContain('Cross-Instance Sensitive Data');

    // Now outbox event arrives on remote instance:
    const outboxLeaveEvent = await outboxRepo.insertEvent({
      hackathonId: hackathon._id,
      teamId,
      scope: 'team',
      eventType: 'member.left',
      payload: { teamId: teamId.toHexString(), userId: member._id.toHexString() }
    });
    await outboxDispatcher.handleEvent(outboxLeaveEvent);

    // In-memory authorization on remote instance is now updated to null
    expect(memberConn!.teamId).toBeNull();
  });

  it('Multi-Instance: out-of-order delayed member.left does not revoke newly joined team', async () => {
    const hackathon = await createTestHackathon();
    const user = await createTestUser();
    const oldTeamId = new ObjectId();
    const newTeamId = new ObjectId();

    const mockRes = createMockSseResponse();
    // User is currently connected and authorized for newTeamId
    connectionManager.addConnection(user._id, hackathon._id, newTeamId, mockRes);

    const conns = connectionManager.getConnectionsForHackathon(hackathon._id);
    const conn = conns.find((c) => c.userId.equals(user._id));
    expect(conn!.teamId).toEqual(newTeamId);

    // A delayed outbox event from oldTeamId arrives
    const delayedOldLeaveEvent = await outboxRepo.insertEvent({
      hackathonId: hackathon._id,
      teamId: oldTeamId,
      scope: 'team',
      eventType: 'member.left',
      payload: { teamId: oldTeamId.toHexString(), userId: user._id.toHexString() }
    });

    await outboxDispatcher.handleEvent(delayedOldLeaveEvent);

    // ExpectedCurrentTeamId protection ensures newTeamId is NOT cleared
    expect(conn!.teamId).toEqual(newTeamId);
  });

  // ==========================================================================
  // Session Logout Behavior & Multi-Device Isolation Tests
  // ==========================================================================
  it('Logout Behavior: logging out of Session A terminates Session A socket while keeping Session B connected', async () => {
    const user = await createTestUser();
    const hackathon = await createTestHackathon();

    // Session A (Laptop)
    const { sessionCookie: cookieA, csrfToken: csrfA } = await createTestSession(user._id);
    // Session B (Phone)
    const { sessionCookie: cookieB } = await createTestSession(user._id);

    // Extract raw tokens from cookies
    const rawTokenA = cookieA.split(';')[0]!.split('=')[1] ?? '';
    const rawTokenB = cookieB.split(';')[0]!.split('=')[1] ?? '';
    const tokenHashA = hashToken(rawTokenA);
    const tokenHashB = hashToken(rawTokenB);

    const mockResA = createMockSseResponse();
    const mockResB = createMockSseResponse();

    connectionManager.addConnection(user._id, hackathon._id, null, mockResA, tokenHashA);
    connectionManager.addConnection(user._id, hackathon._id, null, mockResB, tokenHashB);

    expect(connectionManager.getActiveConnectionsCount()).toBe(2);

    // User logs out of Session A (Laptop)
    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', cookieA)
      .set('X-CSRF-Token', csrfA);
    expect(logoutRes.status).toBe(204);

    // Session A socket must be terminated
    expect(mockResA.isClosed()).toBe(true);

    // Session B socket MUST REMAIN CONNECTED!
    expect(mockResB.isClosed()).toBe(false);
    expect(connectionManager.getActiveConnectionsCount()).toBe(1);

    // Broadcast a public event
    const publicEvent = await outboxRepo.insertEvent({
      hackathonId: hackathon._id,
      teamId: null,
      scope: 'public-hackathon',
      eventType: 'team.created',
      payload: { title: 'Broadcast to Session B' }
    });
    await connectionManager.broadcastEvent(publicEvent);

    expect(mockResB.getOutput()).toContain('Broadcast to Session B');
  });

  it('Logout Behavior: Session A cannot authenticate after logout, Session B remains fully valid', async () => {
    const user = await createTestUser();

    const { sessionCookie: cookieA, csrfToken: csrfA } = await createTestSession(user._id);
    const { sessionCookie: cookieB } = await createTestSession(user._id);

    // Logout Session A
    await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', cookieA)
      .set('X-CSRF-Token', csrfA);

    // Session A is revoked
    const meResA = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', cookieA);
    expect(meResA.status).toBe(401);

    // Session B is still valid
    const meResB = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', cookieB);
    expect(meResB.status).toBe(200);
    expect(meResB.body.data.id).toBe(user._id.toHexString());
  });

  it('Logout Isolation: Session A has NO stream, Session B HAS stream -> logging out A must NOT close B', async () => {
    const user = await createTestUser();
    const hackathon = await createTestHackathon();

    // Session A (e.g. mobile app or background client without an SSE stream)
    const { sessionCookie: cookieA, csrfToken: csrfA } = await createTestSession(user._id);
    // Session B (e.g. desktop browser with an active SSE stream)
    const { sessionCookie: cookieB } = await createTestSession(user._id);

    const rawTokenB = cookieB.split(';')[0]!.split('=')[1] ?? '';
    const tokenHashB = hashToken(rawTokenB);

    // Session B opens an active SSE stream; Session A has no SSE connection
    const mockResB = createMockSseResponse();
    connectionManager.addConnection(user._id, hackathon._id, null, mockResB, tokenHashB);

    expect(connectionManager.getActiveConnectionsCount()).toBe(1);
    expect(mockResB.isClosed()).toBe(false);

    // User logs out on Session A (which has NO active SSE stream)
    const logoutResA = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', cookieA)
      .set('X-CSRF-Token', csrfA);
    expect(logoutResA.status).toBe(204);

    // CRITICAL: Session B's stream MUST REMAIN ACTIVE AND UNTOUCHED!
    // (Previous unsafe fallback would have incorrectly terminated Session B here)
    expect(mockResB.isClosed()).toBe(false);
    expect(connectionManager.getActiveConnectionsCount()).toBe(1);

    // Broadcast a public event: Session B continues to receive it
    const testEvent = await outboxRepo.insertEvent({
      hackathonId: hackathon._id,
      teamId: null,
      scope: 'public-hackathon',
      eventType: 'team.created',
      payload: { title: 'Session B Survives Session A Logout' }
    });
    await connectionManager.broadcastEvent(testEvent);
    expect(mockResB.getOutput()).toContain('Session B Survives Session A Logout');

    // Confirm Session A is unauthenticated while Session B remains valid
    const meA = await request(app).get('/api/v1/auth/me').set('Cookie', cookieA);
    expect(meA.status).toBe(401);

    const meB = await request(app).get('/api/v1/auth/me').set('Cookie', cookieB);
    expect(meB.status).toBe(200);
  });

  it('Account-Wide Revocation: explicit closeConnectionsForUser terminates all sessions for user across devices', async () => {
    const user = await createTestUser();
    const hackathon = await createTestHackathon();

    const { sessionCookie: cookieA } = await createTestSession(user._id);
    const { sessionCookie: cookieB } = await createTestSession(user._id);

    const rawTokenA = cookieA.split(';')[0]!.split('=')[1] ?? '';
    const rawTokenB = cookieB.split(';')[0]!.split('=')[1] ?? '';

    const mockResA = createMockSseResponse();
    const mockResB = createMockSseResponse();

    connectionManager.addConnection(user._id, hackathon._id, null, mockResA, hashToken(rawTokenA));
    connectionManager.addConnection(user._id, hackathon._id, null, mockResB, hashToken(rawTokenB));

    expect(connectionManager.getActiveConnectionsCount()).toBe(2);

    // Explicit account-wide termination (e.g. security suspension or password reset)
    const closedCount = connectionManager.closeConnectionsForUser(user._id);
    expect(closedCount).toBe(2);

    // Both sockets are terminated
    expect(mockResA.isClosed()).toBe(true);
    expect(mockResB.isClosed()).toBe(true);
    expect(connectionManager.getActiveConnectionsCount()).toBe(0);
  });
});
