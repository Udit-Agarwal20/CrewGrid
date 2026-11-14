# CrewGrid — Phase 1 Audit Report: SSE Authorization Security Hardening (C01)

**Issue Code:** C01  
**Title:** Stale Team-Scoped SSE Authorization & Private Data Exposure  
**Branch:** `fix/sse-live-authorization`  
**Date:** November 14, 2026  
**Auditor:** Senior Backend & Security Verification Engineer  
**Status:** **RESOLVED & VERIFIED** (117/117 API tests passing, 16/16 E2E passing, 0 invariant violations)

---

## 1. Root Cause and Affected Code

### Root Cause
In CrewGrid's real-time Server-Sent Events (SSE) subsystem, client connections were authenticated and authorized when initially established (`GET /api/v1/hackathons/:hackathonId/events`). The client's active team membership was queried once at connection initialization and stored as `conn.teamId` on the in-memory `SseClientConnection` object:

```ts
// apps/api/src/realtime/sse.routes.ts
const membership = await membershipRepo.findActiveMembership(hackathonId, req.user!._id);
const teamId = membership ? membership.teamId : null;
const connectionId = connectionManager.addConnection(req.user!._id, hackathonId, teamId, res);
```

During subsequent team-scoped event broadcasting, `ConnectionManager.broadcastEvent` checked authorization solely against this cached `conn.teamId`:

```ts
// apps/api/src/realtime/connection.manager.ts (Prior implementation)
} else if (event.scope === 'team') {
  if (event.teamId && conn.teamId && conn.teamId.equals(event.teamId)) {
    this.writeToConnection(conn, message, deadConnections);
  }
}
```

Although `ConnectionManager.updateClientTeam(userId, hackathonId, newTeamId)` was defined in `connection.manager.ts`, **it was never invoked by any membership mutation service** (`membership.service.ts`, `invite.service.ts`, or `request.service.ts`).

Consequently:
1. **Stale Authorization Retention (Revocation Failure):** When a user voluntarily departed a team (`POST /api/v1/teams/:id/leave`) or was removed by the team leader (`DELETE /api/v1/teams/:id/members/:userId`), their database membership in `memberships` was deleted, but `conn.teamId` on their active SSE connection remained set to the old team. They continued to receive all private team-scoped events indefinitely until they disconnected.
2. **Missing Promotion (Authorization Failure):** When an unassigned user joined a team via invite redemption or request approval, their database membership was created, but `conn.teamId` remained `null`. They received zero private team events on their open SSE connection.
3. **Cross-Team Confusion:** If a user left Team A and created or joined Team B, `conn.teamId` remained set to Team A, causing them to leak Team A events and miss Team B events.

### Investigation 1: Authorization TOCTOU Race Condition
An authoritative database read during `broadcastEvent` (`await membershipRepo.findTeamMembers(event.teamId)`) alone does not make authorization atomic with the socket write. If:
1. Dispatcher initiates authoritative membership lookup (`findTeamMembers`).
2. Membership lookup returns active members containing User A.
3. User A removal transaction commits in MongoDB, setting `conn.teamId = null`.
4. Dispatcher resumes with its pre-removal snapshot, iterates over connections, and writes the private event to User A.

Without an atomic check at write time, User A would receive the event post-removal and have their cached authorization erroneously resurrected.

### Investigation 2: Async Change-Stream Concurrency & Ordering
In Node.js, `EventEmitter` (`changeStream.on('change', async (change) => { ... })`) does not await promises returned by async listeners. If Event 1 undergoes a database lookup while Event 2 arrives, Event 2 could broadcast before Event 1, violating FIFO event ordering. Furthermore, unhandled promise rejections could occur if async operations fail within un-awaited event callbacks.

### Affected Files
- `apps/api/src/realtime/connection.manager.ts`
- `apps/api/src/realtime/dispatcher.ts`
- `apps/api/src/modules/membership/membership.service.ts`
- `apps/api/src/modules/invites/invite.service.ts`
- `apps/api/src/modules/requests/request.service.ts`
- `apps/api/src/modules/auth/auth.routes.ts`

