# 07 — Test, Quality Assurance and Performance Plan

**Quality position:** An automated test that exercises real MongoDB transaction behavior is the central deliverable. Fake in-memory repository mocks are not acceptable as proof of PS1 correctness. Every test report must distinguish planned from executed.

## 1. Test pyramid and environments

| Layer | Tool / runtime | Main proof |
|---|---|---|
| Unit | Vitest | Validation, scoring, error mapping, pure state rules |
| API integration | Vitest + Supertest + MongoDB replica set | Auth, permissions, transaction, idempotency, race |
| Browser E2E | Playwright + axe-core where available | Whole React flow, keyboard/mobile and real API |
| Load/performance | k6 (or autocannon with documented equivalent) | 100 concurrent users, board endpoint p95 <200ms |
| Invariant checker | TypeScript script | Counts, unique membership, valid leader, no ghost team |
| Chaos (bonus) | Process kill + restart in isolated container | Transaction rollback and outbox recovery |
| CI | GitHub Actions | ≥20 API tests and full build on PR/push |

Unit mocks must never replace integration tests for transaction guarantees. Use single-node Mongo replica set for CI and local; do not use MongoMemoryServer standalone mode for transaction tests.

## 2. Deterministic fixture setup

- Use separate `crewgrid_test` DB, isolated per suite or test case. Index creation must complete before tests.
- Test helper creates event, leader, team with `maxSize:5`, initial four **real** memberships and matching `memberCount:4`, plus 50 distinct eligible users.
- To exercise the real **invite path**, leader creates 50 unique unexpired single-use invites, one per racer. Each racer redeems independently in synchronized parallel API requests. This proves exactly one final seat admission without a testing backdoor.
- To exercise **approval path**, create 50 pending join requests, then issue 50 authenticated approval calls from leader's session with unique idempotency keys simultaneously; only one approve commits (others `TEAM_FULL` after retry), and no request is incorrectly marked approved without membership.
- To exercise **cross-team same-user race**, one user holds two valid invites for teams A/B, redeems simultaneously; exactly one membership due to unique `(hackathonId,userId)`.
- Use `Promise.allSettled`, a shared barrier, agent keepalives and a bounded deadline; don't serialize requests by awaiting inside loop. If needed, use worker processes to create true overlapping network requests and demonstrate overlap in logs.
- Avoid brittle assertion that all losing attempts must have identical timing; assert one `2xx`, no partial writes, no unexpected `5xx`, all failures are documented conflict codes (or explicitly documented bounded 503 if overload outside pass criteria).

## 3. Automated API test catalog (40 planned)

| ID | Test | Expected |
|---|---|---|
| T-001 | Register valid profile | 201, email unique |
| T-002 | Duplicate email | 409 or deliberate generic failure, no second user |
| T-003 | Wrong login password | 401, no session |
| T-004 | Logout invalidates session | next `/auth/me` 401 |
| T-005 | Expired session rejected | 401 even before TTL deletion |
| T-006 | Missing CSRF on state mutation | 403 |
| T-007 | Create team valid | team+leader membership+audit, count 1 |
| T-008 | Create team invalid min/max | 422 no writes |
| T-009 | Duplicate create key+payload | replay, exactly one team |
| T-010 | Same create key different payload | 409 fingerprint mismatch |
| T-011 | Separate create while already member | `ALREADY_IN_TEAM`, no ghost team |
| T-012 | Two simultaneous team creates same user | one winning membership, one team |
| T-013 | Team board returns active only | deleted excluded |
| T-014 | Team board paginate/filter/seat computed | stable cursor and correct seat state |
| T-015 | Create one pending request | 201 no seat held |
| T-016 | Duplicate pending request | no duplicate request |
| T-017 | Nonleader cannot approve | 403 |
| T-018 | Leader approves valid request | membership+counter+audit+status all match |
| T-019 | Leader declines pending | declined, no membership |
| T-020 | Applicant cancels pending | canceled, no membership |
| T-021 | Re-approve resolved request | conflict/replay, no duplicate |
| T-022 | 50 concurrent leader approvals, one free seat | exactly one membership, all invariants |
| T-023 | 50 concurrent invite redemptions, one free seat | exactly one membership, all invariants |
| T-024 | Same user joins two teams concurrently | exactly one membership overall |
| T-025 | Valid invite redemption | one membership, invite used once |
| T-026 | Invite expiration regardless of TTL | rejected |
| T-027 | Reuse used invite | rejected, no side effect |
| T-028 | Revoke invite and retry | rejected |
| T-029 | Nonleader tries creating invite | 403 |
| T-030 | Member leaves | count decremented, membership deleted, audit |
| T-031 | Leader leaves with remaining members | deterministic leader transfer |
| T-032 | Last member leaves | team marked deleted, count 0, no memberships |
| T-033 | Nonleader remove member | 403 |
| T-034 | Leader removes nonleader | count decremented, no target membership |
| T-035 | Transfer to non-member | 409/422, no state change |
| T-036 | Concurrent resize versus admit | cannot overfill, count consistent |
| T-037 | SSE public scope contains no private fields | only safe metadata |
| T-038 | Rolled-back mutation emits no SSE event | no ghost notification |
| T-039 | Scoring ranked and explainable | deterministic + 70/30 math |
| T-040 | Non-opt-in/already-member excluded from candidate list | privacy respected |

