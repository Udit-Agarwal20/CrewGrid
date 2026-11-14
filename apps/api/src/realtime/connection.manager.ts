import { Response } from 'express';
import { ObjectId } from 'mongodb';
import crypto from 'node:crypto';
import { OutboxEventDocument } from './outbox.repo.js';
import { membershipRepo } from '../modules/membership/membership.repo.js';
import { logger } from '../observability/logger.js';

export interface SseClientConnection {
  connectionId: string;
  userId: ObjectId;
  hackathonId: ObjectId;
  teamId: ObjectId | null;
  res: Response;
  connectedAt: Date;
}

export class ConnectionManager {
  private connections = new Map<string, SseClientConnection>();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startHeartbeat();
  }

  private startHeartbeat(): void {
    if (this.heartbeatInterval) return;
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 20_000);
    // Unref so heartbeat doesn't prevent process exit in tests
    if (this.heartbeatInterval.unref) {
      this.heartbeatInterval.unref();
    }
  }

  addConnection(
    userId: ObjectId,
    hackathonId: ObjectId,
    teamId: ObjectId | null,
    res: Response
  ): string {
    const connectionId = crypto.randomUUID();
    const conn: SseClientConnection = {
      connectionId,
      userId,
      hackathonId,
      teamId,
      res,
      connectedAt: new Date()
    };

    this.connections.set(connectionId, conn);
    logger.debug(
      { connectionId, userId: userId.toHexString(), hackathonId: hackathonId.toHexString() },
      'SSE client connected'
    );

    return connectionId;
  }

  removeConnection(connectionId: string): void {
    const conn = this.connections.get(connectionId);
    if (conn) {
      this.connections.delete(connectionId);
      logger.debug({ connectionId }, 'SSE client disconnected');
    }
  }

  updateClientTeam(userId: ObjectId, hackathonId: ObjectId | undefined, newTeamId: ObjectId | null): void {
    for (const conn of this.connections.values()) {
      if (conn.userId.equals(userId)) {
        if (!hackathonId || conn.hackathonId.equals(hackathonId)) {
          conn.teamId = newTeamId;
        }
      }
    }
    logger.debug(
      {
        userId: userId.toHexString(),
        hackathonId: hackathonId ? hackathonId.toHexString() : 'all',
        newTeamId: newTeamId ? newTeamId.toHexString() : null
      },
      'Updated client team authorization'
    );
  }

  revokeTeamAuthorization(userId: ObjectId, hackathonId?: ObjectId): void {
    this.updateClientTeam(userId, hackathonId, null);
  }

  getActiveConnectionsCount(): number {
    return this.connections.size;
  }

  getConnectionsForHackathon(hackathonId: ObjectId): SseClientConnection[] {
    const list: SseClientConnection[] = [];
    for (const conn of this.connections.values()) {
      if (conn.hackathonId.equals(hackathonId)) {
        list.push(conn);
      }
    }
    return list;
  }

  formatSseMessage(event: OutboxEventDocument): string {
    const data = JSON.stringify({
      eventId: event._id.toHexString(),
      eventType: event.eventType,
      hackathonId: event.hackathonId.toHexString(),
      scope: event.scope,
      teamId: event.teamId ? event.teamId.toHexString() : null,
      userId: event.userId ? event.userId.toHexString() : null,
      occurredAt: event.createdAt.toISOString(),
      payload: event.payload
    });

    return `id: ${event._id.toHexString()}\nevent: ${event.eventType}\ndata: ${data}\n\n`;
  }

  async broadcastEvent(event: OutboxEventDocument): Promise<void> {
    const message = this.formatSseMessage(event);
    const deadConnections: string[] = [];

    // Authoritative check for team-scoped events: query committed database memberships
    let activeMemberUserIds: Set<string> | null = null;
    if (event.scope === 'team' && event.teamId) {
      try {
        const members = await membershipRepo.findTeamMembers(event.teamId);
        activeMemberUserIds = new Set(members.map((m) => m.userId.toHexString()));
      } catch (err: any) {
        logger.error(
          { err: err.message, teamId: event.teamId.toHexString() },
          'Error querying team members for SSE broadcast authorization'
        );
        // Fail-safe: empty set prevents unauthorized data leakage
        activeMemberUserIds = new Set();
      }
    }

    for (const conn of this.connections.values()) {
      if (!conn.hackathonId.equals(event.hackathonId)) {
        continue;
      }

      // Check scope authorization
      if (event.scope === 'public-hackathon') {
        // Public event: delivered to all subscribers of this hackathon
        this.writeToConnection(conn, message, deadConnections);
      } else if (event.scope === 'team') {
        // Team event: authoritatively verify against active database membership
        if (event.teamId && activeMemberUserIds) {
          const isMember = activeMemberUserIds.has(conn.userId.toHexString());
          if (isMember) {
            // Self-heal / update cached teamId if outdated
            if (!conn.teamId || !conn.teamId.equals(event.teamId)) {
              conn.teamId = event.teamId;
            }
            this.writeToConnection(conn, message, deadConnections);
          } else {
            // Stale cache defense: if connection was previously cached for this team, revoke it
            if (conn.teamId && conn.teamId.equals(event.teamId)) {
              conn.teamId = null;
            }
          }
        }
      } else if (event.scope === 'user') {
        // User event: delivered only to targeted user
        if (event.userId && conn.userId.equals(event.userId)) {
          this.writeToConnection(conn, message, deadConnections);
        }
      }
    }

    for (const deadId of deadConnections) {
      this.removeConnection(deadId);
    }
  }

  private writeToConnection(
    conn: SseClientConnection,
    message: string,
    deadConnections: string[]
  ): void {
    try {
      conn.res.write(message);
      if (typeof (conn.res as any).flush === 'function') {
        (conn.res as any).flush();
      }
    } catch {
      deadConnections.push(conn.connectionId);
    }
  }

  sendHeartbeat(): void {
    const deadConnections: string[] = [];
    for (const conn of this.connections.values()) {
      try {
        conn.res.write(': keepalive\n\n');
        if (typeof (conn.res as any).flush === 'function') {
          (conn.res as any).flush();
        }
      } catch {
        deadConnections.push(conn.connectionId);
      }
    }
    for (const deadId of deadConnections) {
      this.removeConnection(deadId);
    }
  }

  closeAll(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    for (const conn of this.connections.values()) {
      try {
        conn.res.end();
      } catch {
        // ignore
      }
    }
    this.connections.clear();
  }
}

export const connectionManager = new ConnectionManager();
