# 11 — Submission Bundle, One-Page Design Template and Video Storyboard

**Deadline:** Sunday 2026-11-15 **23:59 IST**, official event page. Submit from Hack4Hack workspace. This documentation is a planning artifact, **not** proof of built or submitted work.

## 1. Required evaluator links/files

| Item | Expected form | Verification before submission |
|---|---|---|
| GitHub repository | Public/accessible URL containing source and README | Clone works, correct branch/commit, no secrets |
| Live deployment | HTTPS URL | Open incognito, working signup/demo, API+SSE works |
| Load-test report | `docs/LOAD-TEST-REPORT.md` + raw file | Actual 10k/2k seed, 100 VUs, p95 and env disclosed |
| Design one-pager | `docs/FINAL-DESIGN-ONE-PAGER.pdf` or one-page Markdown rendered PDF | Exactly one page; model/races/trade-offs/extra-week plan |
| Walkthrough | Video URL/file ≤5 minutes | Audio clear, full demo, real test evidence, accessible link |
| Hack4Hack workspace | Completed final submission | Capture explicit platform acknowledgment; do not guess |

## 2. Suggested repository README order

Hero / 2-sentence purpose → live demo/repo proof links → official PS1 requirements checklist → architecture diagram → local setup → environment sample → run tests → prove last-seat race → reproduce 10k/2k seed+100 VUs → security/design decisions → known limitations and trade-offs → video and one-page design links. No misleading live metrics or 'production ready' language without qualification.

## 3. One-page design note — STRUCTURE (not final claims)

**Title:** CrewGrid — Race-proof team formation at scale, commit `[hash]`, hosted `[url]`.

**Problem + invariant:** users can belong to one team/event; active teams cannot exceed capacity; last-seat concurrency test with 50 actors must admit exactly one.

**Data model:** MongoDB collections `teams(memberCount,maxSize,leaderId,deletedAt,version)`, `memberships(hackathonId,userId,teamId)` unique `(hackathonId,userId)`, `join_requests`, `invites`, `idempotency_keys`, `audit_events`, `realtime_events`. `minSize` is readiness threshold during formation.

**How races are prevented:** all join paths use same transaction; conditional team increment if count<max, membership unique insert, request/invite state update, audit/outbox and idempotency response commit together. Transient conflicts retry; unique cross-team index arbitrates one-user race. No emit inside transaction; outbox after commit.

**Proof:** `[actual test command]`, `[exact pass counts]`, `[actual run link]`, 50 simultaneous actors one seat `[verified outcome]`, `100VU p95 [actual]ms / [environment]` with target `<200ms` and raw report link.

**Trade-offs:** MongoDB transactions require replica set and have contention overhead; one Render instance + Atlas free is demo infrastructure with cold starts/limits; SSE + outbox/refetch is simple but horizontal scaling needs broker; team logical delete preserves audit rather than physically dropping historical entity.

**One more week:** distributed SSE delivery/shared rate limiter, more resilient outbox consumer leasing, detailed chaos/latency tests, monitoring and accessibility polish. Prioritize based on observed test failure, not speculation.

**Note:** Keep final artifact to one rendered page (use compact table/two-column composition if necessary). Remove placeholders before publishing; don't inflate claims.

## 4. Video plan ≤5:00 (recommended)

| Segment | Duration | Show |
|---|---|---|
| 0:00–0:25 | 25s | Context and one-team-per-hackathon invariant |
| 0:25–1:45 | 80s | Register/profile/create, request/approve, live update |
| 1:45–2:25 | 40s | Invite redemption, leader transfer/leave |
| 2:25–3:35 | 70s | Real 50-way concurrency test output + DB invariant check |
| 3:35–4:15 | 40s | Architecture transaction boundary and unique index, CI run |
| 4:15–4:45 | 30s | Real p95 report and environment disclosure |
| 4:45–5:00 | 15s | Trade-offs, links and conclusion |

During video, never imply synthetic/mock UI count proves the race. Include actual terminal/CI command output captured at submitted commit. Ensure text legible at 1080p; audio optional but helpful, captions if feasible.

## 5. Final 24-hour checklist

- [ ] All P0 requirements from `10-TRACEABILITY.md` addressed or honestly disclosed.
- [ ] Tests run and artifact timestamps/commit hashes recorded.
- [ ] GitHub Actions visibly green with real DB race test.
- [ ] Seed script exactly 10k users + 2k teams; invariant checker clean.
- [ ] k6 100-VU result and actual p95 shown; threshold result truthful.
- [ ] Deployed demo works from anonymous/private browser, including login and SSE.
- [ ] Repo readme includes clone/install/docker/env/run/test instructions.
- [ ] One-page design doc actually fits one page.
- [ ] Video ≤5m, accessible URL, not broken.
- [ ] No secrets, test cookies, real email/password exposed publicly.
- [ ] Submission workspace accepted all files/links before 15 Nov 23:59 IST.
- [ ] Keep acknowledgment screenshot/email for records.
