import { ObjectId, ClientSession } from 'mongodb';
import { teamRepo, TeamDocument } from '../teams/team.repo.js';
import { membershipRepo } from './membership.repo.js';
import { hackathonRepo } from '../hackathons/hackathon.repo.js';
import { requestRepo } from '../requests/request.repo.js';
import { inviteRepo } from '../invites/invite.repo.js';
import { auditService } from '../audit/audit.service.js';
import { outboxRepo } from '../../realtime/outbox.repo.js';
import { idempotencyService, computeRequestHash } from '../idempotency/idempotency.service.js';
import { withDomainTransaction } from '../../db/transaction.js';
import { AppError, TeamResponse } from '@crewgrid/contracts';

export class MembershipService {
  toTeamResponse(team: TeamDocument, currentUserId?: ObjectId): TeamResponse {
    const isMember = currentUserId ? team.leaderId.equals(currentUserId) : false;
    const isLeader = currentUserId ? team.leaderId.equals(currentUserId) : false;

    const permissions: string[] = [];
    if (isLeader) {
      permissions.push('manage:team', 'manage:requests', 'manage:invites', 'transfer:leadership');
    }
    if (isMember) {
      permissions.push('leave:team', 'view:audit');
    }

    const stage = team.memberCount >= team.minSize ? 'ready' : 'forming';
    const openSeats = Math.max(0, team.maxSize - team.memberCount);

    return {
      id: team._id.toHexString(),
      hackathonId: team.hackathonId.toHexString(),
      name: team.name,
      description: team.description,
      leaderId: team.leaderId.toHexString(),
      memberCount: team.memberCount,
      minSize: team.minSize,
      maxSize: team.maxSize,
      openSeats,
      stage,
      requiredSkills: team.requiredSkills,
      viewerPermissions: permissions
    };
  }

