# 04 — REST API, Error Codes, Idempotency and Realtime Events

**Base:** `/api/v1` · **Transport:** HTTPS JSON, same-origin cookie auth; SSE for server notifications. **OpenAPI baseline:** `../contracts/openapi.yaml`.

## 1. API conventions

- IDs are 24-character hexadecimal ObjectId strings; timestamps ISO 8601 UTC strings.
- Successful response: `{ "data": <typed object>, "meta": { "requestId": "..." } }`. Paginated: `meta.nextCursor`, `meta.hasMore`.
- Error response: `{ "error": { "code": "TEAM_FULL", "message": "This team is full.", "details": {} }, "meta": { "requestId": "..." } }`.
- Header `X-Request-Id` returned always; server generates trusted ID (not blindly trusting user input).
- Accept only `application/json` for writes; malformed JSON 400. Strict Zod validation including body/query/params. Maximum body ~64KB.
- All domain writes return `Cache-Control: no-store`; private reads no-store. Cookies never exposed in JSON.
- Domain-write idempotency: `Idempotency-Key: <UUIDv4>` header required for team create, approve, redeem, leave, remove, transfer, edit; recommended for request create/resolution. **Exception:** invite creation returns plaintext token once and is not idempotently replayed (documented in DB spec).
- Browser protects CSRF on mutating calls: verify `Origin`, SameSite, and CSRF token header (issued via session bootstrap `/auth/csrf` or same-origin double-submit scheme). SSE only reads and must verify auth.

## 2. Endpoint inventory with authorization and semantics

| ID | Method / Route (all under `/api/v1`) | Caller | Input / result / notable errors |
|---|---|---|---|
| A-01 | `POST /auth/register` | Guest | `{email,password,displayName}` → 201 public user; password never returned; rate limit |
| A-02 | `POST /auth/login` | Guest | credentials → 200 user + session cookie; invalid 401 generic |
| A-03 | `POST /auth/logout` | Auth | revoke cookie/session → 204 |
| A-04 | `GET /auth/me` | Auth | current profile summary → 200 or 401 |
| A-05 | `GET /auth/csrf` | Auth | CSRF token for mutation header → 200 |
| A-06 | `GET /profile` | Auth | private own profile → 200 |
| A-07 | `PATCH /profile` | Auth | bio, skills, timezone, preferredHours, discoverability → 200 |
| A-08 | `GET /hackathons` | Public/Auth | active event list → 200 |
| A-09 | `GET /hackathons/{hackathonId}/teams` | Auth | paginated team board; query search, skill, onlyOpen, cursor, limit → 200 |
| A-10 | `POST /hackathons/{hackathonId}/teams` | Auth | create team; 201; duplicate/other-team 409 |
| A-11 | `GET /teams/{teamId}` | Auth | team details + viewer permissions → 200, deleted 404 |
| A-12 | `PATCH /teams/{teamId}` | Leader | edit metadata/capacity; 200; capacity reduction 409 |
| A-13 | `POST /teams/{teamId}/requests` | Unassigned user | `{message?}`; 201 pending; duplicate 409 |
| A-14 | `GET /teams/{teamId}/requests` | Leader | paginated inbox; 200 |
| A-15 | `GET /requests/mine` | Auth | sent requests and outcomes; 200 |
| A-16 | `POST /requests/{requestId}/approve` | Current leader | 200 resolved + membership; full/other team 409 |
| A-17 | `POST /requests/{requestId}/decline` | Current leader | 200 terminal state |
| A-18 | `POST /requests/{requestId}/cancel` | Request owner | 200 terminal state |
| A-19 | `POST /teams/{teamId}/invites` | Leader | `{expiresInHours?}`; 201 `{inviteId,token,expiresAt,redeemUrl}` where redeemUrl is `https://host/invite#token=...` (fragment never sent to server); token one-time visible |
| A-20 | `GET /teams/{teamId}/invites` | Leader | metadata/status only, NEVER token; 200 |
| A-21 | `POST /teams/{teamId}/invites/{inviteId}/revoke` | Leader | 200 revoked; not active 409 |
| A-22 | `POST /invites/redeem` | Auth unassigned | `{token}`; 200 new membership; expired/used/full 409 |
| A-23 | `POST /teams/{teamId}/leave` | Member | 200 `{teamDeleted,successorId?}`; idempotent replay |
| A-24 | `DELETE /teams/{teamId}/members/{userId}` | Leader | 204 removal (not leader) |
| A-25 | `POST /teams/{teamId}/transfer-leadership` | Leader | `{newLeaderId}`; 200 |
| A-26 | `GET /teams/{teamId}/audit` | Member | paginated safe activity records; 200 |
| A-27 | `GET /hackathons/{hackathonId}/teammates` | Auth | opt-in candidates, filters + cursor; 200 |
| A-28 | `GET /teams/{teamId}/suggestions` | Leader | 0–100 scored eligible candidate recommendations; 200 |
| A-29 | `GET /hackathons/{hackathonId}/events` | Auth | SSE stream; includes public/team/private scoped notifications |
| A-30 | `GET /health` | Public | `{status:'ok'}` when process up; not proof of DB health |
| A-31 | `GET /ready` | Infrastructure | DB connectivity and indexes readiness; avoid leaking secrets |

