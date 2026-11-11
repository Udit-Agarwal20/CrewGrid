# CrewGrid — Concurrency & Race Verification Report (Milestone M5)

**Environment:** Local MongoDB 8.0 Replica Set (`rs0`) @ `127.0.0.1:27017`  
**Test Suite:** `apps/api/test/concurrency.race.test.ts`  
**Vitest Version:** `v3.2.7`  
**Date:** 2026-11-10  
**Status:** ALL 8 CONCURRENCY RACES PASSED (0 Invariant Violations)

---

## 1. Concurrency Test Matrix & Official Requirement Mapping

| Test Identifier | Official Obligation | Concurrency Condition | Target Resource & Contention | Expected Invariant Outcome | Observed Result |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **RACE 1** | **O-04** (Mandatory) | 50 distinct authenticated users race concurrently for 1 remaining team seat via invite redemption | Team `memberCount: 4`, `maxSize: 5` (1 seat available); 50 concurrent `POST /api/v1/invites/redeem` | Exactly 1 user admitted (HTTP 200); 49 users rejected (HTTP 409 `TEAM_FULL`); 0 5xx errors; final count = 5. | **PASS** (4003ms) |
| **RACE 2** | **O-04** (Mandatory) | 50 concurrent join request approvals fired by team leader for 1 remaining seat | Team `memberCount: 4`, `maxSize: 5`; 50 pending join requests; concurrent `POST /api/v1/requests/:id/approve` | Exactly 1 approval commits (HTTP 200); 49 approvals rejected (HTTP 409 `TEAM_FULL`); exactly 1 request status = 'approved'. | **PASS** (3445ms) |
| **RACE 3** | **O-03, O-04** | Dual Join Race: Same user simultaneously redeems invites for 2 different teams in the same hackathon | 1 user, 2 valid invite tokens for 2 different teams; concurrent `POST /api/v1/invites/redeem` | Exactly 1 membership committed; 1 rejected with 409; total memberships for user = 1; losing team counter rolled back. | **PASS** (236ms) |
| **RACE 4** | **O-05** | Idempotency Replay Race: 20 simultaneous duplicate POST requests with the same `Idempotency-Key` | Single user, concurrent `POST /api/v1/hackathons/:id/teams` with identical idempotency UUID | Exactly 1 original execution (HTTP 201), 19 replayed responses (HTTP 201 with header `idempotency-replayed: true`); exactly 1 team created. | **PASS** (116ms) |
| **RACE 5** | **O-03** | Leader Departure vs Incoming Joiner Race | Team leader calls `POST /teams/:id/leave` while candidate calls `POST /invites/redeem` | Team never left leaderless: either joiner commits first and inherits leadership (HTTP 200, `teamDeleted: false`), or leader leaves first, deletes team, and joiner receives 404/409. | **PASS** (174ms) |
| **RACE 8** | **O-04, O-06** | Single-Use Invite Race: 2 users concurrently attempt to redeem the exact same single-use invite token | 1 token, 2 distinct users calling `POST /api/v1/invites/redeem` | Token redeemed exactly once (HTTP 200 for 1, HTTP 409 for 1); team `memberCount` increments by exactly 1. | **PASS** (204ms) |
| **RACE 9** | **O-03, O-04** | Capacity Shrink vs Admission Race | Leader calls `PATCH /teams/:id` shrinking `maxSize` to 1 while joiner calls `POST /invites/redeem` | `memberCount <= maxSize` invariant is strictly preserved at all times. Neither operation violates bounds. | **PASS** (158ms) |
| **RACE 10** | **O-03** | Admission into Logically Deleted Team | Leader leaves sole-member team (triggering logical deletion) while candidate redeems invite | Candidate receives HTTP 404 `TEAM_NOT_FOUND`; deleted team cannot be revived; `deletedAt != null`. | **PASS** (159ms) |

---

## 2. Invariant Engine Automated Checks

Following each race test, `verifyAllInvariants()` was automatically executed against the active MongoDB replica set database:
- **I-01:** `memberCount == count(memberships)` for all teams: **0 VIOLATIONS**
- **I-02:** `memberCount <= maxSize` for all teams: **0 VIOLATIONS**
- **I-03:** `count(memberships where hackathonId == H and userId == U) <= 1`: **0 VIOLATIONS**
- **I-04:** Every non-deleted team has an active leader membership: **0 VIOLATIONS**
- **I-05:** Unique pending join request per user-team pair: **0 VIOLATIONS**
- **I-06:** No orphaned memberships referencing non-existent or deleted teams: **0 VIOLATIONS**

---

## 3. Test Execution Log Excerpt

```
 RUN  v3.2.7 /Users/uditagarwal/Desktop/CrewGrid/apps/api

 ✓ test/concurrency.race.test.ts (8 tests) 8566ms
   ✓ Critical Concurrency & Race Tests (Milestone M2) > RACE 1 (O-04): 50 distinct authenticated users race for the 1 remaining seat via invites; EXACTLY ONE succeeds  4003ms
   ✓ Critical Concurrency & Race Tests (Milestone M2) > RACE 2: 50 concurrent join request approvals for 1 remaining seat; EXACTLY ONE succeeds  3445ms
   ✓ Critical Concurrency & Race Tests (Milestone M2) > RACE 3: user concurrently redeems invites for two different teams in same event; EXACTLY ONE membership commits 236ms
   ✓ Critical Concurrency & Race Tests (Milestone M2) > RACE 4: 20 simultaneous duplicate requests with the same Idempotency-Key create exactly one team 116ms
   ✓ Critical Concurrency & Race Tests (Milestone M2) > RACE 5: leader leaves while an incoming applicant redeems an invite; team never becomes leaderless 174ms
   ✓ Critical Concurrency & Race Tests (Milestone M2) > RACE 8: two users concurrently attempt to redeem the SAME single-use invite; EXACTLY ONE succeeds 204ms
   ✓ Critical Concurrency & Race Tests (Milestone M2) > RACE 9: leader shrinking maxSize concurrently with a user redeeming invite cannot violate capacity bounds 158ms
   ✓ Critical Concurrency & Race Tests (Milestone M2) > RACE 10: attempting to join a logically deleted team is rejected with 404 TEAM_NOT_FOUND 159ms

 Test Files  1 passed (1)
      Tests  8 passed (8)
   Duration  9.35s
```