  /**
   * Helper to execute an idempotent domain mutation
   */
  async executeIdempotent<T>(params: {
    actorId: ObjectId;
    scope: string;
    key?: string;
    payload: unknown;
    statusCode: number;
    action: (session: ClientSession) => Promise<T>;
  }): Promise<{ data: T; replayed: boolean }> {
    const { actorId, scope, key, payload, statusCode, action } = params;

    if (!key) {
      const data = await withDomainTransaction(async ({ session }) => action(session));
      return { data, replayed: false };
    }

    const requestHash = computeRequestHash(payload, scope);

    // 1. Check existing record
    const existing = await idempotencyService.findRecord(actorId, scope, key);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new AppError(409, 'IDEMPOTENCY_KEY_REUSED', 'Idempotency key reused with different request payload');
      }
      return { data: existing.responseBody as T, replayed: true };
    }

    // 2. Run inside transaction
    let wasReplayed = false;
    try {
      const data = await withDomainTransaction(async ({ session }) => {
        const inTxExisting = await idempotencyService.findRecord(actorId, scope, key, session);
        if (inTxExisting) {
          if (inTxExisting.requestHash !== requestHash) {
            throw new AppError(409, 'IDEMPOTENCY_KEY_REUSED', 'Idempotency key reused with different request payload');
          }
          wasReplayed = true;
          return inTxExisting.responseBody as T;
        }

        const result = await action(session);

        await idempotencyService.recordSuccess(
          {
            actorId,
            scope,
            key,
            requestHash,
            responseStatus: statusCode,
            responseBody: result
          },
          session
        );

        return result;
      });

      return { data, replayed: wasReplayed };
    } catch (err: any) {
      // If another concurrent request with the same idempotency key succeeded, return the replayed response
      for (let retry = 0; retry < 5; retry++) {
        const recheck = await idempotencyService.findRecord(actorId, scope, key);
        if (recheck) {
          if (recheck.requestHash !== requestHash) {
            throw new AppError(409, 'IDEMPOTENCY_KEY_REUSED', 'Idempotency key reused with different request payload');
          }
          return { data: recheck.responseBody as T, replayed: true };
        }
        if (retry < 4) {
          await new Promise((resolve) => setTimeout(resolve, 20 * (retry + 1)));
        }
      }
      throw err;
    }
  }

  /**
   * A. Create a team and register creator as leader and member
   */
  async createTeam(params: {
    actorId: ObjectId;
    hackathonId: ObjectId;
    name: string;
    description: string;
    minSize: number;
    maxSize: number;
    requiredSkills: string[];
    requestId: string;
    idempotencyKey?: string;
  }): Promise<{ team: TeamResponse; replayed: boolean }> {
    const { actorId, hackathonId, name, description, minSize, maxSize, requiredSkills, requestId, idempotencyKey } =
      params;

    const hackathon = await hackathonRepo.findById(hackathonId);
    if (!hackathon || !hackathon.active) {
      throw new AppError(404, 'TEAM_NOT_FOUND', 'Hackathon not found or inactive');
    }

    if (minSize < hackathon.minTeamSize || maxSize > hackathon.maxTeamSize) {
      throw new AppError(
        422,
        'VALIDATION_FAILED',
        `Team size limits must fall within hackathon bounds (${hackathon.minTeamSize} - ${hackathon.maxTeamSize})`
      );
    }

    const scope = `team.create:${hackathonId.toHexString()}`;
    const payload = { hackathonId: hackathonId.toHexString(), name, minSize, maxSize, requiredSkills };

    const { data: createdTeam, replayed } = await this.executeIdempotent({
      actorId,
      scope,
      key: idempotencyKey,
      payload,
      statusCode: 201,
      action: async (session) => {
        // Double check membership inside transaction
        const inTxMember = await membershipRepo.findActiveMembership(hackathonId, actorId, session);
        if (inTxMember) {
          throw new AppError(409, 'ALREADY_IN_TEAM', 'You are already a member of a team in this hackathon');
        }

        const now = new Date();
        const teamDoc = await teamRepo.createTeam(
          {
            hackathonId,
            name,
            description,
            requiredSkills,
            leaderId: actorId,
            minSize,
            maxSize,
            memberCount: 1,
            version: 1,
            deletedAt: null,
            createdAt: now,
            updatedAt: now
          },
          session
        );

        await membershipRepo.insertMembership(
          {
            hackathonId,
            teamId: teamDoc._id,
            userId: actorId,
            joinedAt: now
          },
          session
        );

        await auditService.recordAuditEvent(
          {
            hackathonId,
            teamId: teamDoc._id,
            actorId,
            action: 'team.created',
            changes: { name, minSize, maxSize, memberCount: 1 },
            occurredAt: now,
            requestId
          },
          session
        );

        await outboxRepo.insertEvent(
          {
            hackathonId,
            teamId: teamDoc._id,
            scope: 'public-hackathon',
            eventType: 'team.created',
            payload: {
              teamId: teamDoc._id.toHexString(),
              name: teamDoc.name,
              memberCount: 1,
              stage: teamDoc.memberCount >= teamDoc.minSize ? 'ready' : 'forming',
              openSeats: teamDoc.maxSize - 1
            }
          },
          session
        );

        return this.toTeamResponse(teamDoc, actorId);
      }
    });

    return { team: createdTeam, replayed };
  }

  /**
   * B. Centralized canonical admission engine for BOTH invite redemption & request approval
   */
  async admitMemberInTransaction(params: {
    session: ClientSession;
    actorId: ObjectId;
    teamId: ObjectId;
    applicantId: ObjectId;
    source: 'invite' | 'request';
    inviteId?: ObjectId;
    requestId?: ObjectId;
    traceRequestId: string;
  }): Promise<{ team: TeamDocument }> {
    const { session, actorId, teamId, applicantId, source, inviteId, requestId, traceRequestId } = params;

    const team = await teamRepo.findActiveById(teamId, session);
    if (!team) {
      throw new AppError(404, 'TEAM_NOT_FOUND', 'Team not found or has been deleted');
    }

    // Check if applicant is already on a team in this hackathon
    const existingMembership = await membershipRepo.findActiveMembership(team.hackathonId, applicantId, session);
    if (existingMembership) {
      throw new AppError(409, 'ALREADY_IN_TEAM', 'Applicant is already on a team for this hackathon');
    }

    // Guarded atomic capacity increment
    const reserved = await teamRepo.guardedIncrementMemberCount(teamId, session);
    if (!reserved) {
      throw new AppError(409, 'TEAM_FULL', 'This team has no available seats.');
    }

    const now = new Date();

    // Specific source validations
    if (source === 'invite') {
      if (!inviteId) throw new Error('Missing inviteId for invite admission');
      const consumed = await inviteRepo.conditionallyConsumeInvite(inviteId, applicantId, session);
      if (!consumed) {
        throw new AppError(409, 'INVITE_USED', 'Invite token is no longer valid, expired, or already used');
      }

      await auditService.recordAuditEvent(
        {
          hackathonId: team.hackathonId,
          teamId,
          actorId: applicantId,
          action: 'invite.redeemed',
          subjectId: inviteId,
          occurredAt: now,
          requestId: traceRequestId
        },
        session
      );
    } else if (source === 'request') {
      if (!requestId) throw new Error('Missing requestId for request admission');
      if (!team.leaderId.equals(actorId)) {
        throw new AppError(403, 'NOT_TEAM_LEADER', 'Only the current team leader can approve join requests');
      }

      const resolved = await requestRepo.resolveRequest(requestId, 'approved', actorId, session);
      if (!resolved) {
        throw new AppError(409, 'REQUEST_ALREADY_RESOLVED', 'Request has already been approved, declined, or canceled');
      }

      await auditService.recordAuditEvent(
        {
          hackathonId: team.hackathonId,
          teamId,
          actorId,
          action: 'request.approved',
          subjectId: requestId,
          occurredAt: now,
          requestId: traceRequestId
        },
        session
      );
    }

    // Insert new membership document
    await membershipRepo.insertMembership(
      {
        hackathonId: team.hackathonId,
        teamId,
        userId: applicantId,
        joinedAt: now
      },
      session
    );

    // Invalidate applicant's other pending requests for this hackathon
    await requestRepo.invalidatePendingRequestsForUser(team.hackathonId, applicantId, session);

    // Record audit and realtime events
    await auditService.recordAuditEvent(
      {
        hackathonId: team.hackathonId,
        teamId,
        actorId: source === 'invite' ? applicantId : actorId,
        action: 'member.joined',
        subjectId: applicantId,
        changes: { newMemberCount: team.memberCount + 1 },
        occurredAt: now,
        requestId: traceRequestId
      },
      session
    );

    await outboxRepo.insertEvent(
      {
        hackathonId: team.hackathonId,
        teamId,
        scope: 'team',
        eventType: 'member.joined',
        payload: {
          teamId: teamId.toHexString(),
          userId: applicantId.toHexString(),
          memberCount: team.memberCount + 1
        }
      },
      session
    );

    await outboxRepo.insertEvent(
      {
        hackathonId: team.hackathonId,
        teamId,
        scope: 'public-hackathon',
        eventType: 'team.updated',
        payload: {
          teamId: teamId.toHexString(),
          memberCount: team.memberCount + 1,
          stage: team.memberCount + 1 >= team.minSize ? 'ready' : 'forming',
          openSeats: Math.max(0, team.maxSize - (team.memberCount + 1))
        }
      },
      session
    );

    const updatedTeam = (await teamRepo.findById(teamId, session))!;
    return { team: updatedTeam };
  }

  /**
   * C. Leave team: handles voluntary departure, deterministic leader succession, and soft deletion
   */
  async leaveTeam(params: {
    actorId: ObjectId;
    teamId: ObjectId;
    requestId: string;
    idempotencyKey?: string;
  }): Promise<{ result: { teamDeleted: boolean; successorId: string | null }; replayed: boolean }> {
    const { actorId, teamId, requestId, idempotencyKey } = params;

    const scope = `team.leave:${teamId.toHexString()}`;
    const payload = { teamId: teamId.toHexString() };

    const { data: result, replayed } = await this.executeIdempotent({
      actorId,
      scope,
      key: idempotencyKey,
      payload,
      statusCode: 200,
      action: async (session) => {
        const team = await teamRepo.findActiveById(teamId, session);
        if (!team) {
          throw new AppError(404, 'TEAM_NOT_FOUND', 'Team not found or already deleted');
        }

        const isMember = await membershipRepo.findActiveMembership(team.hackathonId, actorId, session);
        if (!isMember || !isMember.teamId.equals(teamId)) {
          throw new AppError(403, 'FORBIDDEN', 'You are not a member of this team');
        }

        const now = new Date();
        const isLeader = team.leaderId.equals(actorId);

        if (!isLeader) {
          // Regular member leaves
          await teamRepo.decrementMemberCount(teamId, undefined, session);
          await membershipRepo.deleteMembership(team.hackathonId, teamId, actorId, session);

          await auditService.recordAuditEvent(
            {
              hackathonId: team.hackathonId,
              teamId,
              actorId,
              action: 'member.left',
              occurredAt: now,
              requestId
            },
            session
          );

          await outboxRepo.insertEvent(
            {
              hackathonId: team.hackathonId,
              teamId,
              scope: 'team',
              eventType: 'member.left',
              payload: { teamId: teamId.toHexString(), userId: actorId.toHexString() }
            },
            session
          );

          return { teamDeleted: false, successorId: null };
        }

        // Leader leaves: check remaining members
        const oldestRemaining = await membershipRepo.findOldestRemainingMember(teamId, actorId, session);

        if (oldestRemaining) {
          // Successor elected deterministically
          const successorId = oldestRemaining.userId;
          await teamRepo.decrementMemberCount(teamId, successorId, session);
          await membershipRepo.deleteMembership(team.hackathonId, teamId, actorId, session);

          await auditService.recordAuditEvent(
            {
              hackathonId: team.hackathonId,
              teamId,
              actorId,
              action: 'member.left',
              occurredAt: now,
              requestId
            },
            session
          );

          await auditService.recordAuditEvent(
            {
              hackathonId: team.hackathonId,
              teamId,
              actorId,
              action: 'leader.transferred',
              subjectId: successorId,
              changes: { oldLeaderId: actorId, newLeaderId: successorId, reason: 'automatic_succession' },
              occurredAt: now,
              requestId
            },
            session
          );

          await outboxRepo.insertEvent(
            {
              hackathonId: team.hackathonId,
              teamId,
              scope: 'team',
              eventType: 'leader.transferred',
              payload: { teamId: teamId.toHexString(), newLeaderId: successorId.toHexString() }
            },
            session
          );

          return { teamDeleted: false, successorId: successorId.toHexString() };
        }

        // Last member leaves: logical deletion of team
        await teamRepo.softDeleteTeam(teamId, session);
        await membershipRepo.deleteMembership(team.hackathonId, teamId, actorId, session);

        await auditService.recordAuditEvent(
          {
            hackathonId: team.hackathonId,
            teamId,
            actorId,
            action: 'member.left',
            occurredAt: now,
            requestId
          },
          session
        );

        await auditService.recordAuditEvent(
          {
            hackathonId: team.hackathonId,
            teamId,
            actorId,
            action: 'team.deleted',
            occurredAt: now,
            requestId
          },
          session
        );

        await outboxRepo.insertEvent(
          {
            hackathonId: team.hackathonId,
            teamId,
            scope: 'public-hackathon',
            eventType: 'team.deleted',
            payload: { teamId: teamId.toHexString() }
          },
          session
        );

        return { teamDeleted: true, successorId: null };
      }
    });

    return { result, replayed };
  }

  /**
   * D. Remove member by leader
   */
  async removeMember(params: {
    actorId: ObjectId;
    teamId: ObjectId;
    targetUserId: ObjectId;
    requestId: string;
    idempotencyKey?: string;
  }): Promise<{ success: boolean; replayed: boolean }> {
    const { actorId, teamId, targetUserId, requestId, idempotencyKey } = params;

    const scope = `team.remove:${teamId.toHexString()}:${targetUserId.toHexString()}`;
    const payload = { teamId: teamId.toHexString(), targetUserId: targetUserId.toHexString() };

    const { data: success, replayed } = await this.executeIdempotent({
      actorId,
      scope,
      key: idempotencyKey,
      payload,
      statusCode: 204,
      action: async (session) => {
        const team = await teamRepo.findActiveById(teamId, session);
        if (!team) {
          throw new AppError(404, 'TEAM_NOT_FOUND', 'Team not found');
        }

        if (!team.leaderId.equals(actorId)) {
          throw new AppError(403, 'NOT_TEAM_LEADER', 'Only the team leader can remove members');
        }

        if (actorId.equals(targetUserId)) {
          throw new AppError(409, 'FORBIDDEN', 'Leader cannot remove themselves; use leave or transfer leadership');
        }

        const targetMember = await membershipRepo.findActiveMembership(team.hackathonId, targetUserId, session);
        if (!targetMember || !targetMember.teamId.equals(teamId)) {
          throw new AppError(404, 'TEAM_NOT_FOUND', 'Target user is not a member of this team');
        }

        await teamRepo.decrementMemberCount(teamId, undefined, session);
        await membershipRepo.deleteMembership(team.hackathonId, teamId, targetUserId, session);

        const now = new Date();
        await auditService.recordAuditEvent(
          {
            hackathonId: team.hackathonId,
            teamId,
            actorId,
            action: 'member.removed',
            subjectId: targetUserId,
            occurredAt: now,
            requestId
          },
          session
        );

        await outboxRepo.insertEvent(
          {
            hackathonId: team.hackathonId,
            teamId,
            scope: 'team',
            eventType: 'member.left',
            payload: { teamId: teamId.toHexString(), userId: targetUserId.toHexString(), reason: 'removed_by_leader' }
          },
          session
        );

        return true;
      }
    });

    return { success, replayed };
  }

  /**
   * E. Transfer leadership to an existing member
   */
  async transferLeadership(params: {
    actorId: ObjectId;
    teamId: ObjectId;
    newLeaderId: ObjectId;
    requestId: string;
    idempotencyKey?: string;
  }): Promise<{ team: TeamResponse; replayed: boolean }> {
    const { actorId, teamId, newLeaderId, requestId, idempotencyKey } = params;

    const scope = `team.transfer:${teamId.toHexString()}`;
    const payload = { teamId: teamId.toHexString(), newLeaderId: newLeaderId.toHexString() };

    const { data: team, replayed } = await this.executeIdempotent({
      actorId,
      scope,
      key: idempotencyKey,
      payload,
      statusCode: 200,
      action: async (session) => {
        const team = await teamRepo.findActiveById(teamId, session);
        if (!team) {
          throw new AppError(404, 'TEAM_NOT_FOUND', 'Team not found');
        }

        if (!team.leaderId.equals(actorId)) {
          throw new AppError(403, 'NOT_TEAM_LEADER', 'Only the team leader can transfer leadership');
        }

        if (team.leaderId.equals(newLeaderId)) {
          return this.toTeamResponse(team, actorId);
        }

        const targetMember = await membershipRepo.findActiveMembership(team.hackathonId, newLeaderId, session);
        if (!targetMember || !targetMember.teamId.equals(teamId)) {
          throw new AppError(409, 'VALIDATION_FAILED', 'Target user must be a current member of the team');
        }

        await teamRepo.transferLeadership(teamId, newLeaderId, session);

        const now = new Date();
        await auditService.recordAuditEvent(
          {
            hackathonId: team.hackathonId,
            teamId,
            actorId,
            action: 'leader.transferred',
            subjectId: newLeaderId,
            changes: { oldLeaderId: actorId, newLeaderId },
            occurredAt: now,
            requestId
          },
          session
        );

        await outboxRepo.insertEvent(
          {
            hackathonId: team.hackathonId,
            teamId,
            scope: 'team',
            eventType: 'leader.transferred',
            payload: { teamId: teamId.toHexString(), newLeaderId: newLeaderId.toHexString() }
          },
          session
        );

        const updated = (await teamRepo.findById(teamId, session))!;
        return this.toTeamResponse(updated, actorId);
      }
    });

    return { team, replayed };
  }

  /**
   * F. Edit team metadata and capacity limits
   */
  async editTeam(params: {
    actorId: ObjectId;
    teamId: ObjectId;
    updates: {
      name?: string;
      description?: string;
      requiredSkills?: string[];
      minSize?: number;
      maxSize?: number;
    };
    requestId: string;
    idempotencyKey?: string;
  }): Promise<{ team: TeamResponse; replayed: boolean }> {
    const { actorId, teamId, updates, requestId, idempotencyKey } = params;

    const scope = `team.edit:${teamId.toHexString()}`;
    const payload = { teamId: teamId.toHexString(), updates };

    const { data: team, replayed } = await this.executeIdempotent({
      actorId,
      scope,
      key: idempotencyKey,
      payload,
      statusCode: 200,
      action: async (session) => {
        const team = await teamRepo.findActiveById(teamId, session);
        if (!team) {
          throw new AppError(404, 'TEAM_NOT_FOUND', 'Team not found');
        }

        if (!team.leaderId.equals(actorId)) {
          throw new AppError(403, 'NOT_TEAM_LEADER', 'Only the team leader can edit team settings');
        }

        const hackathon = await hackathonRepo.findById(team.hackathonId);
        if (hackathon) {
          if (updates.minSize !== undefined && updates.minSize < hackathon.minTeamSize) {
            throw new AppError(422, 'VALIDATION_FAILED', `minSize cannot be less than ${hackathon.minTeamSize}`);
          }
          if (updates.maxSize !== undefined && updates.maxSize > hackathon.maxTeamSize) {
            throw new AppError(422, 'VALIDATION_FAILED', `maxSize cannot exceed ${hackathon.maxTeamSize}`);
          }
        }

        const res = await teamRepo.updateTeamMetadata(teamId, actorId, updates, session);
        if (!res.success) {
          if (res.reason === 'SIZE_CONFLICT') {
            throw new AppError(
              409,
              'TEAM_SIZE_CONFLICT',
              'Cannot reduce maximum team size below current member count'
            );
          }
          throw new AppError(404, 'TEAM_NOT_FOUND', 'Team not found');
        }

        const now = new Date();
        await auditService.recordAuditEvent(
          {
            hackathonId: team.hackathonId,
            teamId,
            actorId,
            action: 'team.updated',
            changes: updates,
            occurredAt: now,
            requestId
          },
          session
        );

        const updated = (await teamRepo.findById(teamId, session))!;
        return this.toTeamResponse(updated, actorId);
      }
    });

    return { team, replayed };
  }
}

export const membershipService = new MembershipService();
