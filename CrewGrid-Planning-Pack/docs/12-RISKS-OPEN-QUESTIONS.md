# 12 — Risk Register, Open Questions, Release Cuts

## 1. Principal risks, sorted by impact

| ID | Severity | Risk / trigger | Mitigation and acceptance |
|---|---|---|---|
| R-01 | Critical | Capacity race accidentally bypasses transaction | Membership service sole mutation entry; unique index; repeated 50-way test + invariants |
| R-02 | Critical | User joins two different teams concurrently | Global `(hackathonId,userId)` unique index + same-user two-team race test |
| R-03 | Critical | Wrong leader approval after leadership transfer | Verify `leaderId` inside same transaction, serialize team write, test race |
| R-04 | Critical | Idempotency row and side effect not atomic | Store successful outcome inside domain transaction; retry ambiguous commits by key lookup |
| R-05 | High | Local Mongo standalone means transactions fail in CI | Docker RS initialize/wait and transaction smoke test before coding domain |
| R-06 | High | P0 scope too large for remaining time | Prioritize transactions/tests first, cut P2/P1, reusable UI primitives |
| R-07 | High | Live deploy free tiers throttle or sleep | Separate local benchmark from demo; one-origin deployment, report limits |
| R-08 | High | SSE event lost on process crash | Outbox persisted same transaction, refetch on reconnect |
| R-09 | High | Token leaked in logs/URLs | Hash storage, URL strip, no analytics/referrer, log redaction |
| R-10 | High | Overly broad/slow matching query | Opt-in board pagination, prefilter, indexes, explain plan |
| R-11 | High | UI optimistic state lies during 409 conflict | Safe rollback + invalidation; no premature membership success |
| R-12 | Medium | Chaos test lacks meaningful kill timing | Explicit SIGKILL before/after commit; invariant validator |
| R-13 | Medium | Team soft-delete misread as failing 'delete' | Explain logical deletion preserves audit; expose team as deleted and zero memberships |
| R-14 | Medium | Multiple sessions/replays trigger duplicate invite generation | Invite-creation exception to idempotency; single-use token and one-time UI; do not replay plaintext secret |
| R-15 | Medium | Time-zone DST changes cause wrong score | Use IANA zones, reference week, date-specific interval intersection, deterministic tests |
| R-16 | Medium | CI race flaky due to slow runners | Bounded retries, no artificial sequential await, distinct actors, capture logs, fix not skip |
| R-17 | Medium | Signup abuse in public demo | Rate limits, abuse budget, synthetic fixtures; no open mass-seeding endpoints |

## 2. Organizer unknowns (do not invent answers)

- Exact private workspace submission form fields and whether submitted work may be revised.
- Whether repository must be public at deadline (accessible to reviewers is essential regardless).
- Whether 50-way race should use invite redemption versus request approval. The challenge describes a general join scenario and explicitly supports invitations/approvals. **Implement both as the same guarded service and test both paths**.
- How score weights are judged (no published numerical rubric).
- Free-tier p95 expectations if external provider throttles; document actual test environment.
- Salary/stipend, internship duration, interview logistics (outside scope of build).

## 3. Product decisions resolved in this pack

| Question | Resolution |
|---|---|
| Can a new team start below min size? | Yes; min indicates Forming→Ready threshold; max hard cap |
| Does pending request reserve a seat? | No |
| Does invite directly join? | Yes, after auth and capacity check; one-time token |
| Can users create/join teams in multiple hackathons? | Yes, at most one team **per hackathon** |
| How does leader leave? | Oldest other member succeeds, deterministically; last leaves deletes active team |
| What happens if two requests win one seat? | One transaction commits, other returns TEAM_FULL after retry |
| Can team leader increase size? | Yes within event bounds; reduce only to ≥ current memberCount |
| What does “delete team” mean with immutable audit? | Logical deletion; hidden from active API; history retained |
| Can leader invite people through email? | No mail integration; copy a private invite link |
| Are recommendations AI-based? | No; deterministic component score + explanation |
| Are board updates pushed to guests? | Authenticated board; public landing can be static; events authorized |
| Is engineering evidence page required? | Not officially; P1 only |

## 4. Scope-cut ladder if time is slipping

1. **Never cut:** transactional join/create, unique index, leadership, invites expiry, requests, audit, SSE, 20 CI API tests, seed, k6, mobile/keyboard UI, live URL and deliverables.
2. Cut first: light theme, animations, advanced filters, CSV/analytics, extended profile bio, elaborate onboarding.
3. Cut second: chaos test, extra metrics dashboard, ambitious match tuning; keep a basic deterministic rank and explanation.
4. Cut third: engineering evidence page and optimistic UI if complexity; retain README evidence and correct server responses.
5. Reduce UI complexity without deleting mandatory flows: fewer screens by placing requests/invites/activity as tabs on team page.

## 5. Reality checks at release

`PASS` means a command ran successfully and has output/artifact. `PLANNED` means docs or generated code only. `PARTIAL` means some tests/UI paths not verified. `FAIL` means requirement unmet. Do not upgrade from PLANNED to PASS because Antigravity claims it. Confirm on a real database, real browser and actual deployment.
