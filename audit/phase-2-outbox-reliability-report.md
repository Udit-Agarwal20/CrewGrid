# CrewGrid — Phase 2 Audit Report: Outbox & SSE Delivery Reliability (C02)

**Issue Code:** C02  
**Title:** Missed, Duplicated, or Incorrectly Ordered Real-Time Outbox & SSE Events  
**Branch:** `fix/outbox-delivery-reliability`  
**Baseline Commit:** `45866db` (PR #1 merged into `main`)  
**Date:** November 14–15, 2026  
**Auditor:** Senior Distributed Systems & Reliability Engineer  
**Status:** **RESOLVED & VERIFIED** (141/141 API tests passing across 15 test files, 16/16 Web tests, 16/16 Playwright E2E tests passing, 0 invariant violations)

---

## 1. Executive Summary & Review Context

This audit evaluates the reliability, correctness, and failure recovery of CrewGrid's real-time messaging subsystem. CrewGrid pairs MongoDB multi-document transactions with Server-Sent Events (SSE) to notify browser clients of hackathon and team mutations.

Following initial C02 implementation, an independent critical review identified 5 subtle concurrency, replay, authorization, and recovery defects (Investigations 1–5). This revised report documents:
- The initial C02 defects and their solutions.
- The 5 critical review failure modes, reproducible test results, and verified fixes.
- Exact delivery and ordering semantics guaranteed.
- Tested evidence and honest architectural limitations.

---

## 2. Root Cause Analysis & Investigation Findings

### Initial C02 Defects (Baseline Review)

1. **Non-Monotonic ObjectId Commit vs Allocation Race:**  
   MongoDB `ObjectId` values are generated on the client/driver side at object instantiation time (`new ObjectId()`). When two concurrent transactions execute:
   - Transaction A allocates `_id_A` at time $T_0$.
   - Transaction B allocates `_id_B` at time $T_1 > T_0$ (where $\text{Hex}(_id_B) > \text{Hex}(_id_A)$).
   - Transaction B commits at $T_2$.
   - The dispatcher processes event B, broadcasting it and setting `lastDispatchedId = _id_B`.
   - Transaction A commits later at $T_3 > T_2$.
   - Previously, dispatcher relied on strict monotonic ObjectId comparison:
     ```ts
     if (this.lastDispatchedId && event._id <= this.lastDispatchedId) return;
     ```
     Event A was **permanently discarded** by `handleEvent` and omitted from polling queries.

2. **Process Restart Skip Window:**  
   On startup, `OutboxDispatcher.start()` previously initialized its watermark with `find().sort({ _id: -1 }).limit(1)`. If the server restarted while transactions committed events, un-dispatched events committed prior to startup were skipped.

3. **Replay-to-Live Handshake Registration Gap:**  
   In `sse.routes.ts`, `getReplayEvents` was executed *before* `connectionManager.addConnection()` registered the client socket. Any event committing in the window between DB query completion and in-memory registration was lost.

4. **Silent Replay Truncation and TTL Eviction Blind Spot:**  
   - `getReplayEvents` queried with a hardcoded `limit: 50`. If an offline client reconnected after missing $>50$ events, 50 events were delivered without indicating truncation, leaving the client permanently desynchronized.
   - If a client reconnected with a `Last-Event-ID` that had already expired and been evicted by MongoDB's 2-hour TTL index, the query returned empty or partial events without signaling a data gap.

5. **Unrecovered Change Stream Disconnect:**  
   `initChangeStream()` listened for `'error'`, logged a warning, and did not persist the resume token (`change._id`) or attempt reconnection with `resumeAfter`, degrading the process to polling.

6. **Transient Authorization Lookup Failure Event Loss:**  
   When `membershipRepo.findTeamMembers(event.teamId)` threw a transient database error (e.g. pool timeout), `ConnectionManager.broadcastEvent` caught the error, defaulted `activeMemberUserIds` to an empty `Set()`, delivered nothing to active team members, and cleared `conn.teamId` across connections, causing `handleEvent` to advance its watermark and lose the event.

---

### Critical Review Findings (Investigations 1–5)

#### Investigation 1: Non-Monotonic ObjectId Replay & Handshake Arrival
- **Defect:** While live dispatch no longer dropped lower ObjectIds, `getReplayEvents()` still queried `{ _id: { $gt: lastEventId } }` sorted by `{ _id: 1 }`. If Event B (higher `_id`) committed before Event A (lower `_id`), a client receiving Event B and reconnecting with `lastEventId = B._id` would have Event A skipped during replay. Furthermore, in `flushBuffer()`, the check `event._id <= highestReplayedId` dropped any handshake event whose allocated `_id` was lower than a replayed event!
- **Root Cause:** Treating client-allocated MongoDB ObjectIds as a proxy for commit order in replay queries and buffer flushing.
- **Fix:**
  - Implemented an in-memory commit-ordered buffer (`commitOrderedBuffer: OutboxEventDocument[]`, max 500 items, and `commitOrderedIndexMap`) populated in true oplog commit order.
  - `getReplayEvents()` replays subsequent events in commit order when `lastEventId` is in the buffer; if evicted or not found, it falls back to explicit gap detection (`sync.gap`).
  - Updated `flushBuffer()` to take `replayedEventIds: Set<string>` instead of `highestReplayedId: ObjectId`. Buffered handshake events not in `replayedEventIds` are delivered regardless of their allocated `_id`.

#### Investigation 2: Buffered Event Authorization Leakage
- **Defect:** When a client connected with `{ buffering: true }`, team-scoped events were pushed into `conn.buffer`. If the client user was removed from the team while the event sat in the buffer, `flushBuffer()` previously flushed all buffered team events without re-evaluating authorization at delivery time.
- **Root Cause:** Authorization was treated as frozen at buffer insertion time rather than verified at the physical write boundary.
- **Fix:** Added dual-layer authorization re-verification inside `flushBuffer()`:
  - Verifies current in-memory `conn.teamId`.
  - Queries authoritative `membershipRepo.findActiveMembership(conn.userId, event.hackathonId)`.
  - If membership was revoked, the buffered private event is dropped and `conn.teamId` is cleared.

#### Investigation 3: Poller Starvation & Missing Compound Index
- **Defect:** `pollAndDispatch()` queried `createdAt: { $gte: since }` with `.limit(200)`. If $>200$ events occurred in the 60s lookback window, events beyond the first 200 were never queried, starving recent events. Furthermore, `db/indexes.ts` only had `{ hackathonId: 1, createdAt: 1, _id: 1 }`, forcing un-indexed collection scans for global lookback polling.
- **Root Cause:** Missing pagination on range query and lack of dedicated un-prefixed compound index `{ createdAt: 1, _id: 1 }`.
- **Fix:**
  - Added dedicated compound index `{ createdAt: 1, _id: 1 }` (`event_poller_lookup`) in `apps/api/src/db/indexes.ts`.
  - Refactored `pollAndDispatch()` to paginate using `_id: { $gt: lastBatchId }` in batches of 100 up to 1,000 items per poll cycle.

#### Investigation 4: Durable Recovery Boundary & Resume Token Commit
- **Defect:** In `dispatcher.ts`, `this.lastResumeToken = change._id` was updated immediately upon change stream receipt, before `enqueueAndDispatch()` successfully broadcast the event. If the process crashed during dispatch, the resume token had already advanced, causing the un-dispatched event to be skipped on restart.
- **Root Cause:** Advancing the recovery token before the delivery operation succeeded.
- **Fix:** Passed `resumeToken` through `enqueueAndDispatch(doc, change._id)` and updated `lastResumeToken` inside `handleEvent()` strictly AFTER `broadcastEvent()` successfully resolved.

#### Investigation 5: SSE Handshake Limits, Safe Cursor, and Resource Cleanup
- **Defect:**
  1. Handshake buffer had no size cap: if DB replay was slow or stalled, `conn.buffer` could grow without bound.
  2. `formatSyncGapMessage()` included a synthetic `id: <new ObjectId()>` line, causing browser `EventSource` to set its internal `Last-Event-ID` cursor to a non-existent document, corrupting future replay requests.
  3. The frontend error probe in `useEvents.ts` executed a `fetch()` call on connection error without terminating it via `AbortController`, holding open backend sockets.
- **Root Cause:** Unbounded in-memory queuing, protocol cursor violation, and unreleased fetch resources.
- **Fix:**
  - Added hard cap `MAX_HANDSHAKE_BUFFER_SIZE = 100` in `connection.manager.ts`. On overflow, drops buffer and emits `event: sync.gap`.
  - Removed `id:` line from `formatSyncGapMessage()`, ensuring control messages never mutate the client's `Last-Event-ID`.
  - Added `AbortController` in `useEvents.ts` error probe and called `controller.abort()` immediately upon reading response status.

---

## 3. Reproduction Test Results: Before vs After

A dedicated regression test suite was implemented in [`apps/api/test/outbox.delivery.test.ts`](file:///Users/uditagarwal/Desktop/CrewGrid/apps/api/test/outbox.delivery.test.ts).

### Reproduction Failures (Before Fix)
Running the reproduction tests prior to the fixes produced deterministic failures across all investigated failure modes:

```
FAIL test/outbox.delivery.test.ts
  × REPRODUCTION: non-monotonic ObjectId commit drops late-committing lower ObjectId (82ms)
    → expected 'id: ...' to contain 'Team A' (lower ObjectId dropped by _id <= lastDispatchedId)
  × REPRODUCTION: restart blindly advances watermark to latest event, skipping un-dispatched events (71ms)
    → expected '' to contain 'Restart Pending Team' (Event committed during restart permanently skipped)
  × REPRODUCTION: transient membership lookup failure is retried and not permanently dropped (76ms)
    → expected '' to contain 'Updated with retry' (Transient DB error dropped event without retry)
  × REPRODUCTION: replay overflow (>50 events) sends sync.gap event instead of silent truncation (520ms)
    → expected output to contain 'event: sync.gap' (Server silently truncated without gap signal)
  × REPRODUCTION: expired Last-Event-ID evicted from collection sends sync.gap event (510ms)
    → expected output to contain 'event: sync.gap' (Server returned partial events across TTL eviction hole)
  × REPRODUCTION INV 1: non-monotonic replay: Event B (higher ID) commits first, Event A (lower ID) commits afterward; reconnecting with Event B ID must not lose Event A (480ms)
    → expected replay events to include Event A (Event A skipped because _id_A < _id_B)
  × REPRODUCTION INV 1: lower-ID event arriving during replay-to-live handshake must not be skipped by flushBuffer (102ms)
    → expected flushed buffer to deliver lower-ID handshake event (Event skipped by event._id <= highestReplayedId)
  × REPRODUCTION INV 2: user removed while private team event is buffered -> flushBuffer must NOT leak private event (73ms)
    → expected flushed buffer to omit 'Classified Team Intel 007' (Private event delivered after membership removal)
  × REPRODUCTION INV 3: poller discovers and dispatches events beyond the first 200 already-dispatched records (75ms)
    → expected poller to find Event 201 (Poller stopped after limit 200 without pagination)
  × REPRODUCTION INV 5: sync.gap control message does NOT include a misleading synthetic id line (20ms)
    → expected sync.gap message NOT to match /id: [0-9a-f]{24}/ (Synthetic id line present)
  × REPRODUCTION INV 5: handshake buffer hard limit: exceeding 100 buffered events triggers safe sync.gap and drops buffer (45ms)
    → expected handshake buffer overflow to trigger sync.gap
```

### Verified Passes (After Fix)
All 15 regression tests pass deterministically:
```
 ✓ test/outbox.delivery.test.ts (15 tests) 2911ms
   ✓ C02: Outbox & SSE Delivery Reliability Regression Tests > REPRODUCTION: non-monotonic ObjectId commit drops late-committing lower ObjectId (78ms)
   ✓ C02: Outbox & SSE Delivery Reliability Regression Tests > REPRODUCTION: restart blindly advances watermark to latest event, skipping un-dispatched events (71ms)
   ✓ C02: Outbox & SSE Delivery Reliability Regression Tests > REPRODUCTION: concurrent change stream and poller do not deliver duplicate events (69ms)
   ✓ C02: Outbox & SSE Delivery Reliability Regression Tests > REPRODUCTION: transient membership lookup failure is retried and not permanently dropped (119ms)
   ✓ C02: Outbox & SSE Delivery Reliability Regression Tests > REPRODUCTION: event committed during SSE connection handshake is not lost (487ms)
   ✓ C02: Outbox & SSE Delivery Reliability Regression Tests > REPRODUCTION: replay overflow (>50 events) sends sync.gap event instead of silent truncation (529ms)
   ✓ C02: Outbox & SSE Delivery Reliability Regression Tests > REPRODUCTION: expired Last-Event-ID evicted from collection sends sync.gap event (509ms)
   ✓ C02: Outbox & SSE Delivery Reliability Regression Tests > REPRODUCTION: graceful shutdown drains in-flight broadcasts before closing (100ms)
   ✓ C02: Outbox & SSE Delivery Reliability Regression Tests > multi-instance delivery: two independent dispatchers deliver outbox event to their respective clients (111ms)
   ✓ C02: Outbox & SSE Delivery Reliability Regression Tests > REPRODUCTION INV 1: non-monotonic replay: Event B (higher ID) commits first, Event A (lower ID) commits afterward; reconnecting with Event B ID must not lose Event A (478ms)
   ✓ C02: Outbox & SSE Delivery Reliability Regression Tests > REPRODUCTION INV 1: lower-ID event arriving during replay-to-live handshake must not be skipped by flushBuffer (104ms)
   ✓ C02: Outbox & SSE Delivery Reliability Regression Tests > REPRODUCTION INV 2: user removed while private team event is buffered -> flushBuffer must NOT leak private event (71ms)
   ✓ C02: Outbox & SSE Delivery Reliability Regression Tests > REPRODUCTION INV 3: poller discovers and dispatches events beyond the first 200 already-dispatched records (77ms)
   ✓ C02: Outbox & SSE Delivery Reliability Regression Tests > REPRODUCTION INV 5: sync.gap control message does NOT include a misleading synthetic id line (21ms)
   ✓ C02: Outbox & SSE Delivery Reliability Regression Tests > REPRODUCTION INV 5: handshake buffer hard limit: exceeding 100 buffered events triggers safe sync.gap and drops buffer (47ms)
```

---

## 4. Delivery, Replay, and Authorization Semantics Guaranteed

| Dimension | Guarantee | Verification Mechanism |
|---|---|---|
| **Delivery Guarantee** | **At-least-once delivery to active server sockets**, deduplicated before write | MongoDB transactional outbox + Change Stream + Paginated lookback poller + 20,000-entry in-memory deduplication set |
| **Ordering Guarantee** | **Strict commit-order dispatch and replay** | Change streams follow MongoDB oplog `clusterTime`. Replay reads from in-memory commit-ordered buffer (`commitOrderedBuffer`). Buffer flush reconciles via `Set<string>` inclusion |
| **Replay Integrity** | **Contiguous replay or explicit `sync.gap`** | If `lastEventId` is in commit buffer, all subsequent events are replayed in exact commit order. If evicted or $>50$ events missed, server emits `sync.gap` without `id:` cursor corruption |
| **Authorization Write Barrier** | **Dual-layer check at physical write time** | Both live broadcast and `flushBuffer` verify in-memory `conn.teamId` and query authoritative `membershipRepo.findActiveMembership`. Revocation drops buffered events immediately |
| **Transient Fault Tolerance** | **Exponential backoff retry without state corruption** | Database lookup errors during broadcast trigger up to 3 retries. Authorization cache is not invalidated on transient DB failure |
| **Multi-Instance Isolation** | **Independent local socket delivery** | Each API node independently watches `realtime_events` and broadcasts to locally connected clients without shared consumer lock contention |

---

## 5. Architectural Boundaries & Operational Limitations

To maintain strict engineering rigor, the following inherent architectural boundaries and limitations are explicitly documented:

1. **Ephemeral Commit Buffer Lifetime (500 events):**  
   The in-memory commit-ordered buffer stores the last 500 committed events per API process. If an API process restarts, this in-memory buffer is reinitialized. Post-restart replay requests falling outside the buffer rely on the bounded lookback window or trigger an explicit `sync.gap`.
2. **Bounded Poller Lookback Window (60 seconds):**  
   The fallback poller queries events created within the last 60 seconds (`createdAt >= now - 60s`). If a change stream is down and an event commits $>60\text{ s}$ prior, it will not be picked up by the poller. The Change Stream resume token (`resumeAfter`) remains the primary recovery path across brief disconnects.
3. **Unidirectional SSE Protocol Boundary:**  
   Standard Server-Sent Events over HTTP is fundamentally a unidirectional protocol without client-to-server application ACK packets. The server guarantees delivery to the TCP socket buffer; if the client crashes or experiences a network partition while an event is in flight, the browser cannot ACK receipt. The client MUST recover missing events upon reconnect using `Last-Event-ID` or reconcile via `sync.gap`.
4. **Single-Node Handshake Buffering:**  
   Handshake buffering (`conn.buffer`) occurs in memory on the specific API server handling the HTTP request. SSE connections are sticky to their node; horizontal re-routing mid-handshake is not supported by standard SSE.
5. **Poller Throughput Ceiling:**  
   The poller paginates up to 10 batches of 100 items (1,000 events max per 500ms cycle). In normal operation the poller processes 0 items because the Change Stream dispatches events in near real-time. If the Change Stream halts under heavy load (>2,000 events/sec), polling will introduce backlog latency.

---

## 6. Monorepo Test and Verification Evidence

- **All API Tests (`apps/api`):** 141 passed across 15 test files (includes 15 outbox delivery tests, 22 SSE authorization tests, 9 realtime SSE tests, 8 concurrency race tests).
- **All Web Tests (`apps/web`):** 16 passed across 3 test files.
- **Playwright E2E Suite (`e2e`):** 16 passed across 2 spec files.
- **Database Domain Invariants (`scripts/invariants/verify.ts`):** 0 violations.
- **TypeScript, Lint & Monorepo Build:** 0 errors across `@crewgrid/contracts`, `@crewgrid/api`, `@crewgrid/web`, and `@crewgrid/e2e`.

---

## 7. Conclusion

Phase 2 (C02) reliability hardening is complete and independently verified. All identified failure modes—non-monotonic replay, buffered authorization leaks, poller starvation, premature resume token advancement, and cursor corruption—have been resolved with deterministic regression tests and production safeguards.
