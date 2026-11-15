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
  tokenHash?: string;
  connectedAt: Date;
  buffering?: boolean;
  buffer?: OutboxEventDocument[];
  flushing?: boolean;
}

export const MAX_HANDSHAKE_BUFFER_SIZE = 100;

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
    res: Response,
    tokenHash?: string,
    options?: { buffering?: boolean }
  ): string {
    const connectionId = crypto.randomUUID();
    const conn: SseClientConnection = {
      connectionId,
      userId,
      hackathonId,
      teamId,
      res,
      tokenHash,
      connectedAt: new Date(),
      buffering: options?.buffering ?? false,
      buffer: options?.buffering ? [] : undefined
    };

    this.connections.set(connectionId, conn);
    logger.debug(
      { connectionId, userId: userId.toHexString(), hackathonId: hackathonId.toHexString() },
      'SSE client connected'
    );

    return connectionId;
  }

  getClientTeamId(connectionId: string): ObjectId | null {
    const conn = this.connections.get(connectionId);
    return conn ? conn.teamId : null;
  }

  async flushBuffer(connectionId: string, replayedEventIds?: Set<string>): Promise<void> {
    const conn = this.connections.get(connectionId);
    if (!conn || !conn.buffering || conn.flushing) return;
    conn.flushing = true;

    const MAX_FLUSH_PASSES = 10;
    let pass = 0;
    let totalFlushed = 0;
    const deadConnections: string[] = [];

    try {
      while (pass < MAX_FLUSH_PASSES) {
        pass++;
        const batch = conn.buffer || [];
        conn.buffer = [];

        for (const event of batch) {
          if (replayedEventIds && replayedEventIds.has(event._id.toHexString())) {
            continue;
          }

          totalFlushed++;

          // Re-verify authorization at socket delivery boundary (Investigation 2 fix)
          let isAuthorized = false;
          if (event.scope === 'public-hackathon') {
            isAuthorized = true;
          } else if (event.scope === 'team') {
            if (event.teamId && conn.teamId && conn.teamId.equals(event.teamId)) {
              try {
                const active = await membershipRepo.findActiveMembership(conn.hackathonId, conn.userId);
                if (active && active.teamId.equals(event.teamId)) {
                  isAuthorized = true;
                } else {
                  // Stale cache defense: clear revoked team authorization
                  conn.teamId = null;
                }
              } catch {
                // Fail safe on transient DB failure
                isAuthorized = false;
              }
            }
          } else if (event.scope === 'user') {
            if (event.userId && conn.userId.equals(event.userId)) {
              isAuthorized = true;
            }
          }

          if (isAuthorized) {
            const message = this.formatSseMessage(event);
            this.writeToConnection(conn, message, deadConnections);
          }
        }

        if (!this.connections.has(connectionId)) {
          break;
        }

        if (!conn.buffer || conn.buffer.length === 0) {
          conn.buffering = false;
          conn.buffer = undefined;
          break;
        }

        if (pass >= MAX_FLUSH_PASSES || totalFlushed >= MAX_HANDSHAKE_BUFFER_SIZE) {
          logger.warn(
            { connectionId: conn.connectionId, pass, totalFlushed, bufferLength: conn.buffer?.length },
            'Flush buffer drain limit reached under sustained throughput: triggering sync.gap fallback'
          );
          conn.buffering = false;
          conn.buffer = undefined;
          try {
            conn.res.write(this.formatSyncGapMessage(conn.hackathonId, 'overflow'));
            if (typeof (conn.res as any).flush === 'function') {
              (conn.res as any).flush();
            }
          } catch {
            deadConnections.push(conn.connectionId);
          }
          break;
        }
      }

      for (const deadId of deadConnections) {
        this.removeConnection(deadId);
      }
    } catch (err) {
      conn.buffering = false;
      conn.buffer = undefined;
      throw err;
    } finally {
      conn.flushing = false;
    }
  }

  removeConnection(connectionId: string): void {
    const conn = this.connections.get(connectionId);
    if (conn) {
      this.connections.delete(connectionId);
      logger.debug({ connectionId }, 'SSE client disconnected');
    }
  }

  updateClientTeam(
    userId: ObjectId,
    hackathonId: ObjectId | undefined,
    newTeamId: ObjectId | null,
    expectedCurrentTeamId?: ObjectId | null
  ): void {
    for (const conn of this.connections.values()) {
      if (conn.userId.equals(userId)) {
        if (!hackathonId || conn.hackathonId.equals(hackathonId)) {
          // If revoking (newTeamId === null) and expectedCurrentTeamId is specified,
          // only clear if the connection's current teamId matches expectedCurrentTeamId.
          if (newTeamId === null && expectedCurrentTeamId && conn.teamId && !conn.teamId.equals(expectedCurrentTeamId)) {
            continue;
          }
          conn.teamId = newTeamId;
        }
      }
    }
    logger.debug(
      {
        userId: userId.toHexString(),
        hackathonId: hackathonId ? hackathonId.toHexString() : 'all',
        newTeamId: newTeamId ? newTeamId.toHexString() : null,
        expectedCurrentTeamId: expectedCurrentTeamId ? expectedCurrentTeamId.toHexString() : null
      },
      'Updated client team authorization'
    );
  }

  revokeTeamAuthorization(userId: ObjectId, hackathonId?: ObjectId): void {
    this.updateClientTeam(userId, hackathonId, null);
  }

  /**
   * Session-scoped SSE connection termination used during regular logout.
   * Closes only connections opened under the specific session (e.g. tabs in that browser).
   */
  closeConnectionsForSession(tokenHash: string): number {
    const toRemove: string[] = [];
    for (const [id, conn] of this.connections.entries()) {
      if (conn.tokenHash === tokenHash) {
        try {
          conn.res.end();
        } catch {
          // ignore
        }
        toRemove.push(id);
      }
    }
    for (const id of toRemove) {
      this.connections.delete(id);
    }
    if (toRemove.length > 0) {
      logger.debug({ tokenHash, closedCount: toRemove.length }, 'Closed SSE connections for session');
    }
    return toRemove.length;
  }

  /**
   * Account-wide SSE connection termination preserved as an explicit, separate operation.
   * Used for security events such as account suspension, full password reset, or admin revocation.
   * Normal logout must NOT invoke this method, to preserve independent multi-device sessions.
   */
  closeConnectionsForUser(userId: ObjectId): number {
    const toRemove: string[] = [];
    for (const [id, conn] of this.connections.entries()) {
      if (conn.userId.equals(userId)) {
        try {
          conn.res.end();
        } catch {
          // ignore
        }
        toRemove.push(id);
      }
    }
    for (const id of toRemove) {
      this.connections.delete(id);
    }
    if (toRemove.length > 0) {
      logger.debug({ userId: userId.toHexString(), closedCount: toRemove.length }, 'Closed SSE connections for user');
    }
    return toRemove.length;
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

  formatSyncGapMessage(_hackathonId: ObjectId, reason: 'overflow' | 'expired' | 'fallback'): string {
    const data = JSON.stringify({
      gap: true,
      reason
    });
    // Omit synthetic id line to prevent corrupting the client's Last-Event-ID replay cursor
    return `event: sync.gap\ndata: ${data}\n\n`;
  }

  async broadcastEvent(event: OutboxEventDocument): Promise<{ authError?: boolean }> {
    const message = this.formatSseMessage(event);
    const deadConnections: string[] = [];
    let authError = false;

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
        authError = true;
      }
    }

    for (const conn of this.connections.values()) {
      if (!conn.hackathonId.equals(event.hackathonId)) {
        continue;
      }

      // Check scope authorization
      if (event.scope === 'public-hackathon') {
        // Public event: delivered to all subscribers of this hackathon
        this.deliverToConnection(conn, event, message, deadConnections);
      } else if (event.scope === 'team') {
        // Team event: authoritatively verify against active database membership
        if (event.teamId && activeMemberUserIds) {
          // Defense against TOCTOU race: both in-memory unrevoked state AND authoritative DB membership must hold at write time
          const isLocallyAuthorized = conn.teamId !== null && conn.teamId.equals(event.teamId);
          const isDbAuthorized = activeMemberUserIds.has(conn.userId.toHexString());
          const isAuthorized = isLocallyAuthorized && isDbAuthorized;

          if (isAuthorized) {
            this.deliverToConnection(conn, event, message, deadConnections);
          } else if (!authError) {
            // Stale cache defense: only revoke if DB query succeeded and confirmed user is no longer a member
            if (conn.teamId && conn.teamId.equals(event.teamId)) {
              conn.teamId = null;
            }
          }
        }
      } else if (event.scope === 'user') {
        // User event: delivered only to targeted user
        if (event.userId && conn.userId.equals(event.userId)) {
          this.deliverToConnection(conn, event, message, deadConnections);
        }
      }
    }

    for (const deadId of deadConnections) {
      this.removeConnection(deadId);
    }

    return { authError };
  }

  private deliverToConnection(
    conn: SseClientConnection,
    event: OutboxEventDocument,
    message: string,
    deadConnections: string[]
  ): void {
    if (conn.buffering) {
      if (!conn.buffer) {
        conn.buffer = [];
      }
      // Hard buffer limit: if handshake buffer exceeds limit, trigger safe sync.gap and clear buffer
      if (conn.buffer.length >= MAX_HANDSHAKE_BUFFER_SIZE) {
        logger.warn(
          { connectionId: conn.connectionId, bufferLength: conn.buffer.length },
          'Handshake buffer overflow: forcing sync.gap'
        );
        conn.buffer = [];
        conn.buffering = false;
        try {
          conn.res.write(this.formatSyncGapMessage(conn.hackathonId, 'overflow'));
          if (typeof (conn.res as any).flush === 'function') {
            (conn.res as any).flush();
          }
        } catch {
          deadConnections.push(conn.connectionId);
        }
        return;
      }
      conn.buffer.push(event);
      return;
    }
    this.writeToConnection(conn, message, deadConnections);
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