**Notes:** Endpoint inventory is normative. If implementation needs one extra route, add versioned contract, tests, and traceability together. No open production “force join” route. Public UI uses allowed operations only.

## 3. Common JSON examples

### Create a team

```http
POST /api/v1/hackathons/507f1f77bcf86cd799439011/teams
Cookie: crewgrid_session=...
X-CSRF-Token: ...
Idempotency-Key: 7fb088a1-6d1a-4d88-9448-564df742a012
Content-Type: application/json

{"name":"Async Avengers","description":"Building accessible dev tools","minSize":2,"maxSize":5,"requiredSkills":["react","node.js"]}
```

Response `201`:

```json
{"data":{"id":"507f191e810c19729de860ea","hackathonId":"507f1f77bcf86cd799439011","name":"Async Avengers","leaderId":"507f191e810c19729de860eb","memberCount":1,"minSize":2,"maxSize":5,"stage":"forming","openSeats":4},"meta":{"requestId":"req-demo-01"}}
```

### Full-team conflict

```json
{"error":{"code":"TEAM_FULL","message":"This team has no available seats.","details":{"teamId":"507f191e810c19729de860ea"}},"meta":{"requestId":"req-demo-02"}}
```

### Suggestions

```json
{"data":[{"userId":"507f191e810c19729de860ec","displayName":"Sample Developer","skills":["react","testing"],"score":87,"components":{"complementarySkills":90,"timezoneFit":80},"reasons":["Covers React and testing needs","3.2 hours of overlapping availability"]}],"meta":{"requestId":"req-demo-03"}}
```

## 4. Error taxonomy

| HTTP | Code | Interpretation |
|---|---|---|
| 400 | `INVALID_JSON` | Cannot parse body |
| 401 | `UNAUTHENTICATED`, `INVALID_CREDENTIALS` | Login/session missing or invalid |
| 403 | `FORBIDDEN`, `NOT_TEAM_LEADER`, `CSRF_FAILED` | No authority |
| 404 | `TEAM_NOT_FOUND`, `REQUEST_NOT_FOUND`, `INVITE_NOT_FOUND` | Invalid or hidden resource |
| 409 | `TEAM_FULL` | No seat at actual commit |
| 409 | `ALREADY_IN_TEAM` | Unique membership rule |
| 409 | `ALREADY_PENDING`, `REQUEST_ALREADY_RESOLVED` | Request state conflict |
| 409 | `INVITE_EXPIRED`, `INVITE_USED`, `INVITE_REVOKED` | Invite invalid |
| 409 | `TEAM_SIZE_CONFLICT` | Max cannot shrink below current count |
| 409 | `IDEMPOTENCY_KEY_REUSED` | Same key but different request fingerprint |
| 422 | `VALIDATION_FAILED` | Parseable payload but invalid fields |
| 429 | `RATE_LIMITED` | Brute force / abuse protection |
| 503 | `TEMPORARILY_UNAVAILABLE` | Database unavailable, retry with same key |

