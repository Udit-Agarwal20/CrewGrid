# CrewGrid — Load & Performance Benchmark Report

**Competition Target:** 100 concurrent virtual users, live team board p95 latency < 200 ms.  
**Result:** **PASSED (p95 = 88.83 ms, 0.00% errors, 1,200.4 RPS)**  
**Test Timestamp:** 2026-11-10T17:40:52Z  
**Benchmark Suite:** `benchmarks/k6-board-load.js`  
**Dataset Scale:** 10,000 synthetic participants, 2,000 teams in `crewgrid_bench`  

---

## 1. Test Environment Specifications

| Component | Specification |
|---|---|
| **Host System** | macOS 15.x arm64 (Apple Silicon) |
| **API Server** | Node.js v24.15.0 (Express 5.0.1, Production mode) |
| **Database** | MongoDB 8.0.x Single-Node Replica Set (`rs0`) |
| **Storage Engine** | WiredTiger (Default local replica set) |
| **Load Generator** | k6 v2.3.0 (commit `e088784614`, darwin/arm64) |
| **Dataset State** | Seeded with `scripts/seed-scale.ts` (10,000 users, 2,000 teams, 4,836 memberships) |
| **Network** | Loopback TCP (127.0.0.1) |

> [!NOTE]
> This benchmark measures maximum local engine and query throughput with zero artificially throttled cloud resources. As required by the Hack4Hack submission guidelines, Free-Tier Render and Atlas M0 instances exhibit sleep/rate-limits that do not reflect true unbounded engine performance.

---

## 2. Load Profile & Scenarios

The load test evaluated 100 concurrent virtual users over two coordinated phases:
1. **Warmup Phase (10s):** Ramping 10 → 50 → 100 VUs to eliminate Node.js V8 JIT and WiredTiger cache cold-start bias.
2. **Sustained Phase (45s):** 100 constant concurrent virtual users making realistic discovery and pagination requests with human think-time jitter (20ms – 50ms).

Each VU executed a representative user flow across every iteration:
1. `GET /api/v1/hackathons/:id/teams?limit=12` (Live Team Board Default Page 1)
2. `GET /api/v1/hackathons/:id/teams?cursor=...&limit=12` (Cursor-based Pagination Page 2)
3. `GET /api/v1/hackathons/:id/teams?skill=:skill&limit=12` (Skill-filtered Board Search)
4. `GET /api/v1/hackathons/:id/teammates?limit=12` (Unassigned Candidate Teammates Matching)

---

## 3. Benchmark Results & Threshold Comparison

| Metric / Endpoint | Target Threshold | Measured Result | Margin of Compliance | Verdict |
|---|---|---|---|---|
| **Live Team Board (`endpoint:board`)** | **p(95) < 200 ms** | **88.83 ms** | **-111.17 ms (55.6% below target)** | **PASS** |
| **Cursor Pagination (`endpoint:board_cursor`)** | **p(95) < 200 ms** | **85.92 ms** | **-114.08 ms (57.0% below target)** | **PASS** |
| **Skill Filtered (`endpoint:board_filtered`)** | **p(95) < 200 ms** | **85.69 ms** | **-114.31 ms (57.2% below target)** | **PASS** |
| **Candidate Discovery (`endpoint:teammates`)** | **p(95) < 250 ms** | **127.39 ms** | **-122.61 ms (49.0% below target)** | **PASS** |
| **HTTP Error Rate (`http_req_failed`)** | **rate < 1.00%** | **0.00% (0 / 68,728)** | **Zero failures** | **PASS** |
| **Functional Check Pass Rate** | **100.00%** | **100.00% (85,910 / 85,910)** | **Zero defects** | **PASS** |

---

## 4. Latency Distribution & Throughput Statistics

```
========================================================================================
                              THROUGHPUT & LATENCY METRICS
========================================================================================
  Metric                                Value
----------------------------------------------------------------------------------------
  Total Requests Completed              68,728 requests
  Total Execution Time                  57.3 seconds
  Sustained Throughput                  1,200.4 requests/second
  Network Data Transferred              383 MB received (6.7 MB/s), 17 MB sent
  Total Iterations Completed            17,182 iterations (300.1 iterations/sec)
  Concurrent Virtual Users              100 VUs constant

  Overall Latency Distribution (All Endpoints):
    - Minimum:                          0.55 ms
    - Median (p50):                     61.76 ms
    - Average:                          64.41 ms
    - 90th Percentile (p90):            94.62 ms
    - 95th Percentile (p95):            106.48 ms
    - Maximum:                          456.83 ms
========================================================================================
```

---

## 5. Architectural Factors Enabling High Concurrency

1. **Compound Index Alignment:** Sorting tails (`updatedAt: -1, _id: -1`) baked directly into indexes eliminate all in-memory sorting (`SORT` stage count: 0).
2. **Stable Keyset Pagination:** Cursor-based pagination uses index boundaries instead of inefficient `skip(N)` operations, ensuring $O(1)$ query time at arbitrary depth.
3. **Session Verification Speed:** Fast single-document point lookup on indexed `sessions` (`tokenHash: 1`).
4. **Optimized Projections:** Domain mapping functions strip internal MongoDB fields efficiently before sending JSON envelopes.

