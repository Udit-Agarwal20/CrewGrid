# CrewGrid — Production Scale & Load Benchmark Report

**Challenge:** Hack4Hack Crew Hiring Challenge 2026 — Problem Statement 1  
**Obligation ID:** **O-11** (10,000 synthetic participants, 2,000 teams, 100 concurrent VUs, board p95 < 200 ms)  
**Measured Live Board p95:** **88.83 ms** (**PASSED** — 55.6% faster than requirement)  
**System Throughput:** **1,200.4 requests/second** (68,728 requests processed with 0.00% error rate)  
**Evaluation Date:** 2026-11-10  
**Verified Commit:** `4f9c829`  

---

## 1. Executive Summary

Milestone M5 evaluated CrewGrid's ability to maintain transactional integrity, low latency, and zero error rates under peak competition concurrency. Testing was structured into three complementary phases:
1. **Deterministic Scale Dataset Generation:** Populated an isolated database with 10,000 users and 2,000 teams across varying capacities.
2. **MongoDB Query Plan Inspection:** Audited 9 critical API queries using `.explain("executionStats")` to verify index coverage, zero collection scans (COLLSCAN), and zero in-memory sorts.
3. **k6 Concurrency Load Test:** Simulated 100 concurrent virtual users executing live discovery, cursor pagination, skill filtering, and teammate matching flows.
4. **50-Way Last-Seat Race Test (O-04):** Fired 50 simultaneous join attempts for a single open slot, proving that exactly one user is admitted while 49 receive HTTP 409 `TEAM_FULL`.

---

## 2. Test Environment & Hardware Specifications

| Parameter | Local Benchmark Environment | Render / Atlas Hosted Environment |
| :--- | :--- | :--- |
| **Host System** | macOS 15.x (Darwin arm64, Apple Silicon) | Linux (Render Cloud Container) |
| **CPU / Cores** | 10 Physical Cores (dedicated) | Shared vCPU (throttled) |
| **RAM** | 16 GB unified memory | 512 MB memory limit |
| **Node.js Runtime** | Node.js v24.15.0 LTS | Node.js v24 LTS |
| **Database Server** | MongoDB 8.0.x Single-Node Replica Set (`rs0`) | MongoDB Atlas M0 Free Tier (3-node replica set) |
| **Storage Engine** | WiredTiger (Default cache) | WiredTiger (Shared RAM allocation) |
| **Load Driver** | k6 v2.3.0 (darwin/arm64) | — |
| **Network Latency** | Loopback TCP (`127.0.0.1`, sub-millisecond) | Public Internet / Cloudflare CDN (~30–80 ms) |

> [!IMPORTANT]
> **Environment & Free-Tier Disclosure:**  
> The 100-VU load test was executed in a controlled local replica-set environment to isolate true database engine and Node.js execution throughput without artificial cloud provider throttling. Hosted free-tier instances (Render free web service and MongoDB Atlas M0) experience cold-start delays (30–50s spin-up after 15 minutes of inactivity) and shared CPU credit exhaustion. The local benchmarks provide reproducible proof of architectural and indexing correctness.

---

## 3. Scale Dataset Characteristics (`scripts/seed-scale.ts`)

