import { ObjectId } from 'mongodb';
import { requestRepo, JoinRequestDocument } from './request.repo.js';
import { teamRepo } from '../teams/team.repo.js';
import { membershipRepo } from '../membership/membership.repo.js';
import { membershipService } from '../membership/membership.service.js';
import { auditService } from '../audit/audit.service.js';
import { outboxRepo } from '../../realtime/outbox.repo.js';
import { connectionManager } from '../../realtime/connection.manager.js';
import { AppError, JoinRequestResponse, JoinRequestStatus } from '@crewgrid/contracts';

export class RequestService {
  toResponse(doc: JoinRequestDocument): JoinRequestResponse {
    return {
      id: doc._id.toHexString(),
      teamId: doc.teamId.toHexString(),
      applicantId: doc.applicantId.toHexString(),
      status: doc.status,
      message: doc.message,
      createdAt: doc.createdAt.toISOString(),
      resolvedAt: doc.resolvedAt ? doc.resolvedAt.toISOString() : null
    };
  }

  async createRequest(params: {
    applicantId: ObjectId;
    teamId: ObjectId;
    message?: string;
    traceRequestId: string;
    idempotencyKey?: string;
  }): Promise<{ request: JoinRequestResponse; replayed: boolean }> {
    const { applicantId, teamId, message, traceRequestId, idempotencyKey } = params;

    const team = await teamRepo.findActiveById(teamId);
    if (!team) {
      throw new AppError(404, 'TEAM_NOT_FOUND', 'Team not found or deleted');
    }

    const existingMember = await membershipRepo.findActiveMembership(team.hackathonId, applicantId);
    if (existingMember) {
      throw new AppError(409, 'ALREADY_IN_TEAM', 'You already belong to a team in this hackathon');
    }

    const existingPending = await requestRepo.findPending(teamId, applicantId);
    if (existingPending) {
      throw new AppError(409, 'ALREADY_PENDING', 'You already have a pending request for this team');
    }

    const scope = `request.create:${teamId.toHexString()}`;
    const payload = { teamId: teamId.toHexString(), message: message || '' };

    const { data: requestDoc, replayed } = await membershipService.executeIdempotent({
      actorId: applicantId,
      scope,
      key: idempotencyKey,
      payload,
      statusCode: 201,
      action: async (session) => {
        const inTxPending = await requestRepo.findPending(teamId, applicantId, session);
        if (inTxPending) {
          throw new AppError(409, 'ALREADY_PENDING', 'You already have a pending request for this team');
        }

        const now = new Date();
        const reqDoc = await requestRepo.createRequest(
          {
            hackathonId: team.hackathonId,
            teamId,
            applicantId,
            status: 'pending',
            message: message || '',
            createdAt: now
          },
          session
        );

        await auditService.recordAuditEvent(
          {
            hackathonId: team.hackathonId,
            teamId,
            actorId: applicantId,
            action: 'request.created',
            subjectId: reqDoc._id,
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
            eventType: 'request.created',
            payload: {
              requestId: reqDoc._id.toHexString(),
              teamId: teamId.toHexString(),
              applicantId: applicantId.toHexString()
            }
          },
          session
        );

        return this.toResponse(reqDoc);
      }
    });

    return { request: requestDoc, replayed };
  }

  async approveRequest(params: {
    actorId: ObjectId;
    requestId: ObjectId;
    traceRequestId: string;
    idempotencyKey?: string;
  }): Promise<{ request: JoinRequestResponse; replayed: boolean }> {
    const { actorId, requestId, traceRequestId, idempotencyKey } = params;

    const request = await requestRepo.findById(requestId);
    if (!request) {
      throw new AppError(404, 'REQUEST_NOT_FOUND', 'Join request not found');
    }

    if (request.status !== 'pending') {
      throw new AppError(409, 'REQUEST_ALREADY_RESOLVED', `Request has already been ${request.status}`);
    }

    const scope = `request.approve:${requestId.toHexString()}`;
    const payload = { requestId: requestId.toHexString() };

    const { data: approvedResponse, replayed } = await membershipService.executeIdempotent({
      actorId,
      scope,
      key: idempotencyKey,
      payload,
      statusCode: 200,
      action: async (session) => {
        await membershipService.admitMemberInTransaction({
          session,
          actorId,
          teamId: request.teamId,
          applicantId: request.applicantId,
          source: 'request',
          requestId,
          traceRequestId
        });

        const updated = (await requestRepo.findById(requestId, session))!;
        return this.toResponse(updated);
      }
    });

    // Promote client SSE connection to new team authorization after transaction commit
    connectionManager.updateClientTeam(request.applicantId, request.hackathonId, request.teamId);

    return { request: approvedResponse, replayed };
  }

