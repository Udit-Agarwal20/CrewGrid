# 06 — Security, Threat Model and Abuse Controls

## 1. Security boundaries

Assets: user credentials, session cookies, invite tokens, private request messages, profile privacy preferences, membership correctness, audit integrity, live update privacy. Actors: unauthenticated visitor, valid participant, leader, malicious user/bot, compromised browser, noisy load tester. Trust boundary: browser input → Express API → MongoDB. MongoDB and API secrets must remain server-only; never trust client role/team ID.

## 2. Threats and controls

| Threat | Risk | Required control | Proof test |
|---|---|---|---|
| Invitation guessing | Unauthorized team admission | 256-bit random token + hashed-at-rest + IP/account rate limiting + short expiry | Many invalid codes rejected, no distinguishable oracle |
| Session theft | Account misuse | Secure/HttpOnly/SameSite cookies, token hash DB, expiry, logout revocation, secret redaction | Invalid/expired/revoked cookie 401 |
| CSRF | Cross-origin mutations | Origin allowlist and anti-CSRF token on state-changing endpoints | Forged cross-origin request 403 |
| Broken object-level authorization | View/modify other teams | Verify current membership/leadership in service DB transaction; ID tampering checks | Nonleader cannot approve/remove/transfer |
| Double-click / replay | Duplicate team or membership | Scoped idempotency record in DB transaction, unique indexes | Same key 2+ requests one result |
| Cross-team concurrency | User joins two teams | unique `(hackathonId,userId)` | 2-team same-user race one membership |
| Capacity race | >max seats | conditional team update in transaction | 50-way last-seat test |
| Privacy leakage | Candidate emails/private requests exposed | DTO projections and event audience filtering | Unauthorized SSE/private endpoint deny |
| XSS / injection | Account compromise or query abuse | Zod string constraints, React text escaping, safe Mongo query construction, no user-provided operators/regex | Malicious input treated as string/422 |
| Brute force login | Compromise | account+IP budget, generic error, Argon2id, lockout/backoff | Throttle and generic response |
| Invite URL leakage | Token appears in logs/referrer | Hide raw tokens from server access logs; invite link uses URL fragment (`/invite#token=...`, not path/query); client strips fragment immediately after capture; no external analytics on redemption view | Logs inspected; referrer policy |
| DoS / slow clients | API resource exhaustion | request size/time limits, pagination caps, per-IP throttles, SSE connection caps/timeouts | 429 and no uncontrolled memory growth |
| Transaction retry storm | DB overloaded under race | bounded retry/time budgets, meaningful retryable status, preserved idempotency key | No silent 500 or count corruption |
| Audit tampering | Cannot inspect history | append-only domain API, minimum privileged DB credentials | No public audit mutation route |

## 3. Authentication details

- Register: validate normalized email, password minimum length (e.g. 12 chars; allow long passphrases up to a safe max 128), displayName. Do not disclose email existence unnecessarily. Optional simple password compromise protection only if no external dependency.
- Hash via Argon2id with recommended non-trivial parameters chosen based on benchmark; do not hardcode outdated insecure settings. Log no passwords or hashes.
- Login: generic failure 401 and strict rate limit. Create `crypto.randomBytes(32)` session token; store SHA256 digest. Return only cookie (`crewgrid_session`) not JSON bearer token. Rotate on login and clear on logout.
- Local dev `Secure` false only on localhost HTTP, production true. `HttpOnly`, `SameSite=Lax`, `Path=/`, seven-day max age. Set `Cache-Control: no-store` for private endpoints.
- Verify session `expiresAt>now`, not revoked, current user exists on every protected request. Rotate when near expiry optionally P1.
- CSRF defense: validate Origin/Host; generate per-session cryptographic CSRF token and compare constant-time on state mutation in `X-CSRF-Token`. Never use GET for mutations. Login/register should also enforce Origin/rate limiting, prevent login CSRF.
- Use secure headers (`helmet`) and restrictive Content Security Policy compatible with Vite production assets, no wildcard script URLs.

## 4. Authorization matrix

See `04-API-EVENTS.md` §5. At minimum: only current leader accepts/declines requests, removes members, generates/revokes invites, edits team or transfers leader. A team member may leave; a candidate may request admission only if no active membership in same hackathon. Privileged decisions must be checked again *inside* the transaction because actor's role can change concurrently.

## 5. Invitation lifecycle

Generate 32 bytes via cryptographic PRNG; encode base64url; store SHA256 digest unique, not plaintext. Default lifetime 24h; leader can set 1–72h if permitted. Return secret once to leader, then never via GET. On redemption: authenticate, rate limit on IP + user, compute hash, find invite, check `expiresAt>serverNow` and flags, verify team/hackathon, call same admission transaction, conditionally set `usedAt` null→now. Commit or fail together. If user loses last seat, invite remains unconsumed until another valid attempt. Revoke under leader permission. No brute-force-validity oracle to unauthenticated users.

## 6. Validation

- ObjectId route params validated before DB use; invalid format -> 422.
- Team name 3–60, description ≤500, message ≤280, skill list 0–10 and canonicalized, profile bio ≤280, timezone IANA validation, allowed working hours & days.
- Min/max within selected hackathon config and current member count; team edits guarded atomically.
- No query objects accepted from clients; strongly typed filters built server-side. Escape regex if used; prefer normalized prefix indexed search.
- Limit list `limit≤50`; reject negative/non-number cursors.
- Raw markdown, HTML and avatars not supported initially; display plain text safely.

## 7. Logging, data minimization and privacy

Log requestId, route template, status, elapsed time, sanitized actorId. Never log Cookie, Authorization, CSRF token, raw invite token, password, email login input, request message body, full event payload. Audit actor/action/time and safe field names; team members may inspect safe activity, evaluator sees synthetic demo examples. Candidate discovery opt-in defaults off. Team roster displays public profile subset; no email address. Document demo data as synthetic.

## 8. Security testing acceptance

At least: unauthenticated leader-only route, logged-in nonleader, former leader racing transfer, invite expiry, invite reuse, 50 invalid invite guesses/rate limit, malformed ObjectId, HTML/NoSQL injection string, CSRF token omission/wrong Origin, session expiry/revocation, duplicate idempotency key, forbidden SSE team payload, rate-limited login. Store no secrets in GitHub Actions logs or repo. Final manual scan of browser DevTools, network payload and Pino logs.

## 9. Dependencies and supply chain

Pin lockfile; run `pnpm audit`/compatible dependency checks; no blind auto-fix of major breaking versions. Do not paste API keys into issues/prompts. Render environment variables from dashboard or secret manager; `.env.example` contains only placeholders. Give DB user least privilege to intended application DB.

## 10. Known limitations

Demo single-instance in-memory rate limiting is not globally consistent across replicas. To scale horizontally, use shared rate-limit store. Free-tier deployment is not security-reviewed production infrastructure. No MFA/email verification in P0; anti-abuse is basic. Explicitly disclose limitations in final design/README rather than overstating security.
