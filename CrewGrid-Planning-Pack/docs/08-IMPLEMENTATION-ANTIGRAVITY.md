# 08 — Antigravity Implementation Runbook

## 0. Non-negotiable operating rules for the coding agent

1. Read the **entire** pack in README order before implementing; follow spec IDs, not conjecture.
2. Do not redesign stack, endpoints, DB schema, components or priorities silently. Propose a change with technical rationale and affected docs/tests before coding.
3. Implement in focused commits/milestones; never dump giant unreviewed scaffolding and announce “done”.
4. For every change, run targeted tests, lint/typecheck when relevant and report actual outcomes. Do not fabricate benchmark/performance proof.
5. Do not use external paid APIs, billing-required services, unapproved AI integrations or third-party messaging.
6. Never reveal secret keys/tokens in logs, code snippets, docs or output.
7. All membership changes go through a common transaction service and unique DB index. Never create a test-only public bypass.
8. No editing the official challenge page requirements; source baseline is fixed unless official page changes and is reverified.
9. No commits or GitHub pushes without explicit user instruction if acting within connected tooling; locally preparing code commits can be proposed for review.
10. Completion message must include changes made, commands run, tests results, blockers, open risks, and next milestone gate.

## 1. Milestone plan (priority over calendar exactness)

| Phase | Output | Verification gate | Estimated effort |
|---|---|---|---|
| M0 Contract review | Document consistency, edge-case list, final open questions | Every O-ID mapped in traceability; no unresolved P0 contradiction | 2–3h |
| M1 Foundation | pnpm monorepo, Express, Vite, Zod, Mongo RS, CI and auth | `build`, auth tests, DB RS connect and migrations pass | 6–8h |
| M2 Core transaction engine | Team create, membership, invite, request, leave, leadership and audit | 50-way race+cross-team race pass; invariant script zero violations | 10–14h |
| M3 Discovery/realtime | Team board, matching, SSE/outbox and pagination | Scoring, authorization, reconnect and board tests pass | 5–7h |
| M4 UI integration | Accessible screens and all core user journeys | Playwright happy/denied/conflict and keyboard flows pass | 7–9h |
| M5 Performance + hardening | Seed 10k/2k, indexes/explain, k6, security tests | Honest report, repeatable commands; fix major regressions | 4–6h |
| M6 Deployment + submission | Live URL, README, one-page note, actual video and assets | Deployed smoke, submission checklist complete | 3–4h |

Total estimates (~37–51h) intentionally approximate, overlap possible. Cut **P2 bonuses first**, then P1 extras, never critical O-IDs. Deadline Sunday 2026-11-15 23:59 IST. Aim to submit before final evening rather than relying on last-minute deployment.

## 2. Repository bootstrap plan

```text
crewgrid/
  apps/api/src/{db,middleware,modules,realtime,observability}
  apps/web/src/{routes,components,features,hooks,api}
  packages/contracts/src
  scripts/{seed,load-test,invariants}
  docs/ (this pack's docs)
  contracts/ (openapi.yaml + realtime schema)
  .github/workflows/ci.yml
  package.json, pnpm-workspace.yaml, pnpm-lock.yaml
  Dockerfile, docker-compose.yml, .env.example, README.md
```

Check Node 24 + package release compatibility at implementation time; install locked versions, don't pin imaginary versions in doc. `pnpm -r typecheck` and workspace package scripts need real definitions. Local Docker mongo RS initialization should be tested with transaction smoke test, not assumed.

## 3. Detailed per-phase tasks

### M0 — Review contracts and settle critical edge cases

- Review O-01…O-13; verify no PS2 feature accidentally included.
- Confirm canonical status and API path naming, invite single-use policy, soft delete policy, approval versus invite flows, score formula.
- Check new docs' internal consistency and OpenAPI with YAML parse.
- Produce acceptance matrix from provided IDs; log deviations. **No app source changes in this stage.**

### M1 — Infrastructure, auth and fixtures

- Initialize pnpm monorepo, shared `contracts` Zod library and strict TS configuration.
- Express middleware order: request ID → security headers → cookie session → Origin/CSRF for writes → rate limit → route validation → routes → normalized error handler.
- Mongo driver connection config + fail-fast unique indexes + local replica-set Docker.
- Register/login/logout/me/CSRF route; Argon2id; DB-backed sessions.
- Base React routing and protected layout, global API wrapper with cookies, errors, TanStack Query provider.
- Basic CI jobs and proof that transaction test actually uses RS.

### M2 — Transaction correctness

