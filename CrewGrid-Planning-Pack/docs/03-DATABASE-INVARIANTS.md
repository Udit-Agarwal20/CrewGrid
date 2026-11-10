# 03 — MongoDB Data Model, Indexes and Invariant Enforcement

**Read first:** `02-ARCHITECTURE-TRD.md` §3–4. This document is normative for database code; the API must not bypass it.

## 1. Database requirements

Use one MongoDB replica set; local single-node RS is acceptable for tests (test behavior of transactions, not cluster-failover guarantees). Use `ObjectId` internally and stringify as hex in API. Store dates as BSON Date in UTC. Store only SHA-256 hashes of session tokens and invite tokens. Add indexes on startup using explicit migrations/init script and record index versions. **Unique indexes are correctness guards, not optional performance tweaks.**

### Common fields and types

`_id: ObjectId`, `createdAt: Date`, `updatedAt: Date`, `hackathonId: ObjectId` where relevant. For logical deletion, `deletedAt: Date | null`; never set to a non-Date string. All user-visible strings have length limits, control character checks and normalized display variants. Use `version` integer for optimistic control when needed.

## 2. Collection schemas (logical contract)

### 2.1 `users`

| Field | Type / rule |
|---|---|
| `_id` | ObjectId |
| `emailNormalized` | string lowercase/trimmed, unique; **never publicly returned** |
| `passwordHash` | Argon2id encoded string, never public |
| `displayName` | 2–60 Unicode characters |
| `handleNormalized` | 3–24 ASCII slug, unique; optional if no profile yet |
| `bio` | 0–280 characters |
| `skills` | 0–15 normalized skill tags |
| `timezone` | valid IANA zone, e.g. `Asia/Kolkata` |
| `preferredHours` | `{startLocal:"18:00",endLocal:"22:00",days:[1,2,3,4,5]}`; same-day or overnight supported |
| `discoverableHackathonIds` | list of event ObjectIds user opted into |
| `createdAt/updatedAt` | Date |

**Note:** Skills can start free-text with normalization and server allowlist/synonyms, but avoid an exhaustive taxonomy. Ranking uses canonical tokens. Profiles must not leak email or credentials.

### 2.2 `hackathons`

| Field | Type / rule |
|---|---|
| `_id`, `slug`, `title` | identifiers and visible name |
| `minTeamSize`, `maxTeamSize` | positive integers with `min≤max` |
| `startsAt`, `endsAt`, `createdAt` | Date |
| `active` | boolean |

Demo fixture: `crewgrid-demo`, min 2 / max 5. A team may select a min/max within event policy; team min can equal 1 only when event allows it.

### 2.3 `teams`

| Field | Type / rule |
|---|---|
| `_id`, `hackathonId` | ObjectId |
| `name`, `description`, `requiredSkills` | sanitized public metadata |
| `leaderId` | user ObjectId who **must** have a membership when team is active |
| `minSize`, `maxSize` | positive int, within event range |
| `memberCount` | int 1..max if active, 0 if deleted |
| `version` | monotonic integer updated on every membership/resize/leadership change |
| `deletedAt` | null when active; Date when last member left |
| `createdAt`, `updatedAt` | Date |

**Important:** No independently stored `status:'ready'` flag; derive from `memberCount >= minSize`. For a deleted team `leaderId` can be retained as historical final leader ID (not active authority) to preserve audit context. API must always filter `deletedAt:null` for mutable team access.

### 2.4 `memberships`

| Field | Type / rule |
|---|---|
| `_id` | ObjectId |
| `hackathonId`, `teamId`, `userId` | ObjectIds |
| `joinedAt` | Date |

This collection holds **only current memberships**. Leaving removes its document inside a transaction; immutable departure record remains in `audit_events`. No `active` flag is necessary. The global unique `(hackathonId,userId)` index guarantees one team per hackathon. Add `(teamId,joinedAt,_id)` for succession and roster.

### 2.5 `join_requests`

| Field | Type / rule |
|---|---|
| `_id`, `hackathonId`, `teamId`, `applicantId` | ObjectIds |
| `status` | `pending | approved | declined | canceled | invalidated` |
| `message` | optional ≤280 char text |
| `resolvedBy` | ObjectId nullable |
| `resolvedAt` | Date nullable |
| `createdAt` | Date |

