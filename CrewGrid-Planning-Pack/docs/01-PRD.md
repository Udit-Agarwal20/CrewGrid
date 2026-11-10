# 01 — Product Requirements Document (PRD)

**Version:** 1.0 · **Product:** CrewGrid · **Challenge:** Hack4Hack PS1 · **Owner:** Solo contributor

## 1. Executive summary

CrewGrid is a responsive, accessible web application for reliable team formation in large hackathons. It supports creating and finding teams, invitations, leader-reviewed applications, live availability, audit history, and explainable teammate recommendations. Its defining quality attribute is **transactionally correct membership under competition for scarce seats**. The demo must show this with 50 overlapping join attempts for one remaining spot and at least 20 API tests in GitHub Actions. Source obligations are listed in `00-SCOPE-DECISIONS.md` and traced in `10-TRACEABILITY.md`.

### Problem statement / why it matters

- Team membership and seat counts can become inconsistent when multiple users join at once.
- Users cannot tell whether a team is full, whether their request was processed, or who accepted it.
- Leaders need to form teams without losing control of capacity or accidentally approving the same person twice.
- Participants need transparent recommendations instead of opaque claims of “AI matching”.

### Success is not “it looks complete”

Release is acceptable only when invariants (I-01… in `03-DATABASE-INVARIANTS.md`) pass in a **real DB integration harness**, the core end-to-end flows work with keyboard and mobile layouts, the required seed/load report is reproducible, and the deployed service is reachable.

## 2. Users and roles

| Persona | Goal | Permissions |
|---|---|---|
| Guest | Learn purpose, view safe public discovery if enabled | Read-only marketing / demo; no private team details |
| Participant without team | Form a group, request membership, redeem invitation, opt into talent board | Create team, request join, manage own profile, discover |
| Team member | Understand team status and leave | View private team, leave, see relevant updates |
| Team leader | Invite/manage members and requests, edit team, transfer leadership | Team-specific privileged mutations |
| Evaluator | Verify code/test evidence and discover workflow | Public demo, repo/docs/engineering evidence, test accounts as supplied |

No organizer/admin role in P0. Hackathon fixtures are bootstrapped by seed or config; adding admin CRUD would distract from PS1.

## 3. Functional requirements

### Account and profile

**FR-001** Register with email, public display name, password; normalized emails unique. Input limits, password strength, rate limits.  
**FR-002** Sign in/out; sessions via HttpOnly cookie, `/me` fetch, session revocation.  
**FR-003** Edit profile: handle, short bio (≤280 chars), standardized skills (max 15), preferred working hours, IANA timezone, discoverable toggle.  
**FR-004** Access-control gates: unauthenticated users are routed to login preserving safe return URL; team visibility based on membership/leader.

### Hackathon/team lifecycle