- Build common `withDomainTransaction` helper; bounded time, error classification, idempotency record and audit+outbox writing.
- Implement `createTeam`, `admitMember`, `leaveTeam`, `removeMember`, `transferLeader`, `editTeam` with mandatory indexes and guarded updates.
- Implement pending request lifecycle and leader approval/decline/cancel. Implement invite creation/revocation/redeem with hash/expiry.
- Race tests: 50 distinct invite redemptions for one seat, 50 approvals for one seat; same user across two teams; duplicate idempotent create.
- Invariant verifier and 20+ API tests; **do not progress before passing**, except document blocker if environment limits.

### M3 — Discovery and SSE

- Team board indexed paginated query; no unbounded scanning. Candidate opt-in board (unassigned only) and matching endpoint deterministic score + explanation.
- Transactional `realtime_events` outbox and single-instance SSE poller; scoped authorization; client refetch on notification and reconnect.
- Tests for public/private event boundary, no rollback ghost, matching tie-break and candidate visibility.

### M4 — UI

- Design tokens, shell/nav, profile, dashboard, team board and detail, requests inbox/sent, invite generate/redeem, candidate/suggestions, audit.
- Component states from `05-UI-UX.md`: pending, success, conflict, stale SSE, empty/error. Use actual APIs, no permanent mock data.
- Responsive: 320/375/768/1280; keyboard navigation, dialogs, focus, alerts.
- Full E2E workflow; avoid browser alert/confirm. Optimistic UI only where rollback works, not speculative admission.

### M5 — Reliability evidence

- Local deterministic seed 10k users + 2k teams and invariant summary.
- Inspect `explain('executionStats')` for board/discovery; optimize indexes based on evidence.
- k6 100-VU board test, p95<200ms; save raw summary and reproducible instructions; if fail, report fail honestly and investigate.
- Security review (wrong roles, CSRF, expiry, invite reuse, duplicate keys, malformed input, log redaction), regression suite in CI.
- Optional chaos test if deadline/time allows.

### M6 — Submission

- Build production Docker image; Render free service and Atlas DB; env secrets set only on hosting dashboard.
- Confirm server serves frontend and API from same origin, session cookies work, SSE streams through proxy.
- Run deployed smoke test; record actual URL, commit, test run IDs and limitations.
- Prepare one-page design note (not full TRD), load report, concise README, video <=5 minutes. Verify links in private browser session.
- Submit through Hack4Hack workspace **before 15 Nov 23:59 IST**; do not claim actual submission unless user confirms/connector action succeeds.

## 4. Antigravity prompt — Phase M0 (copy/paste)

> You are the lead full-stack engineer for CrewGrid, the solo entry to Hack4Hack Crew Hiring Challenge 2026 **PS1**. The repository contains `CrewGrid-Planning-Pack/` (or its contents) with README and 13 connected design documents plus OpenAPI and diagrams. Read all specified files in `README.md`, especially official O-IDs, domain invariants I-01..I-10, database schema, API/events, test matrix and security. **Do not write or edit application code in this task.** Audit the specifications for contradictions, gaps, MongoDB transaction pitfalls, security holes, impossible timeline assumptions, or unsupported claims. Cross-check each O-ID against an acceptance test and implementation phase. Produce a concise report with: (1) confirmed architecture; (2) inconsistencies or blockers ranked critical/high/medium; (3) exact proposed document changes with rationale; (4) verified dependencies/runtime compatibility; (5) a scoped M1 plan and commands to run. Never assume a benchmark has passed. Do not silently alter product scope. Wait for the next instruction before implementation.

## 5. Antigravity prompt — Phase M1 (after M0 review)

> Implement **only M1 Foundation** of CrewGrid strictly to the attached documentation pack. Create pnpm TypeScript monorepo with React/Vite/Tailwind/shadcn-ready frontend, Express API, Zod shared contracts, MongoDB official driver with unique index initialization and one-node replica set Docker Compose, cookie/Argon2id session authentication, CSRF defense, Pino log redaction, request-ID/error conventions and GitHub Actions baseline. Do not implement team membership features yet. Do not use mocks in a way that claims DB correctness. Run `pnpm install`, lint, typecheck, build, auth API tests, and a real MongoDB transaction smoke test. Report every file changed, commands/results and environment limitations; propose any necessary deviations before making them. Stop at the M1 acceptance gate.

## 6. Agent handoff format per phase

```md
### Milestone report — Mx
- Implemented scope (refer to FR/O IDs):
- Files changed:
- Architectural decisions/deviations:
- Commands actually run:
- Tests passed / failed / skipped with counts and reasons:
- DB invariants verified:
- Security checks:
- UI/screens exercised:
- Evidence artifact paths:
- Known issues / risks:
- Proposed next milestone:
```

**Do not ever write “all tests pass” unless actual output proves it.**