Only one **pending** request per `(teamId,applicantId)` by partial unique index. Historical requests retained. Applications do not reserve capacity. `invalidated` used when applicant becomes ineligible, if cleanup is performed.

### 2.6 `invites`

| Field | Type / rule |
|---|---|
| `_id`, `hackathonId`, `teamId`, `createdBy` | ObjectIds |
| `tokenHash` | SHA256 digest, unique; no raw token |
| `expiresAt` | Date |
| `revokedAt` | Date|null |
| `usedAt`, `usedBy` | Date|null, ObjectId|null |
| `createdAt` | Date |

Default invite is single use. Token has 32 cryptographic random bytes base64url encoded. `expiresAt` checked on every redemption. TTL cleanup optional (don't delete prematurely if audit must link token ID; audit contains invite ID and expiry separately). Single-use conditional update happens in the admission transaction.

### 2.7 `sessions`

| Field | Type / rule |
|---|---|
| `_id`, `userId` | ObjectIds |
| `tokenHash` | SHA256 of random session token, unique |
| `expiresAt` | Date |
| `createdAt`, `lastSeenAt`, `revokedAt` | Date|null |

Session expiry/revocation checked at request time regardless of TTL sweeper; set token only in `Secure; HttpOnly; SameSite=Lax` cookie on HTTPS. Local HTTPS absent -> `Secure:false` only in local development. Rotate on login / privilege changes when relevant.

### 2.8 `idempotency_keys`

| Field | Type / rule |
|---|---|
| `_id`, `actorId` | ObjectIds |
| `scope` | route-template + resource identifier (`team.create:{hackathonId}` etc.) |
| `key` | UUID string, 36 chars |
| `requestHash` | SHA256 of canonical validated input and route parameters |
| `responseStatus` | success HTTP status 2xx |
| `responseBody` | sanitized replayable JSON envelope |
| `createdAt`, `expiresAt` | Date |

Unique `(actorId,scope,key)`. Insert the successful result in same domain transaction. Replay only when hash matches. Redact tokens from replay results: on `createInvite`, do not store plaintext token in idempotency collection; either return a one-time token with a safe encrypted transient record or don't require idempotency on *invite-creation*, and make duplicate invite-creation non-destructive but avoid token replay risk. **Chosen MVP policy:** no required idempotency for invite-creation; its explicit API is an exception. Required idempotency applies to team create, approve, redeem, leave, transfer and remove. For invite redemption, payload token is hashed in fingerprint and excluded from stored response.

**Security note:** TTL 24h. Do not leak token hashes into logs. `responseBody` must never contain a session or raw invite token.

### 2.9 `audit_events`

| Field | Type / rule |
|---|---|
| `_id`, `hackathonId`, `teamId` | ObjectIds |
| `actorId` | user ObjectId, or `system` for automated cleanup with reason |
| `action` | typed enum: team.created/updated/deleted, member.joined/left/removed, leader.transferred, request.created/approved/declined/canceled, invite.created/revoked/redeemed |
| `subjectId` | optional target user/request/invite ObjectId |
| `changes` | safe before/after field names, no secrets |
| `occurredAt` | Date |
| `requestId` | correlation ID |

Append-only. Only include privacy-filtered entries in leader/team read view; raw audits not exposed to guests. Audits stored in **same transaction** as corresponding domain event. Historical event remains after team logical deletion.

### 2.10 `realtime_events` (transactional outbox)

| Field | Type / rule |
|---|---|
| `_id`, `hackathonId`, `teamId` | ObjectIds or optional |
| `userId` | optional target audience |
| `scope` | `public-hackathon | team | user` |
| `eventType` | enum `team.created`, `team.updated`, `member.joined`, `member.left`, `request.created`, `request.resolved`, `leader.transferred`, `team.deleted` |
| `payload` | minimal IDs + counts, no sensitive data |
| `createdAt`, `expiresAt` | Date; expiry after safe replay window |

Transaction writes event with audit and mutation. SSE dispatcher polls new events, subscribers authorized by event scope; page refetch is source of truth. Do not treat this as full enterprise queue delivery guarantee.

## 3. Index specification (create using migrations, not ad-hoc in request handlers)

```javascript
// NOTE: representative mongosh definitions; application must createIdempotently.
db.users.createIndex({ emailNormalized: 1 }, { unique: true, name: 'uniq_email' });
db.users.createIndex({ handleNormalized: 1 }, { unique: true, sparse: true, name: 'uniq_handle' });
db.hackathons.createIndex({ slug: 1 }, { unique: true, name: 'uniq_hackathon_slug' });
db.teams.createIndex({ hackathonId: 1, deletedAt: 1, updatedAt: -1, _id: -1 }, { name: 'board_active_updated' });
db.teams.createIndex({ hackathonId: 1, deletedAt: 1, memberCount: 1 }, { name: 'board_seats' });
db.memberships.createIndex({ hackathonId: 1, userId: 1 }, { unique: true, name: 'uniq_member_per_event' });
db.memberships.createIndex({ teamId: 1, joinedAt: 1, _id: 1 }, { name: 'team_roster_succession' });
db.join_requests.createIndex({ teamId: 1, applicantId: 1 }, {
  unique: true, partialFilterExpression: { status: 'pending' }, name: 'uniq_pending_request'
});
db.join_requests.createIndex({ teamId: 1, status: 1, createdAt: -1 }, { name: 'leader_request_queue' });
db.join_requests.createIndex({ applicantId: 1, status: 1, createdAt: -1 }, { name: 'sent_requests' });
db.invites.createIndex({ tokenHash: 1 }, { unique: true, name: 'uniq_invite_hash' });
db.invites.createIndex({ teamId: 1, createdAt: -1 }, { name: 'leader_invites' });
db.sessions.createIndex({ tokenHash: 1 }, { unique: true, name: 'uniq_session_token' });
db.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'session_ttl' });
db.idempotency_keys.createIndex({ actorId: 1, scope: 1, key: 1 }, { unique: true, name: 'uniq_idempotent_action' });
db.idempotency_keys.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'idempotency_ttl' });
db.audit_events.createIndex({ teamId: 1, occurredAt: -1, _id: -1 }, { name: 'team_audit_timeline' });
db.realtime_events.createIndex({ hackathonId: 1, createdAt: 1, _id: 1 }, { name: 'event_dispatch' });
db.realtime_events.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'event_ttl' });
```

**Potential critical MongoDB detail:** a user returning to an already-left team can have a *new* membership. That's valid; the audit records the old membership history. `teams.deletedAt:null` is a query predicate in active queries, not a partial unique index requirement.

## 4. Transactions and lock order

### 4.1 Write operations matrix

| Operation | Read preconditions | Writes in **one** transaction |
|---|---|---|
| Create team | event active, actor no membership | team, membership, audit, outbox, idempotency |
| Approve request | leader current, request pending, applicant eligible | team guarded increment, membership, request resolved, audit, outbox, idempotency |
| Redeem invite | token valid/unused, user eligible, seat free | team guarded increment, membership, invite used, audit, outbox, idempotency |
| Leave team | actor is member, team active | team decrement / successor or delete, membership delete, audit, outbox, idempotency |
| Remove member | current leader, target member not leader | team decrement, membership delete, audit, outbox, idempotency |
| Transfer leadership | current leader, target current member | team leaderId + version, audit, outbox, idempotency |
| Edit team | current leader, size policy, capacity safe | team guarded update/version, audit, outbox, idempotency |
| Request join | actor eligible, team exists, no pending duplicate | join_request, audit, outbox, idempotency if key supplied |
| Decline/cancel | authorized actor, request pending | join_request state, audit, outbox, idempotency if key supplied |
| Create/revoke invite | leader active, team active | invite, audit, outbox; token only returned to creator once |

### 4.2 Serialization strategy

Every membership-changing operation writes the **same team document** inside its transaction. This gives a contention point for seat allocation, leadership and resize. Unique membership index arbitrates cross-team races. Retry only transient DB errors; after retry check all preconditions again. Enforce upper time budget (e.g., 8–12s) and return `503 TEMPORARY_UNAVAILABLE` with safe client retry after key remains same, never partial success.

**Important subtlety:** A request may have a transient transaction error on an insert because another transaction committed first; driver can retry or unique-index collision may become a duplicate error. Translate it only *after checking committed state*: `ALREADY_IN_TEAM` or idempotency replay. Do not turn all duplicate key errors into generic 409 without determining which invariant triggered.

### 4.3 Request lifecycle transitions

```text
pending --leader approves successfully--> approved (membership exists)
        --leader declines-------------> declined
        --applicant cancels-----------> canceled
        --applicant joins elsewhere---> invalidated (or handled as stale during approval)
Terminal states have no transition back to pending; create a new request if business policy permits.
```

### 4.4 Audit + SSE ordering

`domain mutation + audit event + realtime outbox` commit atomically. A dispatcher may deliver events more than once; clients dedupe by eventId or simply invalidate/refetch. Never claim exactly-once SSE delivery. Failed/rolled-back write generates neither audit nor outbox. Log failed security attempts separately (security logs, not successful team-change audit).

## 5. Seed data contract

Local-only seed, deterministic (`--seed 2026`). Generates **exactly 10,000 synthetic users** and **2,000 active teams**. Assign ~6,000 users across teams with varied sizes subject to max 5; reserve ~4,000 unmatched users so discovery and team joining have candidates. Ensure every active team has leader and 1–5 members; choose minimum 2 for readiness status but allow 1-person Forming teams. Vary team timestamps/skills/timezones; cap join requests and invites to small sample subset to avoid unrealistic document churn. Print summary counts and invariant check. Clear target DB only when explicit `--reset --confirm-test-database`; refuse production DB URLs. All accounts use synthetic `example.test` addresses and fixture password hashes; no publicly accessible seeded login credentials except clearly documented safe demo accounts with restricted rights.

## 6. Consistency validator (must implement)

Write `scripts/verify-invariants.ts` to inspect all active teams and memberships, ideally via aggregate queries, and report:

1. No duplicate `(hackathonId,userId)` memberships.
2. Every active team has ≥1 and ≤ maxSize current memberships, count matches `memberCount`.
3. Each `leaderId` is present among team memberships.
4. Every membership references an active team and matching hackathon ID.
5. No deleted team has active memberships or a positive `memberCount`.
6. Unique pending request per team/applicant; used invite never redeemed twice.
7. No successful membership change without audit/outbox record (via requestId correlation for test harness).

Exit non-zero on any violation and report IDs of offending documents to local test log (do not reveal sensitive data in public artifacts). Run after concurrency and chaos tests.

## 7. Queries and projections

- Active board: `hackathonId`, `deletedAt:null`, optional `memberCount < maxSize` via `$expr`, sorted `(updatedAt desc,_id desc)`, cursor paging. Use index and `explain('executionStats')` to verify plan; avoid unindexed regex search at scale. Optional normalized prefix search on `nameNormalized` with appropriate index.
- Candidate board: opt-in users by event, then exclude membership with indexed lookup/aggregation; 10k user scope acceptable only after explain/benchmark. Avoid transferring all profiles to browser.
- Team members: membership query index by teamId; projection joins only public user fields.
- Audit: filtered teamId, sorted date descending, 20/page; only authorized members/leaders.
- Requests: teamId+status ordered createdAt; only leader sees whole team inbox.

## 8. Backup, retention, migration

Free deployment is demonstration, not a durable production SLA. Audit retention for demo: ≥30 days; session/idempotency/outbox TTL as defined; email deletion/privacy requests require separate real-production policy. Index creation is idempotent at startup, with error fail-fast on conflicts; never silently continue with missing unique indexes. Preserve `schemaVersion` migration script; seed not run on production startup. No automatic destructive migration.

## 9. Known limitations / review traps

- A MongoDB free cluster is capped at 100 operations/sec; API throughput measurements against that tier are not comparable to isolated local hardware.
- Single-node local RS proves transaction semantics but not multi-node failover.
- TTL deletion is asynchronous; validity must be checked by time in application code.
- Cursor and index choices are hypotheses; verify with explain plans and k6.
- Soft-deletion is a conscious interpretation of organizer's 'team deletes when last member leaves', preserving audit requirements while removing team from active product surface. Document it in the final design note.
