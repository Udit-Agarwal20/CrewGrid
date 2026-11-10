# Copy into Antigravity — M1 Foundation (Only After M0 Review)

Implement **only Milestone M1** from `docs/08-IMPLEMENTATION-ANTIGRAVITY.md` using the approved CrewGrid Planning Pack as source of truth.

Scope: pnpm TypeScript workspace; React 19 + Vite + Tailwind 4 frontend shell and routing; Express 5 Node 24 backend, shared Zod contracts, typed API error envelope, request IDs, Helmet/Pino log redaction, MongoDB official driver, transaction-capable single-node local replica set via Docker Compose, deterministic index initialization, Argon2id password registration/login, opaque cookie sessions with 7-day expiry, Origin + CSRF protection, protected `/auth/me`, `/auth/csrf`, `/health` and `/ready`, and GitHub Actions baseline.

Do **not** implement team creation, joins, invites, requests, realtime, matching or UI styling beyond the base shell in M1. Do not add paid services, AI APIs, Redis, microservices, third-party auth or mock database code that pretends to prove transaction correctness.

Run: install with frozen/locked dependencies, lint, strict TypeScript typecheck, production build, auth API integration tests with a real MongoDB database, and a transaction smoke test proving replica-set support. Record exact commands, outputs, test counts, file changes and blockers. Stop and request review at the M1 gate before touching M2.
