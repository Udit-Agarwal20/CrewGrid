# CrewGrid — PS1 Engineering Specification Pack

**Project:** Hack4Hack Crew Hiring Challenge 2026 / PS1 — Race-proof team formation at scale  
**Spec version:** 1.0 · **Prepared:** 2026-11-09 (IST) · **Build deadline:** 2026-11-15 23:59 IST  
**Status:** Design baseline; **not** an implementation, tested system, or benchmark result.

> **Source of truth:** https://hack4hack.com/hackathons/hack4hack-crew-hiring-challenge-2026-tp3m (official page, last updated Nov 7). Any distinction marked *Design choice* is OUR proposal rather than a competition rule.

## Start here (Antigravity)

1. Read `docs/00-SCOPE-DECISIONS.md`, then `docs/01-PRD.md`.
2. Read `docs/02-ARCHITECTURE-TRD.md` and `docs/03-DATABASE-INVARIANTS.md` **before writing any membership operation**.
3. Read `docs/04-API-EVENTS.md` and `contracts/openapi.yaml` before defining routes.
4. Read `docs/05-UI-UX.md` before implementing screens.
5. Read `docs/06-SECURITY.md`, `docs/07-TEST-PLAN.md`, `docs/08-IMPLEMENTATION-ANTIGRAVITY.md`, and `docs/09-DEPLOYMENT.md`.
6. Check `docs/10-TRACEABILITY.md` before declaring a phase complete.
7. Use `docs/11-SUBMISSION.md` for final artifacts, not as a prewritten claim of success.
8. Resolve flagged assumptions in `docs/12-RISKS-OPEN-QUESTIONS.md` only when implementation or organizer information actually requires a change. Record decisions.

## Document map

| File | Purpose |
|---|---|
| `docs/00-SCOPE-DECISIONS.md` | Exact official obligations, proposed scope, decision register and glossary |
| `docs/01-PRD.md` | Personas, journeys, functional requirements, acceptance criteria and exclusions |
| `docs/02-ARCHITECTURE-TRD.md` | System design, transactional algorithms, sequences, nonfunctional requirements and ADRs |
| `docs/03-DATABASE-INVARIANTS.md` | Collections, fields, indexes, transaction boundaries, concurrency rules |
| `docs/04-API-EVENTS.md` | REST semantics, errors, auth, idempotency and SSE events |
| `contracts/openapi.yaml` | Machine-readable API baseline; schemas expanded as code is implemented |
| `contracts/realtime-events.schema.json` | Event-envelope JSON Schema |
| `docs/05-UI-UX.md` | Sitemap, screen content, interaction rules, responsive and accessibility specs |
| `docs/06-SECURITY.md` | Threat model, abuse cases, security controls and test requirements |
| `docs/07-TEST-PLAN.md` | Test catalog, concurrency harness, load methodology and quality gates |
| `docs/08-IMPLEMENTATION-ANTIGRAVITY.md` | Time-boxed, gated build steps and copy-paste prompts |
| `docs/09-DEPLOYMENT.md` | Environments, configuration, CI, operations, diagnostics |
| `docs/10-TRACEABILITY.md` | Official requirement → components/tests/evidence matrix |
| `docs/11-SUBMISSION.md` | Checklist, one-page-design template and video storyboard |
| `docs/12-RISKS-OPEN-QUESTIONS.md` | Risk register, unresolved organizer details, conscious limitations |
| `diagrams/*.mmd` | Editable Mermaid diagrams, referenced in documents |
| `checklists/acceptance-matrix.csv` | Machine-sortable acceptance inventory |

## Commitments

- **Correctness first.** The one-team-per-hackathon constraint is a **unique DB index**, not a frontend check. Capacity changes and membership changes must be committed together.
- **Exactly one of 50** distinct authenticated users must win the final seat. Show it with a reproducible automated integration test against a real MongoDB replica set.
- **No invented evidence.** Never report a test/latency/deployment as passed until it has actually run and the raw artifact is attached. An isolated local benchmark does not establish hosted performance.
- **No extra AI integration.** Explainable deterministic teammate ranking suffices.
- **No external email dependency.** Authentication is account/password; invites are user-copyable private tokens.
- **Individual submission.** All AI-generated code must be personally understood and defensible.

## Reference links

- Official challenge: https://hack4hack.com/hackathons/hack4hack-crew-hiring-challenge-2026-tp3m
- MongoDB transactions: https://www.mongodb.com/docs/drivers/node/current/crud/transactions/
- MongoDB compound unique indexes: https://www.mongodb.com/docs/manual/core/index-unique/create-compound/
- MongoDB partial indexes: https://www.mongodb.com/docs/manual/core/index-partial/
- MongoDB TTL caveats: https://www.mongodb.com/docs/manual/core/index-ttl/
- Express error handling: https://expressjs.com/en/5x/guide/error-handling/
- TanStack optimistic updates: https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates
- shadcn Vite guide: https://ui.shadcn.com/docs/installation/vite
- k6 thresholds: https://grafana.com/docs/k6/latest/using-k6/thresholds/
- Atlas free limits: https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/
- Render free docs: https://render.com/docs/free

**How to revise:** Change this version number; log the decision in `docs/00-SCOPE-DECISIONS.md`; update API, schema, tests and traceability in the same change. Never silently diverge.
