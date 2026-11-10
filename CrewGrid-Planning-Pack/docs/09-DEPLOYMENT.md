# 09 — Local, CI, Hosting, Operations and Troubleshooting

## 1. Environments

| Env | Frontend | API | MongoDB | Intended purpose |
|---|---|---|---|---|
| Local dev | Vite HMR port 5173 | Express port 3000 | Local Docker single-node replica set | Development and manual testing |
| CI test | Built bundle + test app | Supertest / real HTTP | Isolated MongoDB RS service | Automated correctness, no seeded live data |
| Local performance | Built assets | Real Express process | Local Docker RS with 10k/2k seed | Reproducible k6 board benchmark |
| Demo deployment | Express serves built SPA | Render free web service | Atlas free cluster | Reviewer-facing functional demo |

Avoid embedding credentials in client bundle. All REST/SSE requests same-origin in production (`/api/v1`). Vite dev proxy `/api` to local backend; configure credentials and CORS only for known local origin if necessary.

## 2. Expected env variables (`.env.example` document contract)

```dotenv
NODE_ENV=development
PORT=3000
APP_ORIGIN=http://localhost:5173
MONGODB_URI=mongodb://127.0.0.1:27017/crewgrid_dev?replicaSet=rs0&directConnection=true
MONGODB_DB=crewgrid_dev
SESSION_COOKIE_NAME=crewgrid_session
SESSION_DAYS=7
COOKIE_SECURE=false
TRUST_PROXY=false
LOG_LEVEL=info
SEED_ALLOWED=false
SSE_POLL_MS=750
```

Production: `NODE_ENV=production`, correct Render `PORT`, `APP_ORIGIN=https://<actual-deployment>`, Atlas `mongodb+srv://...` from secret environment, `COOKIE_SECURE=true`, and `TRUST_PROXY` configured to the actual reverse proxy chain. No paid email/LLM keys. Session is opaque so no signing secret required unless implementation chooses signed CSRF/session; if so add safely to env documentation, never commit actual value.

## 3. Docker Compose developer setup

- MongoDB container with `--replSet rs0 --bind_ip_all`, named volume, startup/init job runs `rs.initiate()` and waits for PRIMARY.
- API and web can run locally through pnpm; P1 adds Compose profiles to start API/web too for **one-command setup** bonus.
- Use a dedicated test database and reset only with explicit flag; never use seed reset on production.
- Local smoke sequence: launch database, wait PRIMARY, run DB index init, run transaction smoke test, start API, start Vite, register user, create team, inspect `/health` and `/ready`.

## 4. GitHub Actions

- Trigger push/PR on main branch or working branch as configured.
- Job `quality`: Node 24 + pnpm cache, frozen lock, lint, typecheck, unit, build.
- Job `api-integration`: MongoDB replica set (Docker), wait for PRIMARY, migration/index init, Vitest API tests with actual test DB; race test included; fail if coverage omitted.
- Job `e2e` optional if setup permits: Playwright browser install, start app, run smoke/keyboard tests.
- Artifacts: test summary/junit if configured; log redaction; no secret echo.
- k6 full benchmark may run locally for report rather than on shared GitHub CI runner (unstable performance measurement). CI can validate k6 script syntax/smoke only.

## 5. Render deployment plan

1. Build web `vite build`, build API TS, copy/serve SPA assets from Express using static middleware and HTML fallback only for non-API GET paths.
2. Single Dockerfile multistage Node 24; produce installable immutable image.
3. Bind `0.0.0.0:$PORT`, use `/health` for liveness, `/ready` for DB readiness. Ensure proxies do not buffer SSE responses (`Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, appropriate proxy options).
4. Create Atlas free DB/user limited to project database. Store Atlas connection secret in Render environment; restrict inbound access as far as free platform networking allows. Never commit credentials.
5. Render free service sleeps after 15min without qualifying traffic; cold start ~1min; ephemeral FS; no horizontal scaling. Consider landing page warmup and clear demo note, but **do not use illicit always-on polling** to bypass free policy.
6. Test registration, login cookie persistence, CSRF, team create, invite redeem, request approve, board SSE, session expiration and mobile layout on deployed origin. Inspect browser console/server logs.
7. Do not load 10k/2k seed into shared public demo by default. Use tiny demo dataset or create samples through authorized API; ensure tests hit separate env.

## 6. Operations / diagnostics

| Symptom | Inspect | Recovery |
|---|---|---|
| Transactions fail `not allowed` | Replica set status / Atlas cluster type | Initialize RS, confirm primary; fail fast, never disable transactions |
| Mongo connect timeout | `MONGODB_URI`, Atlas network allowlist, DNS, `rs.status()` | Fix network/credentials, maintain safe retry budget |
| Duplicate team membership | Unique index state, transaction path bypass | Stop deployment; run invariant checker and repair only after postmortem |
| SSE not updating | Proxy buffering, auth cookie, outbox polling cursor and client refetch | Fix headers/poller, reconnect; test stale events |
| Cookie not persisting | SameSite, Secure, APP_ORIGIN, reverse-proxy trust | Correct production cookie and HTTPS settings |
| Board p95 >200ms | k6 raw, explain query, Atlas throttling, cold start | Tune projection/index/cursor and measure on controlled environment |
| Render 503 after inactivity | Free service cold start | Retry after initial wake; document latency caveat |
| Rate limiter 429 during test | Test user/IP pool vs production security | Use controlled test config; do **not** turn off protection in public demo |
| `IDEMPOTENCY_KEY_REUSED` | User reused old key for new logical action | Generate fresh key per new action; preserve on retries |

## 7. Release runbook

Before deployment: all mandatory tests pass, `scripts/verify-invariants.ts` zero violations, no secrets in repo/logs, OpenAPI matches routes, index init executed. Deploy: record commit hash and URL. After deploy: smoke checklist, mobile screenshot and SSE connection, security/regression spot checks. Rollback: previous known good deployment; schema migration compatibility documented. Before final submission: verify links in a logged-out private window and GitHub repo visibility/permissions.

## 8. References and provider limits

- https://render.com/docs/free — spin-down after 15 minutes, ephemeral FS, free instance limits.
- https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/ — free M0 operational throttles (100 ops/sec).
- https://www.mongodb.com/docs/drivers/node/v6.x/crud/transactions/ — transaction behavior and retry rules.
- https://grafana.com/docs/k6/latest/using-k6/thresholds/ — p95 threshold methodology.
