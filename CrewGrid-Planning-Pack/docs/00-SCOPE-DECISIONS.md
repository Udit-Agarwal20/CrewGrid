# 00 — Scope, Official Requirements, Decisions, Glossary

## 0.1 Context and boundaries

**Hackathon:** Hack4Hack Crew Hiring Challenge 2026, PS1 only. Solo build; registration and submissions are due **Sunday, 15 November 2026 at 23:59 IST**. Organizer estimates 30–50 hours for one problem. Their ordering: correctness under concurrency; engineering decisions and defense; code quality, tests, UX.

**Authoritative source:** https://hack4hack.com/hackathons/hack4hack-crew-hiring-challenge-2026-tp3m (last updated Nov 7). Text here is paraphrased. Rules may change; verify submission day.

### Official PS1 obligations (O-01…O-13)

| ID | Mandatory organizer requirement | Notes |
|---|---|---|
| O-01 | Teams obey min/max size; one team per person per hackathon | Min is readiness threshold at formation; max is a hard capacity cap |
| O-02 | Invite codes expire | Must reject expired codes independent of TTL cleanup |
| O-03 | Leader succession; final person leaving deletes team | No leaderless active team |
| O-04 | Fifty simultaneous users target one free seat; **exactly one succeeds** | Proof via automated race test |
| O-05 | Retried join or team creation creates no duplicate side effect | Idempotent semantics |
| O-06 | Live board and team updates without page refresh | SSE or WebSocket |
| O-07 | Authentication; leader-only accept, decline, remove; strong invite secrets, brute-force control; input validation | Authorization server-side |
| O-08 | Audit log of **every team change**: actor/action/time | Persisted, not console logs |
| O-09 | Teammate ranking endpoint by complementary skills and time zone, with explained scoring | Deterministic is allowed |
| O-10 | ≥20 API tests including concurrency, run in GitHub Actions | Integration tests should use real MongoDB |
| O-11 | Seed script for 10,000 users + 2,000 teams; load test at 100 concurrent users, board p95 **<200 ms** | Show raw evidence and environment details |
| O-12 | Full React interface, mobile- and keyboard-usable | Real UI across the workflow |
| O-13 | Working publicly accessible deployment on free tier | Test after deploy |

**Bonus (not mandatory):** optimistic rollback; one-command Docker Compose; tracing/metrics; process-crash/chaos test.

**Required submission:** repo, deployed URL, load-test report, **one-page** design note (data model, concurrency, trade-offs, extra week), video ≤5 min, submitted through Hack4Hack workspace. **Do not confuse internal extensive docs with the required one-page final artifact.**

## 0.2 Product vision and critical choices

**Working name:** CrewGrid. **Problem:** hackathon participants cannot reliably form and manage teams when many actions occur at once. **Solution:** accessible team discovery and management with strongly enforced membership invariants, transparent recommendations, and live updates.

### Locked design choices (D-01…D-18)

