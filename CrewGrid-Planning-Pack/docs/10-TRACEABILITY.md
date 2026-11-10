# 10 — Official Requirements → Implementation → Test → Submission Evidence

Use this matrix as the authoritative **coverage gate**. O-IDs refer to `00-SCOPE-DECISIONS.md`; FR-IDs refer to `01-PRD.md`; T-IDs refer to `07-TEST-PLAN.md`. Checklists indicate **planned**, not completed. Only mark pass after evidence exists at the referenced commit.

| O-ID | Official obligation | Functional IDs | Components / docs | Primary evidence |
|---|---|---|---|---|
| O-01 | Min/max team and one team per user per event | FR-005/006/009/010 | `teams`, `memberships`, unique index | T-007/008/011/012/036 + invariant script |
| O-02 | Invite codes expire | FR-016/017 | `invites`, expiry guard | T-025…029 |
| O-03 | Leader succession / last leaves deletes | FR-011/012/013 | `membership.service`, `teams.deletedAt` | T-030…035 |
| O-04 | Exactly 1 of 50 takes last seat | FR-010/015–017 | conditional reserve+transaction | T-022 and T-023, repeated, raw results |
| O-05 | Idempotent join/create | FR-006/010/023 | scoped key+fingerprint+unique index | T-009/010/021 and 20-way duplicate |
| O-06 | Live board and team pages | FR-007/021 | SSE + outbox + client invalidation | T-037/038, E-02/E-09 |
| O-07 | Auth, leader authorization, entropy/rate-limit, validation | FR-001/002/004/015–017/024 | cookie auth, CSRF, Zod | T-001–006/017/029/033, security manual |
| O-08 | Audit every team change | FR-022 | transactional audit_events | T-007/018/030/032 + audit reconciliation |
| O-09 | Rank by skills/timezone, explain | FR-019/020 | `matching.service` | T-039/040 + UI explanation |
| O-10 | ≥20 API tests incl race in GitHub Actions | FR-025 | Vitest/Supertest/CI | CI run link, count, logs |
| O-11 | 10k user+2k team seed; 100 concurrent; board p95<200ms | FR-026/027 | seed, k6, indexed board | raw seed count, k6 report, explain metrics |
| O-12 | Whole-flow React UI mobile/keyboard | FR-029 | UI screens S-01…S-10 | E-01…E-10 + manual keyboard record |
| O-13 | Live free-tier URL | FR-028 | Docker/Render+Atlas | deployed URL + smoke record |

## Bonus coverage

| Bonus | Implementation | Evidence | Drop policy |
|---|---|---|---|
| Optimistic rollback | TanStack Query guarded updates | conflict E2E + screenshot | P1 after correctness |
| One-command Docker Compose | API+web+RS compose profiles | clean clone run succeeds | P1, worthwhile |
| Tracing/metrics | Pino structured fields + simple counters | console/metrics evidence | P1 low priority |
| Crash chaos | SIGKILL API before/after commit | logs + invariant script | P2 only if all O-IDs green |

## API contract crosslinks

| Domain | Collections | API IDs | Screen |
|---|---|---|---|
| Auth/profile | users,sessions | A-01…A-07 | S-02,S-03 |
| Event + team board | hackathons,teams | A-08…A-12 | S-04,S-05,S-06 |
| Join requests | join_requests,teams,memberships | A-13…A-18 | S-06,S-07 |
| Invites | invites,teams,memberships | A-19…A-22 | S-09 |
| Membership/leadership | teams,memberships,audit_events | A-23…A-26 | S-06,S-10 |
| Candidate/matching | users,memberships | A-27,A-28 | S-08 |
| SSE | realtime_events | A-29 | All dynamic screens |
| Health | — | A-30,A-31 | Ops/evaluator |

## Verification notes and unresolved checks

- Confirm every API route appears in `contracts/openapi.yaml`; its first version is a **baseline**, not a running service. Extend schema examples as code becomes concrete.
- `team.deleted` as soft deletion is the chosen interpretation, document in one-pager.
- A **fully correct admission test** checks both exactly-one success and no hidden DB count drift.
- Race tests must go through real authorized API pathways, not developer-only bypass routes.
- The official scoring has **no published numerical percentage**; do not invent judge weights.
- No hosted benchmark should claim p95 target based exclusively on local test or cold-start-excluded data without disclosure.

## Sign-off list

- [ ] O-01 min/max + unique membership verified
- [ ] O-02 invite expiry/reuse/entropy verified
- [ ] O-03 leadership/last leave verified
- [ ] O-04 both 50-way cases run and pass
- [ ] O-05 creation/admission idempotency verified
- [ ] O-06 realtime board/team + reconnect verified
- [ ] O-07 auth/CSRF/authorization/rate-limit/validation verified
- [ ] O-08 audit/event atomicity verified
- [ ] O-09 ranked explainable suggestions verified
- [ ] O-10 ≥20 CI API tests incl race passed
- [ ] O-11 10k/2k seed and 100-concurrent p95 report recorded
- [ ] O-12 responsive keyboard React full flow tested
- [ ] O-13 actual deployed URL smoke-tested
- [ ] Submission files and video linked, deadline verified