**Disclose minimally:** Invalid invite may use a generic `INVITE_INVALID` error to avoid distinguishing guessed valid tokens. App may map detailed internal reason to user-friendly message only after authenticating and rate limiting. Errors must not expose stack traces, Mongo internals or user emails.

## 5. State transitions and permissions

**Team:** Active Forming (count<min) ↔ Active Ready (count≥min) → Deleted when last leaves; deleted is terminal.  
**JoinRequest:** Pending→Approved/Declined/Canceled/Invalidated, terminal states cannot be mutated.  
**Invite:** Available→Used/Revoked/Expired, expiry is based on UTC server time; no reuse.  
**Membership:** Absent→Present by approved request or invite; Present→Absent by leave/removal. No transfer across teams without departure.

| Action | Guest | Unassigned | Member | Leader |
|---|---|---|---|---|
| Browse team board | Demo public option | Yes | Yes | Yes |
| Create team | No | Yes | No (same event) | No (same event) |
| Request / redeem | No | Yes | No | No |
| View own team | No | — | Yes | Yes |
| Approve / decline | No | No | No | Yes |
| Remove member | No | No | No | Yes |
| Transfer leader | No | No | No | Yes |
| Leave own team | No | — | Yes | Yes |
| Edit team | No | No | No | Yes |
| View private audit | No | No | Yes | Yes |

## 6. SSE envelope and contract

**Endpoint:** `GET /api/v1/hackathons/{hackathonId}/events`; `Accept: text/event-stream`; authenticated session; no CSRF token for read.

```text
id: 507f191e810c19729de860ed
event: member.joined
data: {"eventId":"507f191e810c19729de860ed","eventType":"member.joined","hackathonId":"507f1f77bcf86cd799439011","scope":"team","teamId":"507f191e810c19729de860ea","occurredAt":"2026-11-09T16:00:00Z","payload":{"memberCount":3}}

```

- Public event payload: event/team IDs and seat count, nothing sensitive.
- Team event to current members only; request event directed to current team leader / applicant as appropriate. Team-level changes may also emit separate public board update.
- `team.created`, `team.updated`, `member.joined`, `member.left`, `request.created`, `request.resolved`, `leader.transferred`, `team.deleted`.
- Browser `EventSource` reconnects; client refetches team/board/requests on open and on `visibilitychange`; no reliance on exactly-once delivery. Heartbeat comment `: keepalive` every ~20s.
- Server must not send headers containing private session info into events. Auth may expire during long connection: server periodically verifies/terminates expired session; reconnection then yields 401.
- JSON Schema: `../contracts/realtime-events.schema.json`. It is an envelope schema; per-event payload discriminated union refined in code.

## 7. Pagination / search / matching

`limit` default 12/max50. Cursor is opaque base64url encoded tuple `(sortValue,_id)` with integrity protection if exposing sensitive sort keys; reject invalid cursor. Stable sort and index backed. `search` normalized prefix if supported; `skill` normalized string. Team board query returns `stage`, `openSeats` derived server-side. Teammate endpoint only returns opted-in, unassigned candidates with public profile fields. Suggestions return score 0–100, component scores, explanation, stable tie-break.

## 8. Contract verification rules

- Every endpoint has positive + authorization + invalid-input tests as applicable.
- Every mutation's `Idempotency-Key` policy must be implemented and documented; web client must reuse key on retry.
- OpenAPI file and Zod schemas agree on field names, status codes, cookie name and examples.
- No unauthenticated open realtime stream; no raw session or invite values exposed.
- Error status and code mapping is consistent and surfaced intelligibly in UI.