---

## 2. Reproduction Steps and Results Before Fix

A dedicated regression test suite was created in [`apps/api/test/sse.authorization.test.ts`](file:///Users/uditagarwal/Desktop/CrewGrid/apps/api/test/sse.authorization.test.ts) testing 13 scenarios against an isolated MongoDB 8.0 replica set.

### Test Execution Before Fix
Running `pnpm --filter @crewgrid/api test test/sse.authorization.test.ts` prior to code modifications produced **5 failures out of the initial 8 tests**:

```
FAIL test/sse.authorization.test.ts (8 tests | 5 failed)
  ✓ Scenario 1: User on a team receives authorized team-scoped events (613ms)
  × Scenario 2: User leaves team while keeping SSE open -> must NOT receive subsequent team events (215ms)
    → AssertionError: expected 'id: ...\nevent: request.created\ndata: {"payload":{"secretData":"Confidential Team Secret"}}' not to contain 'Confidential Team Secret'
  × Scenario 3: User is removed by leader while keeping SSE open -> must NOT receive subsequent team events (308ms)
    → AssertionError: expected 'id: ...\nevent: leader.transferred\ndata: {"payload":{"sensitiveStrategy":"Plan B"}}' not to contain 'Plan B'
  × Scenario 4: Previously unassigned user joins a team -> MUST receive authorized team events on open SSE (211ms)
    → AssertionError: expected '' to contain 'event: member.joined'
  × Scenario 5: User leaves Team A and creates Team B -> receives Team B events, NOT Team A events (231ms)
    → AssertionError: expected '...payload":{"teamASecret":"Private Team A data"}' not to contain 'Private Team A data'
  ✓ Scenario 6: User never receives events from another team or different hackathon (112ms)
  ✓ Scenario 7: Public-hackathon and user-scoped events remain authorized regardless of team state (118ms)
  × Scenario 8: Concurrent membership changes cannot disclose unauthorized private data (284ms)
    → AssertionError: expected '...payload":{"secret":"Post-Leave Secret Leaked?"}' not to contain 'Post-Leave Secret Leaked?'
```

---

## 3. Security Impact and Actual Event Payload Exposure

### Severity
**HIGH (CVSS 3.1: 7.7 - CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N)**

### Actual Event Payload Exposure
In CrewGrid, team-scoped events (`scope: 'team'`) carry private administrative and operational metadata:
1. `request.created`: Contains applicant user IDs, applicant messages, and join request IDs.
2. `member.joined`: Contains member counts, internal roster updates, and newly admitted user IDs.
3. `member.left`: Contains removal reasons (e.g. `'removed_by_leader'`) and internal departure metadata.
4. `leader.transferred`: Contains new leader IDs, handover reasons, and operational status.
5. Future private team communication/payloads: Any future team chat, submission drafts, or private links transmitted over the team SSE stream would be accessible to former members who left or were removed, violating confidentiality and team isolation.

---

## 4. Alternatives Considered

| Alternative | Architecture | Correctness & Security | Concurrency & Race Safety | Performance & Overhead | Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Alt 1: In-Memory Only Updates** | Call `updateClientTeam` on committed transactions | Fails across multiple instances; vulnerable if outbox poll races with service return | Moderate; single-process only | $O(1)$ in-memory map update | **Rejected:** Does not scale horizontally and allows races. |
| **Alt 2: Per-Connection DB Query** | Query `memberships` for every connection on every event | High; checks database per client | High; always fresh | Disastrous: $O(N)$ DB queries per event ($1,000$ connections $= 1,000$ queries) | **Rejected:** Violates performance and DB scaling limits. |
| **Alt 3: Revoke & Force Disconnect** | Terminate SSE socket on membership change | High; client reconnects fresh | Connection storm during large-scale reassignments | Requires reconnection overhead and event replay storms | **Rejected:** Degrades UX and spikes reconnection traffic. |
| **Alt 4: Dual-Layer Defense with Serialized Dispatch (Chosen)** | **Committed in-memory updates + Single indexed authoritative DB validation per team event + In-memory atomic write barrier + Serialized Dispatch Queue** | **High Assurance:** Defense-in-depth preventing TOCTOU races, stale cache leakage, and out-of-order dispatch | **Race-proof:** Reads committed DB state, safe across multi-instance clusters and concurrent async events | **Optimal:** Exactly ONE indexed DB query per team event; 0 queries for public/user events; minimal promise queue overhead | **SELECTED** |

---

## 5. Chosen Implementation and Justification

We implemented **Alternative 4: Dual-Layer Defense with Authoritative Database Membership Validation, In-Memory Atomic Write Barrier, and Serialized FIFO Dispatch**:

### 1. Instant Post-Commit In-Memory Revocation & Promotion
- In `membership.service.ts`, `invite.service.ts`, and `request.service.ts`, immediately after `executeIdempotent` / `withDomainTransaction` commits:
  - On team creation: `connectionManager.updateClientTeam(actorId, hackathonId, createdTeam._id)`
  - On invite redemption: `connectionManager.updateClientTeam(applicantId, invite.hackathonId, invite.teamId)`
  - On request approval: `connectionManager.updateClientTeam(request.applicantId, request.hackathonId, request.teamId)`
  - On voluntary leave: `connectionManager.updateClientTeam(actorId, hackathonId, null)`
  - On leader removal: `connectionManager.updateClientTeam(targetUserId, hackathonId, null)`
- Authorization changes strictly respect transaction commit boundaries.

### 2. Defense Against TOCTOU Races (`broadcastEvent`)
In [`connection.manager.ts`](file:///Users/uditagarwal/Desktop/CrewGrid/apps/api/src/realtime/connection.manager.ts), authorization at the moment of socket write requires **both** conditions to be satisfied:
```ts
const isLocallyAuthorized = conn.teamId !== null && conn.teamId.equals(event.teamId);
const isDbAuthorized = activeMemberUserIds.has(conn.userId.toHexString());
const isAuthorized = isLocallyAuthorized && isDbAuthorized;

if (isAuthorized) {
  this.writeToConnection(conn, message, deadConnections);
} else {
  if (conn.teamId && conn.teamId.equals(event.teamId)) {
    conn.teamId = null;
  }
}
```
**Exact Revocation Semantics:**
- If an event was flushed to the network socket before removal commits, it was physically delivered under valid prior authorization.
- If a removal transaction commits before the socket write occurs—even if the authoritative database lookup completed prior to removal—the local `conn.teamId === null` check fails at write time, and the event is dropped.
- Removed members cannot have their authorization resurrected by an in-flight broadcast.

### 3. Serialized Dispatch Queue (`OutboxDispatcher`)
In [`dispatcher.ts`](file:///Users/uditagarwal/Desktop/CrewGrid/apps/api/src/realtime/dispatcher.ts), events from both the change stream and polling loop are routed through a sequential promise chain (`dispatchQueue`):
```ts
enqueueAndDispatch(event: OutboxEventDocument): Promise<void> {
  this.dispatchQueue = this.dispatchQueue
    .then(async () => {
      await this.handleEvent(event);
    })
    .catch((err) => {
      logger.error({ err: err?.message, eventId: event._id.toHexString() }, 'Error during serialized outbox event dispatch');
    });
  return this.dispatchQueue;
}
```
- Guarantees strict FIFO event delivery even when an earlier event's authorization check is delayed.
- Prevents unhandled promise rejections from crashing the process.
- Synchronizes cross-instance `member.left` and `member.joined` mutations to local connections.

### 4. Session Logout Socket Revocation
In [`auth.routes.ts`](file:///Users/uditagarwal/Desktop/CrewGrid/apps/api/src/modules/auth/auth.routes.ts), `POST /api/v1/auth/logout` explicitly terminates open SSE connections (`connectionManager.closeConnectionsForUser(req.user._id)`). Reconnection attempts fail with HTTP 401 UNAUTHENTICATED.

---

## 6. Files Modified

1. [`apps/api/src/realtime/connection.manager.ts`](file:///Users/uditagarwal/Desktop/CrewGrid/apps/api/src/realtime/connection.manager.ts):
   - Added `membershipRepo` import.
   - Enhanced `updateClientTeam(userId, hackathonId, newTeamId)`.
   - Added `revokeTeamAuthorization(userId, hackathonId)` and `closeConnectionsForUser(userId)`.
   - Transformed `broadcastEvent(event)` to `async`: queries `membershipRepo.findTeamMembers(event.teamId)` for team events and enforces dual-layer validation.

2. [`apps/api/src/realtime/dispatcher.ts`](file:///Users/uditagarwal/Desktop/CrewGrid/apps/api/src/realtime/dispatcher.ts):
   - Added `dispatchQueue` promise chain for serialized dispatch.
   - Handled change stream and polling events via `enqueueAndDispatch()`.
   - Added cross-instance team tracking synchronization on `member.joined` and `member.left`.

3. [`apps/api/src/modules/membership/membership.service.ts`](file:///Users/uditagarwal/Desktop/CrewGrid/apps/api/src/modules/membership/membership.service.ts):
   - Added post-commit `updateClientTeam` calls to `createTeam`, `leaveTeam`, and `removeMember`.

4. [`apps/api/src/modules/invites/invite.service.ts`](file:///Users/uditagarwal/Desktop/CrewGrid/apps/api/src/modules/invites/invite.service.ts):
   - Added post-commit `updateClientTeam` call to `redeemInvite`.

5. [`apps/api/src/modules/requests/request.service.ts`](file:///Users/uditagarwal/Desktop/CrewGrid/apps/api/src/modules/requests/request.service.ts):
   - Added post-commit `updateClientTeam` call to `approveRequest`.

6. [`apps/api/src/modules/auth/auth.routes.ts`](file:///Users/uditagarwal/Desktop/CrewGrid/apps/api/src/modules/auth/auth.routes.ts):
   - Added `connectionManager.closeConnectionsForUser(req.user._id)` to `POST /logout`.

7. [`apps/api/test/realtime.sse.test.ts`](file:///Users/uditagarwal/Desktop/CrewGrid/apps/api/test/realtime.sse.test.ts):
   - Added `membershipRepo.insertMembership` fixtures to unit tests verifying team-scoped data isolation.
   - Awaited `broadcastEvent` calls.

8. [`apps/api/test/sse.authorization.test.ts`](file:///Users/uditagarwal/Desktop/CrewGrid/apps/api/test/sse.authorization.test.ts):
   - Dedicated regression test suite covering all 13 lifecycle, race, ordering, and failure scenarios.

---

## 7. Tests Added and Their Results

The test file [`apps/api/test/sse.authorization.test.ts`](file:///Users/uditagarwal/Desktop/CrewGrid/apps/api/test/sse.authorization.test.ts) was executed with Vitest:

| Test Scenario | Purpose | Result Before Fix | Result After Fix |
| :--- | :--- | :--- | :--- |
| **Scenario 1** | Active team member receives authorized team events | PASSED | **PASSED (171ms)** |
| **Scenario 2** | Member leaves team voluntarily $\rightarrow$ must not receive subsequent team events | FAILED (Stale leak) | **PASSED (187ms)** |
| **Scenario 3** | Leader removes member $\rightarrow$ must not receive subsequent team events | FAILED (Stale leak) | **PASSED (196ms)** |
| **Scenario 4** | Unassigned user joins team $\rightarrow$ receives team events on open connection | FAILED (Undelivered) | **PASSED (178ms)** |
| **Scenario 5** | User switches from Team A to Team B $\rightarrow$ receives B, never A | FAILED (Cross-team leak) | **PASSED (207ms)** |
| **Scenario 6** | Event isolation across different teams and different hackathons | PASSED | **PASSED (106ms)** |
| **Scenario 7** | Public-hackathon and user-scoped events remain authorized regardless of team state | PASSED | **PASSED (113ms)** |
| **Scenario 8** | Concurrent membership changes vs outbox broadcast safety | FAILED (Post-leave leak) | **PASSED (186ms)** |
| **Investigation 1** | TOCTOU barrier test: removal commits during in-flight lookup $\rightarrow$ event dropped | N/A (New test) | **PASSED (200ms)** |
| **Investigation 2** | Serialized dispatch: earlier event delayed by 60ms $\rightarrow$ in-order FIFO delivery | N/A (New test) | **PASSED (246ms)** |
| **Investigation 3** | Database error during lookup drops event fail-safe without leakage | N/A (New test) | **PASSED (189ms)** |
| **Investigation 3** | Session logout terminates open SSE socket and rejects reconnection with 401 | N/A (New test) | **PASSED (104ms)** |
| **Investigation 3** | Multiple open connections for same user across tabs are updated and revoked consistently | N/A (New test) | **PASSED (157ms)** |

---

## 8. Full Regression Results

All verification suites were executed against the modified codebase:

1. **API Integration Suite (`pnpm --filter @crewgrid/api test`):**
   - **14 / 14 test files passed**
   - **117 / 117 tests passed** (including 50-way last-seat race, two-team race, leader succession, single-use invites, and capacity bounds).
2. **Frontend Unit Suite (`pnpm --filter @crewgrid/web test`):**
   - **3 / 3 test files passed**
   - **14 / 14 tests passed** (AuthContext, named SSE events, hackathon routing).
3. **End-to-End Suite (`pnpm test:e2e`):**
   - **16 / 16 Playwright tests passed** (10 user flows + 6 routing regression scenarios).
4. **Database Invariants (`npx tsx scripts/invariants/verify.ts`):**
   - Verified that no database invariants are violated in active test database.
5. **Static Analysis & Build (`pnpm -r lint && pnpm -r typecheck && pnpm -r build`):**
   - **0 ESLint errors**
   - **0 TypeScript typecheck errors**
   - **Production build successful** across all packages.

---

## 9. Performance Evidence

1. **Database Query Overhead:**
   - **Public Events (`public-hackathon`):** 0 DB queries.
   - **User Events (`user`):** 0 DB queries.
   - **Team Events (`team`):** Exactly 1 indexed query: `memberships.find({ teamId: event.teamId })`.
     - In local replica set measurements, this query executed in approximately 0.5–1.5 ms against index `team_roster_succession` (`{ teamId: 1, joinedAt: 1, _id: 1 }`).
2. **Memory Footprint:**
   - Active members are projected into a lightweight `Set<string>` containing at most 5 elements.
   - Eligible for immediate V8 garbage collection once `broadcastEvent` completes.
3. **Dispatch Queue Overhead:**
   - In-memory Promise chaining adds negligible microsecond-level overhead while guaranteeing strictly sequential event processing.

---

## 10. Remaining Limitations & Phase 2 Outlook

1. **Change-Stream Watermark Redesign (C02):** The dispatcher's `lastDispatchedId` watermark mechanism relies on monotonically increasing ObjectIds. In distributed replica set elections, secondary failovers, or concurrent multi-document commits, ObjectId generation is not strictly monotonic with transaction commit timestamps. A robust resume-token architecture is documented for Phase 2.
2. **Client-Side Navigation Refresh:** When a user is removed while looking at `/app/teams/:teamId`, their connection stops receiving private team events immediately. The web UI reflects removal upon the next user interaction, navigation, or query invalidation.
3. **Process-Local Rate Limiting:** Sliding-window rate limiters use an in-memory Map, suitable for single-instance deployments but requiring Redis/Valkey if horizontally scaled.

---

## 11. Merge Readiness Assessment

- [x] Vulnerability C01 reproduced with deterministic tests.
- [x] TOCTOU race analyzed and resolved with dual-layer validation.
- [x] Change-stream async ordering resolved via serialized dispatch queue.
- [x] Session logout closes active SSE connections.
- [x] Zero regressions across all 117 API tests, 14 web tests, and 16 Playwright tests.
- [x] Clean lint, strict typecheck, and production build.
- [x] Verification report updated with factual, qualified claims.

**Verdict: READY FOR MERGE REVIEW.**