| ID | Design choice (NOT an official rule) | Rationale / trade-off |
|---|---|---|
| D-01 | React + TypeScript + Vite, Tailwind 4, shadcn/ui | Fast SPA; familiar organizer frontend |
| D-02 | Node 24 LTS + Express 5 + TypeScript | Stability over newest features; familiar organizer backend |
| D-03 | MongoDB official Node driver; no ODM initially | Explicit sessions/indexes/transactions; more boilerplate |
| D-04 | pnpm workspace; `apps/web`, `apps/api`, `packages/contracts` | One repo, no heavy monorepo orchestrator |
| D-05 | Cookie session, server-stored opaque session-token hash; Argon2id passwords | Revocable sessions; must implement auth security correctly |
| D-06 | All membership mutations routed through one domain service and Mongo transaction | Prevents diverging join pathways |
| D-07 | Unique `{hackathonId,userId}` index on active memberships | Global membership invariant |
| D-08 | Team has `memberCount` and conditional increment/decrement in transaction | Fast capacity check; must verify count invariant |
| D-09 | Only teams with `deletedAt:null` are active; final departure performs logical delete | Preserves audit history; UI treats as deleted |
| D-10 | Minimum team size governs `forming` vs `ready`, not permission to create | Otherwise empty/new teams cannot form |
| D-11 | Single-use invite token by default; automatic join if valid | Request path uses leader approval; both share membership service |
| D-12 | Join requests cannot reserve capacity | Prevents indefinite seat holds |
| D-13 | SSE for updates; durable outbox + client refetch on reconnect | One-way events enough, replay/reconnect correctness |
| D-14 | Explainable deterministic matching, skills 70% / timezone 30% | Stable, free, interview-defensible |
| D-15 | Render + Atlas free for demo; local replica set for realistic controlled load test | Free infrastructure not an SLA or benchmark proxy |
| D-16 | Versioned REST `/api/v1`, Zod schemas, typed error codes | Frontend/back-end consistency |
| D-17 | No third-party AI, mail, payment, chat or external social integrations | Avoid distractions and secrets |
| D-18 | Demo data segregated from test data and live user data | Never load 10k synthetic passwords into public app |

## 0.3 Assumptions and product defaults

- Single featured hackathon in the demo, but all uniqueness keys include `hackathonId` to permit multiple independent events.
- Configurable event `minTeamSize` and `maxTeamSize`; defaults are 2 and 5. Teams can choose within event bounds, and a new team initially contains its founder only.
- One leader per active team, `leaderId` stored in teams. Oldest remaining member succeeds if the leader leaves, with deterministic ID tie-break.
- A participant who is already on a team cannot create another team or join one in the same hackathon. A departed user may join another team.
- Ordinary requests can be created by users not currently on a team. Approval enforces eligibility and seat capacity **at approval time**.
- Invite links expire after 24 hours by default; tokens single-use; no acceptance without login. Leaders can revoke them.
- Invite redemption consumes the token **only on committed successful membership**, otherwise it remains usable until expiry/revocation.
- Membership changes automatically close the user's other pending requests in the same hackathon within the transaction when practical; where that introduces contention, defer cleanup and hide ineligible requests based on current membership.
- Status labels `forming` / `ready` are derived from `memberCount` against `minSize`, not independently mutable values.
- `team.deleted` is logical deletion with `deletedAt`, the public API returns 404/410 consistently; audit retained. The data model does not leave a leaderless team.
- Public nickname and opt-in candidate profile visibility; never show private email.
- Multiple concurrent requests from the *same* idempotency key must resolve to a single committed outcome; different payload with same key -> conflict.

## 0.4 Explicit exclusions

No direct messaging, file sharing, team chat, organizer admin CMS, payments, invitations by email, GitHub OAuth, AI/LLM integration, resumes, video calls, notifications over email, multi-region deployment, microservices, offline support, custom realtime broker for many nodes, or leaderless teams. These are not judged PS1 must-haves.

## 0.5 Glossary

- **Hackathon**: event boundary for team membership uniqueness.
- **Team**: group with hard capacity; contains one leader and at least one member while active.
- **Membership**: authoritative relation between one user and one team in a hackathon.
- **Join request**: pending intention, *not* a seat reservation.
- **Invite**: expiring high-entropy bearer token, hashed at rest.
- **Atomic seat reservation**: guarded update requiring `memberCount < maxSize` within the same transaction that inserts membership.
- **Idempotency key**: client-generated unique string identifying one logical mutation, scoped to actor + route.
- **Outbox**: database record committed with the domain mutation, polled to publish SSE signals.
- **p95**: latency threshold below which 95% of measured requests fall.
- **Forming**: live team with memberCount < minSize; **Ready**: live team with memberCount ≥ minSize.

## 0.6 Decision change control

Record deviations here with date, reason, affected requirement IDs, affected docs, migration/tests needed, and whether the change is user-approved. A dependency version may be updated at implementation time only after checking official compatibility and committing lockfile. Avoid silently inserting new infrastructure.
