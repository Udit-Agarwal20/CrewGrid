# CrewGrid — Final Competition Submission Checklist

**Competition:** Hack4Hack Crew Hiring Challenge 2026 — Problem Statement 1  
**Submission Deadline:** Sunday, November 15, 2026 at 23:59 IST  
**Verified Git Commit:** `0253267` (and latest M6 documentation commits)  
**Hosted CI Run:** [GitHub Actions Run #42967189517](https://github.com/Udit-Agarwal20/CrewGrid/actions/runs/42967189517) — 100% SUCCESS  
**Live Deployed Application:** [https://crewgrid-api.onrender.com](https://crewgrid-api.onrender.com)  

---

## 1. Official PS1 Obligations Compliance Gate

| Obligation ID | Organizer Requirement | Implementation Mechanism | Test & Evidence File | Verification Status |
| :--- | :--- | :--- | :--- | :--- |
| **O-01** | Min/max team size; 1 team per user per hackathon | Compound unique index `{ hackathonId: 1, userId: 1 }` on `memberships`; atomic guarded seat increment | [`apps/api/test/team.integration.test.ts`](file:///Users/uditagarwal/Desktop/CrewGrid/apps/api/test/team.integration.test.ts), [`apps/api/test/concurrency.race.test.ts`](file:///Users/uditagarwal/Desktop/CrewGrid/apps/api/test/concurrency.race.test.ts) | **PASSED** |
| **O-02** | Invite codes expire & single-use | 256-bit cryptographically random token, SHA-256 hashed at rest, TTL expiration guard + atomic redemption | [`apps/api/test/invites.integration.test.ts`](file:///Users/uditagarwal/Desktop/CrewGrid/apps/api/test/invites.integration.test.ts) | **PASSED** |
| **O-03** | Leader succession; final departure deletes team | Deterministic seniority handover (`joinedAt ASC, _id ASC`); logical deletion (`deletedAt = now`) | [`apps/api/test/lifecycle.integration.test.ts`](file:///Users/uditagarwal/Desktop/CrewGrid/apps/api/test/lifecycle.integration.test.ts) | **PASSED** |
| **O-04** | 50 simultaneous users for 1 seat $\rightarrow$ **exactly one succeeds** | Multi-document replica set transaction with guarded update `{ memberCount: { $lt: maxSize } }` | [`apps/api/test/concurrency.race.test.ts`](file:///Users/uditagarwal/Desktop/CrewGrid/apps/api/test/concurrency.race.test.ts), [`evidence/concurrency-evidence.md`](file:///Users/uditagarwal/Desktop/CrewGrid/evidence/concurrency-evidence.md) | **PASSED** |
| **O-05** | Retried mutation creates no duplicate side effects | `idempotency_keys` table with actor-scoped keys, body fingerprinting, and cached status/body replay | [`apps/api/test/concurrency.race.test.ts`](file:///Users/uditagarwal/Desktop/CrewGrid/apps/api/test/concurrency.race.test.ts) (RACE 4) | **PASSED** |
| **O-06** | Live team board and roster updates without refresh | Server-Sent Events (SSE) streaming from transactional outbox (`realtime_events`) with client refetch | [`apps/api/test/realtime.sse.test.ts`](file:///Users/uditagarwal/Desktop/CrewGrid/apps/api/test/realtime.sse.test.ts), [`e2e/crewgrid.spec.ts`](file:///Users/uditagarwal/Desktop/CrewGrid/e2e/crewgrid.spec.ts) (Flow 6) | **PASSED** |
| **O-07** | Auth, leader-only authorization, entropy & rate-limit, validation | Argon2id (`m=19456, t=2, p=4`), HttpOnly cookies, CSRF header checks, Zod contracts, sliding rate-limit | [`apps/api/test/security.audit.test.ts`](file:///Users/uditagarwal/Desktop/CrewGrid/apps/api/test/security.audit.test.ts), [`evidence/security-audit-report.md`](file:///Users/uditagarwal/Desktop/CrewGrid/evidence/security-audit-report.md) | **PASSED** |
| **O-08** | Audit log of every team change (actor, action, time) | Transactional `audit_events` collection committed atomically with domain mutations | [`apps/api/test/team.integration.test.ts`](file:///Users/uditagarwal/Desktop/CrewGrid/apps/api/test/team.integration.test.ts) | **PASSED** |
| **O-09** | Teammate ranking endpoint by skills and timezone | Deterministic scoring algorithm: 70% skill complementarity + 30% timezone alignment | [`apps/api/test/matching.unit.test.ts`](file:///Users/uditagarwal/Desktop/CrewGrid/apps/api/test/matching.unit.test.ts) | **PASSED** |
| **O-10** | $\ge 20$ API tests including race in GitHub Actions | Automated GitHub Actions CI workflow running unit, integration, race, and invariant tests | 104 API tests in [`apps/api/test`](file:///Users/uditagarwal/Desktop/CrewGrid/apps/api/test) (CI Run #42967189517) | **PASSED** |
| **O-11** | 10k users + 2k teams seed; 100 concurrent; board p95 < 200 ms | Seed script in 0.98s; k6 100-VU load test achieving board p95 of **88.83 ms** (0.00% error rate) | [`evidence/performance-summary.md`](file:///Users/uditagarwal/Desktop/CrewGrid/evidence/performance-summary.md), [`docs/LOAD-TEST-REPORT.md`](file:///Users/uditagarwal/Desktop/CrewGrid/docs/LOAD-TEST-REPORT.md) | **PASSED** |
| **O-12** | Whole-flow React UI, mobile- and keyboard-usable | Accessible React 19 SPA shell, keyboard modal navigation, and mobile viewports (375x667) | [`e2e/crewgrid.spec.ts`](file:///Users/uditagarwal/Desktop/CrewGrid/e2e/crewgrid.spec.ts) (10/10 passing) | **PASSED** |
| **O-13** | Working publicly accessible deployment on free tier | Hosted on Render with MongoDB Atlas replica set, single-origin SPA + API serving | Live URL: [https://crewgrid-api.onrender.com](https://crewgrid-api.onrender.com) | **PASSED** |

---

## 2. Submission Artifacts Checklist

- [x] **Public GitHub Repository:** [https://github.com/Udit-Agarwal20/CrewGrid](https://github.com/Udit-Agarwal20/CrewGrid)
- [x] **Root README.md:** Complete, comprehensive 15-section guide with Mermaid diagrams and reproduction steps ([`README.md`](file:///Users/uditagarwal/Desktop/CrewGrid/README.md)).
- [x] **One-Page Design Document (PDF):** Generated and verified to fit on exactly ONE page ([`docs/FINAL-DESIGN-ONE-PAGER.pdf`](file:///Users/uditagarwal/Desktop/CrewGrid/docs/FINAL-DESIGN-ONE-PAGER.pdf)).
- [x] **One-Page Design Document (Markdown Source):** Editable Markdown source provided ([`docs/FINAL-DESIGN-ONE-PAGER.md`](file:///Users/uditagarwal/Desktop/CrewGrid/docs/FINAL-DESIGN-ONE-PAGER.md)).
- [x] **Comprehensive Load Test Report:** Detailed k6 performance data and hardware disclosure ([`docs/LOAD-TEST-REPORT.md`](file:///Users/uditagarwal/Desktop/CrewGrid/docs/LOAD-TEST-REPORT.md)).
- [x] **Video Demonstration Package:**
  - Script: [`submission/VIDEO-SCRIPT.md`](file:///Users/uditagarwal/Desktop/CrewGrid/submission/VIDEO-SCRIPT.md) (4m 30s – 4m 50s target)
  - Visual Cue Shot List: [`submission/SHOT-LIST.md`](file:///Users/uditagarwal/Desktop/CrewGrid/submission/SHOT-LIST.md)
  - Pre-flight Checklist: [`submission/RECORDING-CHECKLIST.md`](file:///Users/uditagarwal/Desktop/CrewGrid/submission/RECORDING-CHECKLIST.md)
- [x] **Technical Interview Preparation:** Architecture deep-dive and 15 defensive Q&As ([`submission/TECHNICAL-INTERVIEW-PREP.md`](file:///Users/uditagarwal/Desktop/CrewGrid/submission/TECHNICAL-INTERVIEW-PREP.md)).
- [x] **No Secrets Committed:** `.gitignore` excludes `benchmarks/sessions.json`, `.env`, and local credentials.

---

## 3. Exact Links to Submit Through Hack4Hack

| Submission Field | Exact URL / Value |
| :--- | :--- |
| **GitHub Repository URL** | `https://github.com/Udit-Agarwal20/CrewGrid` |
| **Live Deployed Web Application** | `https://crewgrid-api.onrender.com` |
| **One-Page Design Document** | Attached `docs/FINAL-DESIGN-ONE-PAGER.pdf` |
| **Load Test Report** | `https://github.com/Udit-Agarwal20/CrewGrid/blob/main/docs/LOAD-TEST-REPORT.md` |
| **Demonstration Video URL** | *(Insert YouTube/Drive link after recording using `submission/VIDEO-SCRIPT.md`)* |
| **Verified Git Commit Hash** | `0253267` (or latest M6 commit) |
| **CI Verification Proof** | `https://github.com/Udit-Agarwal20/CrewGrid/actions/runs/42967189517` |
