# CrewGrid — Phase 2 Audit Report: Outbox & SSE Delivery Reliability (C02)

**Issue Code:** C02  
**Title:** Missed, Duplicated, or Incorrectly Ordered Real-Time Outbox & SSE Events  
**Branch:** `fix/outbox-delivery-reliability`  
**Baseline Commit:** `45866db` (PR #1 merged into `main`)  
**Date:** November 14–15, 2026  
**Auditor:** Senior Distributed Systems & Reliability Engineer  
**Status:** **RESOLVED & VERIFIED** (145/145 API tests passing across 15 test files, 16/16 Web tests, 16/16 Playwright E2E tests passing, 0 invariant violations)

---

## 1. Executive Summary & Review Context

This audit evaluates the reliability, delivery semantics, and failure recovery of CrewGrid's real-time messaging subsystem. CrewGrid pairs MongoDB multi-document transactions with Server-Sent Events (SSE) to notify browser clients of hackathon and team mutations.

Following initial C02 implementation and hardening, two independent critical reviews were conducted:
1. **Critical Review 1 (Investigations 1–5):** Addressed handshake registration races, buffered authorization leakage, poller lookback index deficiency, premature resume token advancement, and SSE cursor corruption.
2. **Merge-Blocking Review 2 (Findings 1–3):** Addressed commit buffer ordering under polling fallback, direct replay authorization TOCTOU gaps, and poller starvation beyond 1,000 records.

This revised audit report documents:
- The root causes and deterministic reproduction failures for all investigated defects.
- The verified fixes across backend (`apps/api`) and frontend (`apps/web`).
- The distinction between guaranteed commit-ordered live delivery and best-effort polling fallback notification.
- Tested evidence and honest architectural boundaries.

---

## 2. Root Cause Analysis & Review Findings

### Initial C02 Baseline Defects

1. **Non-Monotonic ObjectId Commit vs Allocation Race:**  
   MongoDB `ObjectId` values are generated on the client/driver side at instantiation time (`new ObjectId()`). If Transaction B commits at $T_1$ with a higher `_id` than Transaction A committing at $T_2 > T_1$, strict monotonic ObjectId comparison (`_id <= lastDispatchedId`) permanently discarded Transaction A's outbox events.
2. **Process Restart Skip Window:**  
   Startup watermark initialization (`find().sort({ _id: -1 }).limit(1)`) jumped past un-dispatched events committed during process restarts.
3. **Replay-to-Live Handshake Registration Gap:**  
   In `sse.routes.ts`, querying replay events prior to registering the connection in `ConnectionManager` created a window where events committed during handshake were neither replayed nor broadcast.
4. **Silent Replay Truncation and TTL Eviction Blind Spot:**  
   A hardcoded `limit: 50` truncated replay without signaling data gaps; client reconnects with TTL-evicted `Last-Event-ID` returned partial/empty events silently.
5. **Unrecovered Change Stream Disconnect:**  
   Change stream error handlers did not preserve resume tokens (`change._id`), failing to resume after network blips.
6. **Transient Authorization Lookup Failure Event Loss:**  
   Database lookup timeouts during broadcast resulted in un-retried event drops and cached authorization invalidation.

---

### Critical Review 1 Findings (Investigations 1–5)

1. **Non-Monotonic ObjectId Replay & Handshake Arrival (Investigation 1):**  
   `getReplayEvents()` queried `{ _id: { $gt: lastEventId } }` sorted by `_id: 1`. If Event B (higher `_id`) committed before Event A (lower `_id`), reconnecting with Event B skipped Event A. In `flushBuffer()`, numeric comparison (`_id <= highestReplayedId`) dropped lower-ID events that arrived during handshake.  
   *Fix:* Introduced in-memory commit-ordered buffer (`commitOrderedBuffer`, 500 items) recording oplog commit order. Switched `flushBuffer` to set-based inclusion (`replayedEventIds: Set<string>`).
2. **Buffered Event Authorization Leakage (Investigation 2):**  
   Events buffered during handshake were flushed without re-evaluating membership authorization at write time, leaking private team intel if membership was revoked during handshake.  
   *Fix:* Added dual-layer authorization check inside `flushBuffer()` at socket delivery time.
3. **Poller Starvation & Missing Compound Index (Investigation 3):**  
   `pollAndDispatch()` lacked pagination on range query `createdAt: { $gte: since }`, and lacked an un-prefixed compound index `{ createdAt: 1, _id: 1 }`.  
   *Fix:* Added index `event_poller_lookup` on `{ createdAt: 1, _id: 1 }` and implemented batch pagination.
4. **Durable Recovery Boundary (Investigation 4):**  
   Resume token was advanced on change stream receipt rather than post-dispatch.  
   *Fix:* Updated `lastResumeToken` inside `handleEvent()` strictly after `broadcastEvent()` resolves.
5. **SSE Cursor Corruption & Socket Leaks (Investigation 5):**  
   `formatSyncGapMessage` emitted synthetic `id:` lines corrupting browser `Last-Event-ID`; `useEvents.ts` error probe leaked backend sockets.  
   *Fix:* Omitted `id:` line from `sync.gap`; added `AbortController` in error probe.

---

### Merge-Blocking Review 2 Findings (Findings 1–3)

#### Finding 1: Commit Buffer Ordering & Polling Fallback Replay
- **Defect:** `addToCommitBuffer()` ran for events dispatched by both the live Change Stream and the background poller. However, polling queries read from database collections where documents are ordered by collection indexes (`createdAt`, `_id`), NOT true transaction commit order. When polling observed transactions that committed out of ObjectId allocation order, adding polled events into `commitOrderedBuffer` corrupted the buffer's commit order. Furthermore, on cold restarts with an empty in-memory buffer, querying the database by `_id: { $gt: lastEventId }` silently skipped lower-ID events committed after higher-ID events.
- **Root Cause:** Conflating collection query sorting with authoritative distributed transaction commit order. MongoDB collections do not persist an oplog commit sequence number.
- **Resolution:**
  - Poller dispatches events with `{ fromPoller: true }`. Polled events are live-broadcast to active sockets as best-effort notifications, but are **never added to `commitOrderedBuffer`**.
  - Polling recovery marks `pollerFallbackOccurred = true`.
  - When commit order cannot be proven (polling fallback active, or cold restart with empty buffer while running), `getReplayEvents()` emits an explicit `sync.gap` (`reason: 'fallback'`).
  - The client's `useEvents` hook catches `sync.gap` and triggers `queryClient.invalidateQueries()`, safely synchronizing from authoritative REST endpoints.

#### Finding 2: Direct Replay Authoritative Membership Verification
- **Defect:** In `sse.routes.ts`, the replay loop checked `connectionManager.getClientTeamId(connectionId)` rather than querying current database membership. If a member removal transaction committed in MongoDB while a replay query was in-flight (or in multi-instance deployments before local lifecycle broadcast arrived), the replay loop used the stale cached `teamId` and disclosed private team events to the removed user.
- **Root Cause:** In-memory authorization cache check at delivery boundary without database verification.
- **Resolution:**
  - Added authoritative database membership verification (`await membershipRepo.findActiveMembership(hackathonId, req.user._id)`) inside the `sse.routes.ts` replay loop for every team-scoped event.
  - If the user is no longer an active team member, the private team event is suppressed and `connectionManager.updateClientTeam(...)` clears the connection's cached `teamId`.
  - If `findActiveMembership` throws a transient database error (e.g. connection pool timeout), delivery is suppressed fail-safe without corrupting in-memory authorization cache.
  - Public hackathon events and user-scoped events remain authorized and are delivered without disruption.

#### Finding 3: Poller Starvation Beyond 1,000 Events & Bounded Inter-Cycle Keyset Progress
- **Defect:** `pollAndDispatch()` paginated 100 events at a time with a maximum of 10 batches per cycle, but its pagination cursor reset to `null` on each polling cycle. If $>1,000$ events existed in the lookback window (e.g. 1,500 committed events), Cycle 1 examined events 1–1,000, and Cycle 2 re-scanned events 1–1,000 from the beginning, permanently starving events 1,001–1,500 until older events aged out of the 60-second window.
- **Root Cause:** Ephemeral per-cycle pagination cursor without state progression across polling cycles.
- **Resolution:**
  - Implemented keyset pagination `(createdAt, _id)` with persistent `this.pollCursor: { createdAt: Date; _id: ObjectId } | null` maintained across polling cycles.
  - Poller query uses `{ createdAt: { $gte: since }, $or: [ { createdAt: cursor.createdAt, _id: { $gt: cursor._id } }, { createdAt: { $gt: cursor.createdAt } } ] }` sorted by `{ createdAt: 1, _id: 1 }`.
  - Execution plan uses `IXSCAN` on dedicated index `event_poller_lookup` with index bounds `[cursorDate, MaxDate]` (zero in-memory sort, zero full collection scan).
  - Cycle 1 processes 1,000 events, advancing `this.pollCursor` to event 1,000. Cycle 2 resumes at event 1,000 and processes remaining 500 events (events 1,001–1,500).
  - Upon reaching the end of available records (`events.length < batchLimit`), `this.pollCursor` resets to `null`, ensuring the next cycle sweeps the entire sliding lookback window from `since` to catch any late-committing lower-ID concurrent transactions.
  - Expired cursors (`cursor.createdAt < since`) automatically reset to `null`.

---

## 3. Reproduction Test Results: Before vs After

A dedicated regression suite of 19 tests was implemented in [`apps/api/test/outbox.delivery.test.ts`](file:///Users/uditagarwal/Desktop/CrewGrid/apps/api/test/outbox.delivery.test.ts).

### Reproduction Failures (Before Fix)
```
FAIL test/outbox.delivery.test.ts
  × REPRODUCTION: non-monotonic ObjectId commit drops late-committing lower ObjectId (82ms)
  × REPRODUCTION: restart blindly advances watermark to latest event, skipping un-dispatched events (71ms)
  × REPRODUCTION: transient membership lookup failure is retried and not permanently dropped (76ms)
  × REPRODUCTION: replay overflow (>50 events) sends sync.gap event instead of silent truncation (520ms)
  × REPRODUCTION: expired Last-Event-ID evicted from collection sends sync.gap event (510ms)
  × REPRODUCTION INV 1: non-monotonic replay: Event B (higher ID) commits first, Event A (lower ID) commits afterward; reconnecting with Event B ID must not lose Event A (480ms)
  × REPRODUCTION INV 1: lower-ID event arriving during replay-to-live handshake must not be skipped by flushBuffer (102ms)
  × REPRODUCTION INV 2: user removed while private team event is buffered -> flushBuffer must NOT leak private event (73ms)
  × REPRODUCTION INV 3: poller discovers and dispatches events beyond the first 200 already-dispatched records (75ms)
  × REPRODUCTION INV 5: sync.gap control message does NOT include a misleading synthetic id line (20ms)
  × REPRODUCTION INV 5: handshake buffer hard limit: exceeding 100 buffered events triggers safe sync.gap and drops buffer (45ms)
  × REPRODUCTION FINDING 1: reversed ObjectId commit ordering during change-stream outage triggers explicit sync.gap on replay (87ms)
    → expected replay result to signal sync.gap fallback (Poller collection scan lost lower-ID event in replay)
  × REPRODUCTION FINDING 2: user removed in DB while replay is in-flight -> replay MUST NOT disclose private team events (496ms)
    → expected output to omit 'Secret Team Replay Intel' (Private event delivered using stale cached teamId)
  × REPRODUCTION FINDING 2: transient DB error during replay authorization suppresses private event without cache corruption (517ms)
    → expected private event to be suppressed on DB lookup error
  × REPRODUCTION FINDING 3: lookback window with 1,500 events -> bounded poller makes progress across cycles without starving events 1001-1500 (171ms)
    → expected poller to make progress across cycles (Poller reset cursor on each cycle, starving records 1001-1500)
```

### Verified Passes (After Fix)
All 19 regression tests pass deterministically:
```
 ✓ test/outbox.delivery.test.ts (19 tests) 5329ms
   ✓ C02: Outbox & SSE Delivery Reliability Regression Tests > REPRODUCTION: non-monotonic ObjectId commit drops late-committing lower ObjectId 108ms
   ✓ C02: Outbox & SSE Delivery Reliability Regression Tests > REPRODUCTION: restart blindly advances watermark to latest event, skipping un-dispatched events 95ms
   ✓ C02: Outbox & SSE Delivery Reliability Regression Tests > REPRODUCTION: concurrent change stream and poller do not deliver duplicate events 83ms
   ✓ C02: Outbox & SSE Delivery Reliability Regression Tests > REPRODUCTION: transient membership lookup failure is retried and not permanently dropped 194ms
   ✓ C02: Outbox & SSE Delivery Reliability Regression Tests > REPRODUCTION: event committed during SSE connection handshake is not lost 595ms
   ✓ C02: Outbox & SSE Delivery Reliability Regression Tests > REPRODUCTION: replay overflow (>50 events) sends sync.gap event instead of silent truncation 572ms
   ✓ C02: Outbox & SSE Delivery Reliability Regression Tests > REPRODUCTION: expired Last-Event-ID evicted from collection sends sync.gap event 587ms
   ✓ C02: Outbox & SSE Delivery Reliability Regression Tests > REPRODUCTION: graceful shutdown drains in-flight broadcasts before closing 179ms
   ✓ C02: Outbox & SSE Delivery Reliability Regression Tests > multi-instance delivery: two independent dispatchers deliver outbox event to their respective clients 191ms
   ✓ C02: Outbox & SSE Delivery Reliability Regression Tests > REPRODUCTION INV 1: non-monotonic replay: Event B (higher ID) commits first, Event A (lower ID) commits afterward; reconnecting with Event B ID must not lose Event A 570ms
   ✓ C02: Outbox & SSE Delivery Reliability Regression Tests > REPRODUCTION INV 1: lower-ID event arriving during replay-to-live handshake must not be skipped by flushBuffer 94ms
   ✓ C02: Outbox & SSE Delivery Reliability Regression Tests > REPRODUCTION INV 2: user removed while private team event is buffered -> flushBuffer must NOT leak private event 90ms
   ✓ C02: Outbox & SSE Delivery Reliability Regression Tests > REPRODUCTION INV 3: poller discovers and dispatches events beyond the first 200 already-dispatched records 88ms
   ✓ C02: Outbox & SSE Delivery Reliability Regression Tests > REPRODUCTION INV 5: sync.gap control message does NOT include a misleading synthetic id line 24ms
   ✓ C02: Outbox & SSE Delivery Reliability Regression Tests > REPRODUCTION INV 5: handshake buffer hard limit: exceeding 100 buffered events triggers safe sync.gap and drops buffer 63ms
   ✓ C02: Outbox & SSE Delivery Reliability Regression Tests > REPRODUCTION FINDING 1: reversed ObjectId commit ordering during change-stream outage triggers explicit sync.gap on replay 491ms
   ✓ C02: Outbox & SSE Delivery Reliability Regression Tests > REPRODUCTION FINDING 2: user removed in DB while replay is in-flight -> replay MUST NOT disclose private team events 521ms
   ✓ C02: Outbox & SSE Delivery Reliability Regression Tests > REPRODUCTION FINDING 2: transient DB error during replay authorization suppresses private event without cache corruption 538ms
   ✓ C02: Outbox & SSE Delivery Reliability Regression Tests > REPRODUCTION FINDING 3: lookback window with 1,500 events -> bounded poller makes progress across cycles without starving events 1001-1500 186ms
```

---

## 4. Delivery, Replay, and Authorization Semantics: Confirmed Guarantees vs Best-Effort

| Operational Mode | Ordering & Delivery Semantics | Replay Guarantee | Authorization Guarantee |
|---|---|---|---|
| **Live Change Stream (Primary Engine)** | **Strict commit-order delivery** from MongoDB replica set oplog (`clusterTime`). At-least-once to active server sockets. Deduplicated via 20,000-entry in-memory FIFO set. | **Gapless commit-ordered replay** for up to 500 events held in `commitOrderedBuffer`. If missed events $>50$, server emits explicit `sync.gap`. | **Dual-layer authorization write barrier**: Live broadcast checks both in-memory `conn.teamId` AND authoritative `membershipRepo.findTeamMembers` at delivery time. |
| **Polling Fallback (Recovery Engine)** | **Best-effort live socket notification** across lookback window (60s). Paginates up to 1,000 events/cycle via keyset `(createdAt, _id)`. Ordering is collection index order, **NOT guaranteed commit order**. | **Replay explicitly prohibited**: Poller events do not enter `commitOrderedBuffer`. Replay requests emit `event: sync.gap (reason: fallback)` forcing client REST re-sync. | Poller live broadcast invokes standard `broadcastEvent()`, verifying active database membership before writing to sockets. |
| **SSE Handshake Buffering** | Events committing during replay query are held in `conn.buffer` (capped at 100). | Handshake buffer is flushed using `Set<string>` inclusion (`replayedEventIds`), delivering lower-ID events that arrived during handshake. | **Dual-layer check at flush time**: `flushBuffer()` queries `membershipRepo.findActiveMembership()`, dropping private events if membership was revoked during handshake. |
| **Direct SSE Replay** | Replays events from commit buffer up to limit 50. If buffer is empty (cold restart) or fallback occurred, emits `sync.gap`. | Contiguous commit order verified against `commitOrderedBuffer`. | **Authoritative delivery check**: Every team event in replay loop queries `membershipRepo.findActiveMembership()`. Revocation suppresses delivery and clears connection cache. |

---

## 5. Architectural Boundaries & Operational Limitations

To maintain strict engineering accuracy, the following boundaries and limitations are documented:

1. **Ephemeral Commit Buffer Lifetime (500 events):**  
   The in-memory commit-ordered buffer stores the last 500 committed events per API process. If an API process restarts, this in-memory buffer is reinitialized. Post-restart replay requests falling outside the buffer rely on explicit `sync.gap` and REST resynchronization rather than attempting un-sequenced database collection replay.
2. **Bounded Poller Lookback Window (60 seconds):**  
   The fallback poller queries events created within the last 60 seconds (`createdAt >= now - 60s`). If a change stream is down and an event commits $>60\text{ s}$ prior, it will not be picked up by the poller. The Change Stream resume token (`resumeAfter`) remains the primary recovery path across disconnects.
3. **Unidirectional SSE Protocol Boundary:**  
   Standard Server-Sent Events over HTTP is fundamentally a unidirectional protocol without client-to-server application ACK packets. The server guarantees delivery to the TCP socket buffer; if the client crashes or experiences a network partition while an event is in flight, the browser cannot ACK receipt. The client MUST recover missing events upon reconnect using `Last-Event-ID` or reconcile via `sync.gap`.
4. **Single-Node Handshake Buffering:**  
   Handshake buffering (`conn.buffer`) occurs in memory on the specific API server handling the HTTP request. SSE connections are sticky to their node; horizontal re-routing mid-handshake is not supported by standard SSE.
5. **Bounded Polling Throughput:**  
   The poller paginates up to 10 batches of 100 items (1,000 events max per 500ms cycle). In normal operation the poller processes 0 items because the Change Stream dispatches events in near real-time. If the Change Stream halts under heavy load (>2,000 events/sec), polling will introduce backlog latency. Keyset progress across cycles ensures no events are starved.

---

## 6. Monorepo Verification Evidence

- **All API Tests (`apps/api`):** **145 passed across 15 test files** in 37.4s (includes 19 outbox delivery tests, 22 SSE authorization tests, 9 realtime SSE tests, 8 concurrency race tests).
- **All Web Tests (`apps/web`):** **16 passed across 3 test files** in 3.72s.
- **Playwright E2E Suite (`e2e`):** **16 passed across 2 spec files** in 9.0s.
- **Database Domain Invariants (`scripts/invariants/verify.ts`):** **PASSED with 0 violations**.
- **Monorepo Build, Lint & Typecheck (`pnpm -r lint && pnpm -r typecheck && pnpm -r build`):** **0 errors, 0 warnings across all 4 workspaces**.

---

## 7. Merge-Readiness Assessment

All merge-blocking correctness review findings (Findings 1, 2, and 3) have been reproduced, fixed, and verified with deterministic regression tests. The real-time messaging subsystem strictly guarantees:
1. True oplog commit ordering during live change stream dispatch.
2. Explicit `sync.gap` fallback when commit order cannot be demonstrated from database scans.
3. Zero private data disclosure across live broadcast, buffered flush, and direct replay.
4. Starvation-free keyset polling progression across cycles.

**Assessment:** The branch `fix/outbox-delivery-reliability` is **READY FOR MERGE** upon independent human approval. PR #2 remains unmerged and undeployed.