  async declineRequest(params: {
    actorId: ObjectId;
    requestId: ObjectId;
    traceRequestId: string;
    idempotencyKey?: string;
  }): Promise<{ request: JoinRequestResponse; replayed: boolean }> {
    const { actorId, requestId, traceRequestId, idempotencyKey } = params;

    const request = await requestRepo.findById(requestId);
    if (!request) {
      throw new AppError(404, 'REQUEST_NOT_FOUND', 'Join request not found');
    }

    const team = await teamRepo.findActiveById(request.teamId);
    if (!team || !team.leaderId.equals(actorId)) {
      throw new AppError(403, 'NOT_TEAM_LEADER', 'Only the team leader can decline join requests');
    }

    if (request.status !== 'pending') {
      throw new AppError(409, 'REQUEST_ALREADY_RESOLVED', `Request has already been ${request.status}`);
    }

    const scope = `request.decline:${requestId.toHexString()}`;
    const payload = { requestId: requestId.toHexString() };

    const { data: declinedResponse, replayed } = await membershipService.executeIdempotent({
      actorId,
      scope,
      key: idempotencyKey,
      payload,
      statusCode: 200,
      action: async (session) => {
        const resolved = await requestRepo.resolveRequest(requestId, 'declined', actorId, session);
        if (!resolved) {
          throw new AppError(409, 'REQUEST_ALREADY_RESOLVED', 'Request was already resolved');
        }

        const now = new Date();
        await auditService.recordAuditEvent(
          {
            hackathonId: request.hackathonId,
            teamId: request.teamId,
            actorId,
            action: 'request.declined',
            subjectId: requestId,
            occurredAt: now,
            requestId: traceRequestId
          },
          session
        );

        await outboxRepo.insertEvent(
          {
            hackathonId: request.hackathonId,
            teamId: request.teamId,
            scope: 'user',
            userId: request.applicantId,
            eventType: 'request.resolved',
            payload: {
              requestId: requestId.toHexString(),
              status: 'declined'
            }
          },
          session
        );

        const updated = (await requestRepo.findById(requestId, session))!;
        return this.toResponse(updated);
      }
    });

    return { request: declinedResponse, replayed };
  }

  async cancelRequest(params: {
    applicantId: ObjectId;
    requestId: ObjectId;
    traceRequestId: string;
    idempotencyKey?: string;
  }): Promise<{ request: JoinRequestResponse; replayed: boolean }> {
    const { applicantId, requestId, traceRequestId, idempotencyKey } = params;

    const request = await requestRepo.findById(requestId);
    if (!request) {
      throw new AppError(404, 'REQUEST_NOT_FOUND', 'Join request not found');
    }

    if (!request.applicantId.equals(applicantId)) {
      throw new AppError(403, 'FORBIDDEN', 'You can only cancel your own join requests');
    }

    if (request.status !== 'pending') {
      throw new AppError(409, 'REQUEST_ALREADY_RESOLVED', `Request is already ${request.status}`);
    }

    const scope = `request.cancel:${requestId.toHexString()}`;
    const payload = { requestId: requestId.toHexString() };

    const { data: canceledResponse, replayed } = await membershipService.executeIdempotent({
      actorId: applicantId,
      scope,
      key: idempotencyKey,
      payload,
      statusCode: 200,
      action: async (session) => {
        const canceled = await requestRepo.cancelRequest(requestId, applicantId, session);
        if (!canceled) {
          throw new AppError(409, 'REQUEST_ALREADY_RESOLVED', 'Request is no longer pending');
        }

        const now = new Date();
        await auditService.recordAuditEvent(
          {
            hackathonId: request.hackathonId,
            teamId: request.teamId,
            actorId: applicantId,
            action: 'request.canceled',
            subjectId: requestId,
            occurredAt: now,
            requestId: traceRequestId
          },
          session
        );

        const updated = (await requestRepo.findById(requestId, session))!;
        return this.toResponse(updated);
      }
    });

    return { request: canceledResponse, replayed };
  }

  async listTeamRequests(params: {
    actorId: ObjectId;
    teamId: ObjectId;
    status?: JoinRequestStatus;
    limit?: number;
    cursor?: string;
  }): Promise<{ requests: JoinRequestResponse[]; nextCursor: string | null }> {
    const { actorId, teamId, status, limit = 20, cursor } = params;

    const team = await teamRepo.findActiveById(teamId);
    if (!team) {
      throw new AppError(404, 'TEAM_NOT_FOUND', 'Team not found');
    }

    if (!team.leaderId.equals(actorId)) {
      throw new AppError(403, 'NOT_TEAM_LEADER', 'Only team leaders can inspect team join requests');
    }

    const cursorDate = cursor ? new Date(Buffer.from(cursor, 'base64url').toString('utf8')) : undefined;
    const records = await requestRepo.listByTeam(teamId, status, limit + 1, cursorDate);

    const hasMore = records.length > limit;
    const pageItems = hasMore ? records.slice(0, limit) : records;
    const nextCursor =
      hasMore && pageItems.length > 0
        ? Buffer.from(pageItems[pageItems.length - 1]!.createdAt.toISOString()).toString('base64url')
        : null;

    return {
      requests: pageItems.map((r) => this.toResponse(r)),
      nextCursor
    };
  }

  async listMyRequests(params: {
    applicantId: ObjectId;
    limit?: number;
    cursor?: string;
  }): Promise<{ requests: JoinRequestResponse[]; nextCursor: string | null }> {
    const { applicantId, limit = 20, cursor } = params;
    const cursorDate = cursor ? new Date(Buffer.from(cursor, 'base64url').toString('utf8')) : undefined;
    const records = await requestRepo.listByApplicant(applicantId, limit + 1, cursorDate);

    const hasMore = records.length > limit;
    const pageItems = hasMore ? records.slice(0, limit) : records;
    const nextCursor =
      hasMore && pageItems.length > 0
        ? Buffer.from(pageItems[pageItems.length - 1]!.createdAt.toISOString()).toString('base64url')
        : null;

    return {
      requests: pageItems.map((r) => this.toResponse(r)),
      nextCursor
    };
  }
}

export const requestService = new RequestService();