**FR-005** Browse active hackathons; demo features one event with config min 2 max 5, yet DB/API support multiple event IDs.  
**FR-006** Create team with a name (3–60 chars), description (0–500), skill needs (≤10), `minSize` and `maxSize` consistent with hackathon policy. Creator becomes first member and leader in one transaction.  
**FR-007** View/filter/paginate active team board (search, open seats, skills, stage). Correct derived status and live seat counts.  
**FR-008** View team page (title, description, readiness, member count, skills, members, current viewer's permission).  
**FR-009** Leader edits safe metadata and size limits; lowering maxSize below memberCount is prohibited; potential concurrent joins must serialize with this operation.  
**FR-010** Team joins: only authenticated, eligible users; exactly one last-seat admission during 50-way race, same invariant for invite redemption and request approval.  
**FR-011** Leave team: member removal and count decrement atomic; leader leaves -> deterministic succession; final departure logically deletes team, leaving audit history.  
**FR-012** Leader removes a non-leader member with explicit confirmation. Leader cannot remove themselves via this API; must use leave/transfer.  
**FR-013** Leader can transfer leadership only to a current member; update and audit in one transaction.

### Requests / invites

**FR-014** Nonmembers request membership; max one pending request per user per team; pending request does not reserve a seat.  
**FR-015** Leader approve or decline, with race-safe behavior; applicant can cancel; already-resolved request returns consistent conflict/idempotent response.  
**FR-016** Leader creates high-entropy single-use expiring invite code/link; only hash stored; can revoke.  
**FR-017** Signed-in user redeems invite and immediately joins (no leader approval), subject to all rules; token consumed only after commit. If team full / already joined, show explainable error.  
**FR-018** UI surfaces request status (pending, approved, declined, canceled), capacity/eligibility errors and friendly next steps.

### Discovery / matching / realtime / audit

**FR-019** Public within-app opt-in “Looking for teammates” board for eligible unassigned participants; filters by skill and timezone, no private email.  
**FR-020** Team leader receives ranked teammate suggestions; score = 70% complementary skill coverage + 30% working-hour overlap. API supplies component breakdown and human explanation.  
**FR-021** Team and board updates delivered via SSE without manual refresh. Reconnect triggers revalidation and refetch; privacy filtering of event streams.  
**FR-022** Every committed team change logs actor ID, action, team ID, relevant changes, and UTC timestamp; historical events remain after team logical deletion.  
**FR-023** Duplicate writes/retries with same `Idempotency-Key` do not repeat side effects; different payload with same scoped key returns conflict.  
**FR-024** All mutations validate input, authentication, authorization and business preconditions on server.

### Evidence / operations

**FR-025** Automated API integration tests ≥20, GitHub Actions workflow, 50-way race test and 2-team same-user race test.  
**FR-026** Seed script produces 10k synthetic users and 2k teams in a non-production environment, with varied seats and index statistics; deterministic seed option.  
**FR-027** k6 board test 100 concurrently active virtual users, recorded p95, p99, error rates, environment, scripted thresholds; official success <200ms p95.  
**FR-028** Working free-tier deployment with end-to-end signup/login, team creation and join; final smoke report.  
**FR-029** Responsive React interface with complete keyboard accessibility.  
**FR-030** Final repo, one-page design doc, report and video ≤5m.

## 4. Nonfunctional acceptance targets

| ID | Quality | Acceptance |
|---|---|---|
| NFR-001 | Safety | Unique `(hackathonId,userId)` active membership, every active team leader is member, 1≤memberCount≤maxSize |
| NFR-002 | Consistency | `memberCount` exactly equals actual memberships; rollback on failed insert/approval |
| NFR-003 | Concurrency | Repeated 50-actor last-seat tests yield one admission, no unexpected 5xx, zero count drift |
| NFR-004 | Idempotency | Same key+payload replays same result (status/body) without new DB writes |
| NFR-005 | Auditability | Every successful domain mutation has actor/action/time audit in same transaction |
| NFR-006 | Discoverability | Board p95 <200ms at 100 concurrent VUs in reported environment; honest if target missed |
| NFR-007 | Accessibility | Responsive at 320/375/768/1280 widths; semantic controls, visible focus, keyboard workflows |
| NFR-008 | Security | Invite guessing resistance, permissions on server, CSRF and brute-force defenses |
| NFR-009 | Resilience | SSE reconnect re-fetches authoritative data; no emitted event from rolled back write |
| NFR-010 | Maintainability | Strict TS, modular modules, coherent typed API, logger, CI green, no warnings suppressed |
| NFR-011 | Determinism | Seed/test scenario reproducible, UTC timestamps, stable matching tie-breaks |

## 5. User journeys with acceptance criteria

### J-01 — Participant creates a team

1. Logs in; picks event; clicks Create Team.
2. Enters name, min/max within event bounds, description, desired skills.
3. Client validates; sends request with idempotency key; server validates again.
4. Atomic transaction creates team, creator membership, audit, realtime-outbox and idempotency record.
5. Returns 201; UI navigates to team page, shows `1 / N` with Forming status if below min.

**Accept:** double-click or retry results in one team, one membership, one created audit, same response replay. Second distinct create request while already in team -> `ALREADY_IN_TEAM` 409.

### J-02 — Applicant requests and leader approves

1. User filters available teams; opens team.
2. Clicks Request to Join; sees Pending.
3. Leader opens Requests; approves.
4. Backend transaction re-checks actor is leader, applicant eligibility, team capacity, request pending; reserves capacity, inserts membership, changes request status, logs and queues event.
5. Both browsers update automatically.

**Accept:** two approvals competing for one seat -> one succeeds. A user who joined a different team before approval -> 409 and no count change. Pending request alone does not consume capacity.

### J-03 — User redeems invite

1. Leader opens Invite panel; creates code; UI reveals it **only once**; copy link button.
2. Receiver opens link, authenticates if needed, and explicitly chooses Redeem.
3. Server hashes submitted token, checks expiry/revocation/unused, joins via same transaction as J-02, marks invite used, logs event.
4. Token then invalid for others; both team and board update.

**Accept:** two people redeem same token concurrently -> one successful; expiry checked by service even if TTL sweep has not run; no raw token ever persisted in database/logs.

### J-04 — Leader leaves

1. Leader selects Leave; UI explains successor chosen automatically or allows explicit transfer first.
2. Backend transaction locks the team through a conditional team update/version, selects oldest remaining member, deletes current membership, decreases count, sets successor; if no member remains, soft deletes team instead.
3. Audit records leave/leadership transfer or deletion; clients refresh.

**Accept:** no leaderless active team, no count mismatch; concurrent join/leave is serializable through team write conflicts.

### J-05 — Discover compatible developer

1. Leader opens suggestions; sees ranked public opt-in candidates without team membership.
2. Each row lists missing skills covered, overlapping hours, component scores and final score.
3. Leader can generate single-use invite code and share it externally; no built-in messaging.

**Accept:** explanations exactly correspond to score components; private/non-opt-in/already-member profiles excluded; stable ordering with tie-break by userId.

### J-06 — Race demo

Run test against a team with exactly one seat free and 50 distinct eligible users. Spawn concurrent authenticated join paths (for test harness, direct join service endpoint can be protected/fixture-only). Wait for all outcomes, assert exactly one success, 49 business rejections, no unexpected 5xx, count and membership invariants correct. Record raw test output and environment.

**Important:** Production UI supports invite and approval paths; a **test-only route must never be deployed**. The harness should exercise production services through official API operations, ideally concurrent leader approvals with prepared requests or concurrent independent invite tokens, and no bypass of auth/permissions.

## 6. Screen requirement mapping

| Screen | Principal requirements |
|---|---|
| Landing/demo | FR-001, FR-028, FR-030 |
| Login/Register | FR-001/002/004 |
| Onboarding/Profile | FR-003/019 |
| Event dashboard | FR-005/007 |
| Team board | FR-007/010/014/021 |
| Team detail and manage | FR-008…013/022 |
| Requests | FR-014/015/018 |
| Teammates board/suggestions | FR-019/020 |
| Invite page/modal | FR-016/017 |
| Engineering evidence | FR-025…028/030 (read-only evidence, not fake live metrics) |

## 7. Out-of-scope and future roadmap

P0 excludes chat, payments, organizer admin UI, email invitations, AI services, OAuth, multiple API instances, offline support and deep observability stack. P1 if P0 passes: optimistic rollback, Docker Compose, lightweight metrics, graceful conflict banners. P2: kill-process chaos test; expanded personalization, theme toggle. Never exchange missing required functionality for polish.

## 8. Definition of done

A feature is done only when: service behavior + input validation + permission handling + DB invariant + API contract + UI state + automated tests + logging/audit as applicable + README notes all exist and pass. 'Code implemented' is not 'feature complete'. Every claim in final submission must reference a reproducible artifact.
