# CrewGrid — Race-Proof Team Formation at Scale
**Hack4Hack Crew Hiring Challenge 2026 — Problem Statement 1**  
**Author:** Udit Agarwal | **Commit:** `4f9c829` | **CI:** [GitHub Actions #42869098437 (Green)](https://github.com/Udit-Agarwal20/CrewGrid/actions/runs/42869098437) | **Live:** [crewgrid-api.onrender.com](https://crewgrid-api.onrender.com)

---

### 1. Problem & Core Invariants
High contention during hackathon team formation causes broken rosters, orphaned records, and duplicate team assignments when 50+ applicants compete for the final slot. CrewGrid guarantees five non-negotiable invariants:
1. **$I_1$ (Capacity Cap):** Active team `memberCount <= maxSize`. A 5-person team never admits a 6th member under any concurrency condition.
2. **$I_2$ (Roster Consistency):** `memberCount == count(memberships)` for all non-deleted teams at all times.
3. **$I_3$ (Event Exclusivity):** Exactly $\le 1$ active team membership per user per hackathon event ($O\text{-}01$).
4. **$I_4$ (Leadership Invariance):** Every active team has exactly one leader (`leaderId`). Departure triggers deterministic succession or logical deletion ($O\text{-}03$).
5. **$I_5$ (Single-Use Invites):** A 256-bit invite token can only be redeemed once ($O\text{-}02$). Plaintext tokens are never stored ($O\text{-}07$).

---

### 2. Architecture & Data Model
- **Storage:** MongoDB 8.0 Replica Set (`rs0`). All state transitions run via `withDomainTransaction` with `TransientTransactionError` and `UnknownTransactionCommitResult` retries.
- **`teams`:** `{ _id, hackathonId, memberCount, minSize, maxSize, leaderId, deletedAt }` — Index: `{ hackathonId: 1, deletedAt: 1, updatedAt: -1, _id: -1 }`.
- **`memberships`:** `{ _id, hackathonId, teamId, userId, joinedAt }` — Unique Index: `{ hackathonId: 1, userId: 1 }` (guarantees event exclusivity).
- **`invites`:** `{ _id, teamId, tokenHash, expiresAt, usedAt, usedBy }` — Unique Index: `{ tokenHash: 1 }` (SHA-256 digest).
- **`join_requests`:** `{ _id, teamId, applicantId, status }` — Unique Partial Index: `{ teamId: 1, applicantId: 1 }` where `status: "pending"`.
- **`idempotency_keys`:** `{ _id, actorId, scope, key, requestHash, responseStatus, responseBody, expiresAt }` — Unique Index: `{ actorId: 1, scope: 1, key: 1 }`.
- **`realtime_events` & `audit_events`:** Committed atomically in the same transaction as domain changes.

---

### 3. Concurrency Protection & Overbooking Prevention
All join operations (invitation redemption and leader request approvals) execute inside an atomic multi-document transaction:
1. **Guarded Increment:** `teams.findOneAndUpdate({ _id: teamId, memberCount: { $lt: maxSize }, deletedAt: null }, { $inc: { memberCount: 1 } })`. If `memberCount == maxSize`, zero documents match and the transaction aborts with HTTP 409 `TEAM_FULL`.
2. **Cross-Team Dual-Join Arbitration:** If a racer concurrently redeems invites for two different teams, both guarded increments may initially succeed, but MongoDB's compound unique index `{ hackathonId: 1, userId: 1 }` on `memberships` rejects the second insert (`E11000`), rolling back the losing team's increment automatically.
3. **Transactional Outbox:** `realtime_events` documents are inserted inside the transaction. If the transaction aborts, zero SSE events are emitted, preventing phantom UI updates.

---

### 4. Verified Test Evidence & Benchmarks
- **Automated CI Suite:** 104 API integration tests, 8 web unit tests, 10 Playwright E2E browser tests, and 0 domain invariant violations on GitHub Actions Ubuntu 24.04.
- **50-Way Last-Seat Race ($O\text{-}04$):** 50 concurrent authenticated requests for 1 remaining seat $\rightarrow$ **EXACTLY 1 succeeds** (HTTP 200), **49 rejected** (HTTP 409 `TEAM_FULL`), 0 server 5xx errors, final `memberCount == 5`.
- **Deterministic Scale Dataset ($O\text{-}11$):** 10,000 synthetic participants and 2,000 teams generated in **0.98s** with **0 invariant violations**.
- **k6 Load Benchmark (100 Concurrent VUs):** 68,728 requests processed over 57.3s at **1,200.4 req/s** with **0.00% error rate**.
  - **Live Team Board p95:** **88.83 ms** (55.6% margin against $< 200\text{ ms}$ requirement).
  - **Cursor Pagination p95:** **85.92 ms** | **Skills Filter p95:** **85.69 ms** | **Teammates Discovery p95:** **127.39 ms**.
- **Database Query Plans:** 9 critical queries profiled via `.explain("executionStats")` $\rightarrow$ **0 COLLSCANs**, **0 in-memory sorts**, sub-millisecond execution.

---

### 5. Architectural Trade-offs & Limitations
- **Replica-Set Transactions vs Contention:** MongoDB multi-document transactions ensure distributed consistency but incur write-lock contention under extreme concurrency. Handled via exponential backoff retries.
- **Free-Tier Constraints:** Deployed on Render free tier (512MB RAM, shared vCPU) with MongoDB Atlas M0. Cold starts (30–50s spin-up) occur after 15 min of inactivity; local benchmarks accurately isolate engine performance.
- **Single-Node Rate Limiting & Outbox:** Sliding-window rate limiters and SSE dispatchers run in-process. Suitable for single-instance; horizontal scale requires Redis Pub/Sub.

---

### 6. With One Additional Week...
1. **Distributed Event Fabric:** Replace in-memory outbox polling with MongoDB Change Streams and a Redis/Valkey cluster for horizontal multi-region scale.
2. **Chaos & Network Partition Testing:** Automated Jepsen-style chaos testing simulating primary elections and network partitions during transactions.
3. **Advanced Matching:** Vector embeddings for semantic hackathon project concept and complementary teammate matchmaking.
