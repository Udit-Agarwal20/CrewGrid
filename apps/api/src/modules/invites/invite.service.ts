import crypto from 'node:crypto';
import { ObjectId } from 'mongodb';
import { inviteRepo, InviteDocument } from './invite.repo.js';
import { teamRepo } from '../teams/team.repo.js';
import { membershipService } from '../membership/membership.service.js';
import { auditService } from '../audit/audit.service.js';
import { env } from '../../config/env.js';
import { AppError, InviteResponse, InviteStatus, TeamResponse } from '@crewgrid/contracts';

export function hashInviteToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export class InviteService {
  getInviteStatus(doc: InviteDocument): InviteStatus {
    if (doc.usedAt) return 'used';
    if (doc.revokedAt) return 'revoked';
    if (doc.expiresAt <= new Date()) return 'expired';
    return 'available';
  }

  toResponse(doc: InviteDocument, rawToken?: string): InviteResponse {
    const status = this.getInviteStatus(doc);
    const resp: InviteResponse = {
      id: doc._id.toHexString(),
      expiresAt: doc.expiresAt.toISOString(),
      status
    };

    if (rawToken) {
      resp.token = rawToken;
      resp.redeemUrl = `${env.APP_ORIGIN}/invite#token=${rawToken}`;
    }

    return resp;
  }

  async createInvite(params: {
    actorId: ObjectId;
    teamId: ObjectId;
    expiresInHours?: number;
    traceRequestId: string;
  }): Promise<InviteResponse> {
    const { actorId, teamId, expiresInHours = 24, traceRequestId } = params;

    const team = await teamRepo.findActiveById(teamId);
    if (!team) {
      throw new AppError(404, 'TEAM_NOT_FOUND', 'Team not found');
    }

    if (!team.leaderId.equals(actorId)) {
      throw new AppError(403, 'NOT_TEAM_LEADER', 'Only team leaders can generate invite links');
    }

    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = hashInviteToken(rawToken);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresInHours * 60 * 60 * 1000);

    const doc = await inviteRepo.createInvite({
      hackathonId: team.hackathonId,
      teamId,
      createdBy: actorId,
      tokenHash,
      expiresAt,
      revokedAt: null,
      usedAt: null,
      usedBy: null,
      createdAt: now
    });

    await auditService.recordAuditEvent({
      hackathonId: team.hackathonId,
      teamId,
      actorId,
      action: 'invite.created',
      subjectId: doc._id,
      changes: { expiresInHours },
      occurredAt: now,
      requestId: traceRequestId
    });

    return this.toResponse(doc, rawToken);
  }

  async revokeInvite(params: {
    actorId: ObjectId;
    teamId: ObjectId;
    inviteId: ObjectId;
    traceRequestId: string;
  }): Promise<void> {
    const { actorId, teamId, inviteId, traceRequestId } = params;

    const team = await teamRepo.findActiveById(teamId);
    if (!team || !team.leaderId.equals(actorId)) {
      throw new AppError(403, 'NOT_TEAM_LEADER', 'Only team leaders can revoke invites');
    }

    const invite = await inviteRepo.findById(inviteId);
    if (!invite || !invite.teamId.equals(teamId)) {
      throw new AppError(404, 'INVITE_NOT_FOUND', 'Invitation not found');
    }

    if (invite.usedAt) {
      throw new AppError(409, 'INVITE_USED', 'Cannot revoke an already used invite');
    }

    const revoked = await inviteRepo.revokeInvite(inviteId);
    if (!revoked) {
      throw new AppError(409, 'INVITE_REVOKED', 'Invite has already been revoked or used');
    }

    const now = new Date();
    await auditService.recordAuditEvent({
      hackathonId: team.hackathonId,
      teamId,
      actorId,
      action: 'invite.revoked',
      subjectId: inviteId,
      occurredAt: now,
      requestId: traceRequestId
    });
  }

  async redeemInvite(params: {
    applicantId: ObjectId;
    rawToken: string;
    traceRequestId: string;
    idempotencyKey?: string;
  }): Promise<{ team: TeamResponse; replayed: boolean }> {
    const { applicantId, rawToken, traceRequestId, idempotencyKey } = params;

    const tokenHash = hashInviteToken(rawToken);
    const invite = await inviteRepo.findByTokenHash(tokenHash);

    if (!invite) {
      throw new AppError(404, 'INVITE_NOT_FOUND', 'Invalid or unknown invite token');
    }

    if (invite.revokedAt) {
      throw new AppError(409, 'INVITE_REVOKED', 'This invitation has been revoked by the team leader');
    }

    if (invite.usedAt) {
      throw new AppError(409, 'INVITE_USED', 'This invitation has already been redeemed');
    }

    if (invite.expiresAt <= new Date()) {
      throw new AppError(409, 'INVITE_EXPIRED', 'This invitation has expired');
    }

    const scope = `invite.redeem:${tokenHash}`;
    const payload = { tokenHash };

    const { data: updatedTeam, replayed } = await membershipService.executeIdempotent({
      actorId: applicantId,
      scope,
      key: idempotencyKey,
      payload,
      statusCode: 200,
      action: async (session) => {
        const { team } = await membershipService.admitMemberInTransaction({
          session,
          actorId: applicantId,
          teamId: invite.teamId,
          applicantId,
          source: 'invite',
          inviteId: invite._id,
          traceRequestId
        });

        return membershipService.toTeamResponse(team, applicantId);
      }
    });

    return { team: updatedTeam, replayed };
  }

  async listTeamInvites(params: { actorId: ObjectId; teamId: ObjectId }): Promise<InviteResponse[]> {
    const { actorId, teamId } = params;

    const team = await teamRepo.findActiveById(teamId);
    if (!team) {
      throw new AppError(404, 'TEAM_NOT_FOUND', 'Team not found');
    }

    if (!team.leaderId.equals(actorId)) {
      throw new AppError(403, 'NOT_TEAM_LEADER', 'Only team leaders can inspect invitations');
    }

    const invites = await inviteRepo.listByTeam(teamId);
    return invites.map((inv) => this.toResponse(inv));
  }
}

export const inviteService = new InviteService();

