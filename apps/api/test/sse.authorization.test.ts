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
});