**CI rule:** At least T-001–T-035 plus one race test run in CI; minimum official threshold is 20, but our target is 35+ API tests. The race test must actually be included, not tagged skip/only.

## 4. Concurrency acceptance pseudocode

```ts
const { team, inviteTokens, users } = await fixtureTeamWithOneSeatAnd50Invites();
const responses = await Promise.allSettled(
  users.map((user, i) => authenticatedAgent(user).post('/api/v1/invites/redeem')
    .set('Idempotency-Key', crypto.randomUUID())
    .set('X-CSRF-Token', user.csrf)
    .send({ token: inviteTokens[i] }))
);
// Extract actual HTTP responses, not just fulfilled promises.
assert.equal(countStatus2xx(responses), 1);
assert.equal(countStatus5xx(responses), 0);
assert.equal(await memberships.countDocuments({ teamId: team._id }), team.maxSize);
assert.equal((await teams.findOne({ _id: team._id })).memberCount, team.maxSize);
await assertAllInvariants();
```

**Implementation warning:** Supertest can be backed by local Express handler with no actual TCP simultaneity. Ensure real asynchronous overlap and separate DB client sessions; consider real server HTTP test with concurrency barrier. A 50-way race can be flaky under resource constraints; run ≥5 repetitions and report actual environment, never claim deterministic proof from one lucky pass.

## 5. Additional high-contention tests

- Duplicate idempotency key sent 20 times concurrently for same create; replay exact response and no duplicate audit/outbox.
- Same user redeemed two different invites simultaneously; only one membership across event.
- Last leader leaves at same time another user tries to redeem; team either survives with valid successor or is deleted with no memberships; never leaderless or phantom member.
- Edit `maxSize` down concurrently with a join; final max remains ≥ memberCount.
- Remove member concurrent with member leaving voluntarily; count decreases once.
- Approve versus cancel request; exactly one terminal outcome and no contradictory audit.
- Invite redemption concurrent with revoke; outcome deterministic by commit order; no post-revoke successful redemption.
- Simulated network disconnect after commit / retry same key; exactly one resulting membership, replay consistent.

## 6. Performance benchmark — 100 concurrent users

**Seed:** `seed --users=10000 --teams=2000 --seed=2026`. Ensure event has mixed full/open teams and query filters are representative. Validate indexes and explain plan before load test. **Target:** p95 for board GET `http_req_duration{endpoint:board} < 200ms` with `vus:100` for sustained phase, e.g. 60s after 20s warmup; include error-rate threshold <1% and report total throughput. For a rigorous 100 **concurrently active** test, use constant-vus 100; think time means not all 100 make requests at the same millisecond, disclose that interpretation and if needed perform arrival burst test separately.

Example k6 option concept:

```js
export const options = {
  scenarios: { board: { executor: 'constant-vus', vus: 100, duration: '90s' } },
  thresholds: {
    'http_req_duration{endpoint:board}': ['p(95)<200'],
    'http_req_failed{endpoint:board}': ['rate<0.01'],
  },
};
// GET only /api/v1/hackathons/:id/teams?limit=12;
// add tag endpoint=board; add valid auth cookie; measure real HTTP;
// summarize response status, 95/99th percentiles and number of completed iterations.
```

**Warmup policy:** run separate warmup (not included in measured report) then full test; include both cold-start and warm-case results separately if tested. A k6 client launched on same host may contend for CPU, skew results; report host cores/RAM and network. Avoid naive average replacing p95.

### Report template (do not fill in fake results)

```text
Test date/time UTC: [actual]
Commit hash: [actual]
Target: [localhost/local network/Render URL]
API host / CPU / RAM: [actual]
MongoDB deployment / tier: [actual]
Seed fixture: 10000 users, 2000 teams, variant [seed]
Script: [path, SHA/commit]
Virtual users: 100, duration [actual], warmup [actual]
Requests: [actual], throughput: [actual]
Success/error rate: [actual]
p50/p95/p99: [actual ms]
Threshold result: [PASS/FAIL based on p95 <200ms]
Observed problems / limits: [actual]
Raw k6 output: [relative file path]
```

**Crucial honesty:** Free MongoDB Atlas M0 has operation rate limits and Render free instances sleep; do not cite a warm local p95 as proof of remote p95. If the target is missed, describe why and optimization attempted, keep raw report. Index tuning is not assumed until explain data supports it.

## 7. UI and accessibility E2E

| E2E | Steps |
|---|---|
| E-01 | Register → profile → create team → see Forming 1/5 |
| E-02 | Request join user A → leader approves → both view 2/5 without refresh |
| E-03 | Leader generates invite → user redeems → one new membership |
| E-04 | Last seat lost during approval → visible error, no stale optimistic count |
| E-05 | Leader leaves → valid successor and updated controls |
| E-06 | Mobile 375px create, discover, request, leave; no horizontal scroll |
| E-07 | Keyboard-only navigation through dialogs, fields, requests and leave |
| E-08 | Logged-out session redirected to login and back to safe local return path |
| E-09 | SSE disconnect and reconnect → data refetch consistent |
| E-10 | Candidate privacy toggle off removes discoverable listing |

Use Playwright screenshot assertions sparingly; prefer semantic actions and accessibility roles. If add `@axe-core/playwright`, verify contrast/labels, then manual keyboard audit. Testing against mock mode cannot substitute for real API tests.

## 8. CI stages and quality gates

1. `pnpm install --frozen-lockfile`
2. `pnpm lint` (ESLint + formatting check)
3. `pnpm typecheck` strict
4. `pnpm test:unit` (pure tests)
5. Start MongoDB replica set service or Docker container; initialize RS; wait for PRIMARY; create indexes.
6. `pnpm test:api` including at least 1 full 50-way race and invariant audit.
7. `pnpm build` (api+web).
8. Optional Playwright smoke tests in dedicated job with browsers installed.
9. Report coverage if configured; **do not impose a meaningless global percentage instead of required critical-path coverage**.

Never mark CI green if the race suite was skipped due to a timeout. Record test logs and failures as artifacts when possible.

## 9. Bonus chaos protocol (P2)

Start API and mongo in containers; issue membership operation while injecting `SIGKILL` mid-transaction before commit and separately immediately after commit; restart; query authoritative membership and audit/outbox. In before-commit case: rollback → no seat consumed. In after-commit case: mutation committed, idempotency key can replay. Prove via captured logs and invariant script. Do not kill MongoDB primary as substitute for killing API; the test targets different guarantees.

## 10. Exit gate

- 20+ API tests in CI, race test included and repeated locally.
- Unique memberships and count invariants verified after all adversarial tests.
- Load report with real p95 for 100 VUs and 10k/2k seed, with truthful pass/fail.
- Public demo all critical flows tested and no severe auth/permission issues.
- Source code / reported tests match commit hash; no stale docs.
