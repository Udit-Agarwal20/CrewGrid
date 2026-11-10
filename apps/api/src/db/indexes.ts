import { Db } from 'mongodb';
import { logger } from '../observability/logger.js';

export async function initializeIndexes(db: Db): Promise<void> {
  logger.info('Initializing MongoDB indexes deterministically...');

  // 1. Users
  await db.collection('users').createIndex(
    { emailNormalized: 1 },
    { unique: true, name: 'uniq_email' }
  );
  await db.collection('users').createIndex(
    { handleNormalized: 1 },
    { unique: true, sparse: true, name: 'uniq_handle' }
  );
  await db.collection('users').createIndex(
    { discoverable: 1, updatedAt: -1, _id: -1 },
    { name: 'candidate_discovery' }
  );
  await db.collection('users').createIndex(
    { discoverable: 1, skills: 1 },
    { name: 'candidate_skills' }
  );
  await db.collection('users').createIndex(
    { discoverable: 1, timezone: 1 },
    { name: 'candidate_timezone' }
  );

  // 2. Sessions
  await db.collection('sessions').createIndex(
    { tokenHash: 1 },
    { unique: true, name: 'uniq_session_token' }
  );
  await db.collection('sessions').createIndex(
    { expiresAt: 1 },
    { expireAfterSeconds: 0, name: 'session_ttl' }
  );

  // 3. Hackathons
  await db.collection('hackathons').createIndex(
    { slug: 1 },
    { unique: true, name: 'uniq_hackathon_slug' }
  );

  // 4. Teams
  await db.collection('teams').createIndex(
    { hackathonId: 1, deletedAt: 1, updatedAt: -1, _id: -1 },
    { name: 'board_active_updated' }
  );
  await db.collection('teams').createIndex(
    { hackathonId: 1, deletedAt: 1, memberCount: 1 },
    { name: 'board_seats' }
  );
  await db.collection('teams').createIndex(
    { hackathonId: 1, deletedAt: 1, requiredSkills: 1, updatedAt: -1 },
    { name: 'board_skills' }
  );
  await db.collection('teams').createIndex(
    { hackathonId: 1, deletedAt: 1, name: 1 },
    { name: 'board_name_search' }
  );

  // 5. Memberships
  await db.collection('memberships').createIndex(
    { hackathonId: 1, userId: 1 },
    { unique: true, name: 'uniq_member_per_event' }
  );
  await db.collection('memberships').createIndex(
    { teamId: 1, joinedAt: 1, _id: 1 },
    { name: 'team_roster_succession' }
  );

  // 6. Join Requests
  await db.collection('join_requests').createIndex(
    { teamId: 1, applicantId: 1 },
    {
      unique: true,
      partialFilterExpression: { status: 'pending' },
      name: 'uniq_pending_request'
    }
  );
  await db.collection('join_requests').createIndex(
    { teamId: 1, status: 1, createdAt: -1 },
    { name: 'leader_request_queue' }
  );
  await db.collection('join_requests').createIndex(
    { applicantId: 1, status: 1, createdAt: -1 },
    { name: 'sent_requests' }
  );

  // 7. Invites
  await db.collection('invites').createIndex(
    { tokenHash: 1 },
    { unique: true, name: 'uniq_invite_hash' }
  );
  await db.collection('invites').createIndex(
    { teamId: 1, createdAt: -1 },
    { name: 'leader_invites' }
  );

  // 8. Idempotency Keys
  await db.collection('idempotency_keys').createIndex(
    { actorId: 1, scope: 1, key: 1 },
    { unique: true, name: 'uniq_idempotent_action' }
  );
  await db.collection('idempotency_keys').createIndex(
    { expiresAt: 1 },
    { expireAfterSeconds: 0, name: 'idempotency_ttl' }
  );

  // 9. Audit Events
  await db.collection('audit_events').createIndex(
    { teamId: 1, occurredAt: -1, _id: -1 },
    { name: 'team_audit_timeline' }
  );

  // 10. Realtime Events Outbox
  await db.collection('realtime_events').createIndex(
    { hackathonId: 1, createdAt: 1, _id: 1 },
    { name: 'event_dispatch' }
  );
  await db.collection('realtime_events').createIndex(
    { expiresAt: 1 },
    { expireAfterSeconds: 0, name: 'event_ttl' }
  );

  logger.info('MongoDB indexes initialized successfully.');
}