- **Script:** [`scripts/seed-scale.ts`](file:///Users/uditagarwal/Desktop/CrewGrid/scripts/seed-scale.ts)
- **Target Database:** `crewgrid_bench` (isolated; guarded against production database strings)
- **Execution Time:** **0.98 seconds**

### Generated Entities & Distribution

```json
{
  "database": "crewgrid_bench",
  "counts": {
    "users": 10000,
    "teams": 2000,
    "memberships": 4836,
    "unassignedParticipants": 5164,
    "auditEvents": 4836,
    "realtimeEvents": 4836
  },
  "teamsDistribution": {
    "empty": 0,
    "partial": 1184,
    "full": 816
  },
  "invariantsVerified": true,
  "violationsCount": 0
}
```

### Safety & Integrity Controls
- **Production Guard:** Aborts immediately if connection string or database name matches `/prod/i`.
- **Precomputed Argon2id Hash:** A single precomputed RFC 9106 hash (`BenchmarkPassword123!`) was utilized during batch insertion to seed 10,000 real accounts without CPU starvation.
- **Invariants Verified:** Automated verification confirmed 0 violations across all 6 core domain invariants immediately post-seed.

---

## 4. Query Plan Analysis & Index Optimization

Using [`scripts/inspect-query-plans.ts`](file:///Users/uditagarwal/Desktop/CrewGrid/scripts/inspect-query-plans.ts), all 9 critical queries were analyzed against `crewgrid_bench` via MongoDB `.explain("executionStats")`:

| Query Path | Target Collection | Winning Index | Keys Examined | Docs Examined | Returned | In-Memory Sort | Execution Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Team Discovery (Live Board Page 1)** | `teams` | `board_active_updated` | 12 | 12 | 12 | **NO (INDEXED)** | **PASS** |
| **Team Discovery (Cursor Pagination Page 2)** | `teams` | `board_active_updated` | 24 | 24 | 12 | **NO (INDEXED)** | **PASS** |
| **Team Discovery (Skill Filter)** | `teams` | `board_skills` | 12 | 12 | 12 | **NO (INDEXED)** | **PASS** |
| **Team Discovery (Only Open Seats)** | `teams` | `board_active_updated` | 15 | 15 | 12 | **NO (INDEXED)** | **PASS** |
| **Team Details Lookup (findActiveById)** | `teams` | `_id_` | 1 | 1 | 1 | **NO (INDEXED)** | **PASS** |
| **Team Roster Memberships** | `memberships` | `team_roster_succession` | 1 | 1 | 1 | **NO (INDEXED)** | **PASS** |
| **User Event Membership Guard** | `memberships` | `uniq_member_per_event` | 1 | 1 | 1 | **NO (INDEXED)** | **PASS** |
| **Candidate Teammates Board** | `users` | `candidate_discovery` | 12 | 12 | 12 | **NO (INDEXED)** | **PASS** |
| **Candidate Teammates by Timezone** | `users` | `candidate_timezone` | 12 | 12 | 12 | **NO (INDEXED)** | **PASS** |

### Note on Database Execution Timings
MongoDB's `executionStats` timer reports elapsed time in integer milliseconds rounded down. When queries are fully covered or index-supported on cached working sets (WiredTiger in-memory buffer cache), index key traversal and document fetching complete in microseconds (< 1.0 ms), which MongoDB rounds down to `0 ms`. This confirms that **no expensive disk seeks, table-scans (COLLSCAN), or in-memory sorting buffers** occurred.

---

## 5. k6 Concurrency Load Test (100 Concurrent VUs)

- **Test Suite:** [`benchmarks/k6-board-load.js`](file:///Users/uditagarwal/Desktop/CrewGrid/benchmarks/k6-board-load.js)
- **Profile:** 10s ramp-up $\rightarrow$ 45s sustained 100 VUs $\rightarrow$ 5s ramp-down.
- **Total Requests Completed:** **68,728** requests across 57.3 seconds.
- **Sustained Throughput:** **1,200.4 requests/second**.
- **HTTP Error Rate:** **0.00%** (0 failed requests).
- **Data Transferred:** 383 MB received (6.7 MB/s), 17 MB sent.

### Latency Distribution by Endpoint

| Endpoint / Tag | Min | Median (p50) | p90 | p95 (Official Target) | p99 | Max | Result |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Live Team Board (`endpoint:board`)** | 0.81 ms | 55.03 ms | 76.81 ms | **88.83 ms** (< 200 ms) | 122.40 ms | 456.83 ms | **PASSED** |
| **Cursor Pagination (`endpoint:board_cursor`)**| 0.79 ms | 53.64 ms | 74.49 ms | **85.92 ms** (< 200 ms) | 118.15 ms | 289.41 ms | **PASSED** |
| **Skill Filter (`endpoint:board_filtered`)** | 0.82 ms | 53.51 ms | 74.28 ms | **85.69 ms** (< 200 ms) | 117.92 ms | 312.18 ms | **PASSED** |
| **Teammates Matching (`endpoint:teammates`)** | 1.10 ms | 78.40 ms | 109.85 ms| **127.39 ms** (< 250 ms)| 175.60 ms | 412.05 ms | **PASSED** |
| **Overall HTTP Duration (Combined)** | 0.55 ms | 61.76 ms | 94.62 ms | **106.48 ms** | 148.90 ms | 456.83 ms | **PASSED** |

---

## 6. 50-Way Last-Seat Concurrency Race Test (O-04)

In addition to read-heavy board querying, CrewGrid's core transactional engine was tested under maximum write contention in [`apps/api/test/concurrency.race.test.ts`](file:///Users/uditagarwal/Desktop/CrewGrid/apps/api/test/concurrency.race.test.ts):
- **Scenario:** A team is prefilled with 4 members (`maxSize: 5`, exactly 1 seat open).
- **Race Condition:** 50 distinct authenticated users simultaneously redeem single-use invite tokens via `POST /api/v1/invites/redeem`.
- **Measured Outcome:**
  - **HTTP 200 (Admitted):** **EXACTLY 1 user** (took 4.00s under lock contention).
  - **HTTP 409 `TEAM_FULL`:** **EXACTLY 49 users** safely rejected.
  - **HTTP 5xx Server Errors:** **0 errors**.
  - **Database Invariant Check:** Team `memberCount == 5`, active memberships count == 5. **0 invariant violations**.

---

## 7. How to Reproduce Locally

```bash
# 1. Start local MongoDB replica set
docker compose up -d --wait

# 2. Seed 10,000 synthetic participants and 2,000 teams into crewgrid_bench
npx tsx scripts/seed-scale.ts --confirm

# 3. Inspect query execution plans
npx tsx scripts/inspect-query-plans.ts

# 4. Generate 100 benchmark session tokens
npx tsx scripts/prepare-bench.ts

# 5. Build and launch API server in production mode on port 3000
pnpm -r build
NODE_ENV=production MONGODB_DB=crewgrid_bench PORT=3000 node apps/api/dist/src/server.js &
API_PID=$!

# 6. Run k6 load test (100 VUs)
./bin/k6 run benchmarks/k6-board-load.js

# 7. Cleanup server
kill $API_PID
```

---

## 8. Conclusions & Known Trade-offs

1. **Compound Indexing Eliminates In-Memory Sorts:** Suffixing `{ updatedAt: -1, _id: -1 }` to compound index keys reduced query execution time from scanning 145 keys to 12 keys, preventing V8 memory pressure.
2. **Keyset Pagination vs Offset:** Using cursor dates and ObjectIds ensures consistent sub-100ms response times at any pagination depth, avoiding the $O(N)$ scanning penalty of `skip(N)`.
3. **Transaction Write Latency vs Safety:** While reads achieve p95 < 90 ms, high write contention under 50 simultaneous writers incurs write-lock serialization (~3.5–4.0s for the entire 50-way race to resolve). This is an intentional engineering trade-off: **correctness and zero overbooking take precedence over speculative write latency**.

