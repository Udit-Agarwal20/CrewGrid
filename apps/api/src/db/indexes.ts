import { Db, Collection, CreateIndexesOptions, IndexSpecification } from 'mongodb';
import { logger } from '../observability/logger.js';

async function ensureIndex(
  collection: Collection,
  keySpec: IndexSpecification,
  options: CreateIndexesOptions & { name: string }
): Promise<void> {
  try {
    await collection.createIndex(keySpec, options);
  } catch (err: any) {
    if (
      err?.code === 85 ||
      err?.codeName === 'IndexKeySpecsConflict' ||
      (typeof err?.message === 'string' && err.message.includes('existing index has the same name'))
    ) {
      logger.warn(`Index ${options.name} spec conflict on ${collection.collectionName}. Dropping and recreating...`);
      await collection.dropIndex(options.name);
      await collection.createIndex(keySpec, options);
    } else {
      throw err;
    }
  }
}

export async function initializeIndexes(db: Db): Promise<void> {
  logger.info('Initializing MongoDB indexes deterministically...');

  // 1. Users
  await ensureIndex(
    db.collection('users'),
    { emailNormalized: 1 },
    { unique: true, name: 'uniq_email' }
  );
  await ensureIndex(
    db.collection('users'),
    { handleNormalized: 1 },
    { unique: true, sparse: true, name: 'uniq_handle' }
  );
  await ensureIndex(
    db.collection('users'),
    { discoverable: 1, updatedAt: -1, _id: -1 },
    { name: 'candidate_discovery' }
  );
  await ensureIndex(
    db.collection('users'),
    { discoverable: 1, skills: 1, updatedAt: -1, _id: -1 },
    { name: 'candidate_skills' }
  );
  await ensureIndex(
    db.collection('users'),
    { discoverable: 1, timezone: 1, updatedAt: -1, _id: -1 },
    { name: 'candidate_timezone' }
  );

  // 2. Sessions
  await ensureIndex(
    db.collection('sessions'),
    { tokenHash: 1 },
    { unique: true, name: 'uniq_session_token' }
  );
  await ensureIndex(
    db.collection('sessions'),
    { expiresAt: 1 },
    { expireAfterSeconds: 0, name: 'session_ttl' }
  );

  // 3. Hackathons
  await ensureIndex(
    db.collection('hackathons'),
    { slug: 1 },
    { unique: true, name: 'uniq_hackathon_slug' }
  );

  // 4. Teams
  await ensureIndex(
    db.collection('teams'),
    { hackathonId: 1, deletedAt: 1, updatedAt: -1, _id: -1 },
    { name: 'board_active_updated' }
  );
  await ensureIndex(
    db.collection('teams'),
    { hackathonId: 1, deletedAt: 1, memberCount: 1 },
    { name: 'board_seats' }
  );
  await ensureIndex(
    db.collection('teams'),
    { hackathonId: 1, deletedAt: 1, requiredSkills: 1, updatedAt: -1, _id: -1 },
    { name: 'board_skills' }
  );
  await ensureIndex(
    db.collection('teams'),
    { hackathonId: 1, deletedAt: 1, name: 1 },
    { name: 'board_name_search' }
  );

  // 5. Memberships
  await ensureIndex(
    db.collection('memberships'),
    { hackathonId: 1, userId: 1 },
    { unique: true, name: 'uniq_member_per_event' }
  );
  await ensureIndex(
    db.collection('memberships'),
    { teamId: 1, joinedAt: 1, _id: 1 },
    { name: 'team_roster_succession' }
  );

  // 6. Join Requests
  await ensureIndex(
    db.collection('join_requests'),
    { teamId: 1, applicantId: 1 },
    {
      unique: true,
      partialFilterExpression: { status: 'pending' },
      name: 'uniq_pending_request'
    }
  );
  await ensureIndex(
    db.collection('join_requests'),
    { teamId: 1, status: 1, createdAt: -1 },
    { name: 'leader_request_queue' }
  );
  await ensureIndex(
    db.collection('join_requests'),
    { applicantId: 1, status: 1, createdAt: -1 },
    { name: 'sent_requests' }
  );

  // 7. Invites
  await ensureIndex(
    db.collection('invites'),
    { tokenHash: 1 },
    { unique: true, name: 'uniq_invite_hash' }
  );
  await ensureIndex(
    db.collection('invites'),
    { teamId: 1, createdAt: -1 },
    { name: 'leader_invites' }
  );

  // 8. Idempotency Keys
  await ensureIndex(
    db.collection('idempotency_keys'),
    { actorId: 1, scope: 1, key: 1 },
    { unique: true, name: 'uniq_idempotent_action' }
  );
  await ensureIndex(
    db.collection('idempotency_keys'),
    { expiresAt: 1 },
    { expireAfterSeconds: 0, name: 'idempotency_ttl' }
  );

  // 9. Audit Events
  await ensureIndex(
    db.collection('audit_events'),
    { teamId: 1, occurredAt: -1, _id: -1 },
    { name: 'team_audit_timeline' }
  );

  // 10. Realtime Events Outbox
  await ensureIndex(
    db.collection('realtime_events'),
    { hackathonId: 1, createdAt: 1, _id: 1 },
    { name: 'event_dispatch' }
  );
  await ensureIndex(
    db.collection('realtime_events'),
    { createdAt: 1, _id: 1 },
    { name: 'event_poller_lookup' }
  );
  await ensureIndex(
    db.collection('realtime_events'),
    { expiresAt: 1 },
    { expireAfterSeconds: 0, name: 'event_ttl' }
  );

  logger.info('MongoDB indexes initialized successfully.');
}

