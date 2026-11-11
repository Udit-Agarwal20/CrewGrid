# CrewGrid — Video Demonstration Shot List & Production Cues

**Resolution:** 1080p (1920x1080) at 60 fps  
**Target Duration:** 4m 30s to 4m 50s  
**Audio:** Crisp mono/stereo voiceover, normalized to -14 LUFS, zero background noise  

---

## Shot List & Visual Composition

| Shot # | Timestamp | Visual Frame / Layout | On-Screen Action & Cursor Movements | Text Overlays / Callouts |
| :--- | :--- | :--- | :--- | :--- |
| **S-01** | 0:00 – 0:10 | Title Card (Dark mode gradient) | Clean title: "CrewGrid: Race-Proof Team Formation Engine" | Subtitle: "Hack4Hack Crew Hiring Challenge 2026 — PS1" |
| **S-02** | 0:10 – 0:25 | Full Screen Browser (`https://crewgrid-api.onrender.com`) | Scroll down landing page showing problem statement, core invariants callout, and architecture summary. | Callout: "Key Invariant: Exactly 1 team per user, hard capacity caps." |
| **S-03** | 0:25 – 0:45 | Browser Window (Auth & Profile) | Click "Get Started", enter registration email `alice@example.com`, submit. Redirect to profile setup, select skills `TypeScript`, `React`, `Node.js`, click "Save & Continue". | Badge: "Argon2id (RFC 9106) + HttpOnly Session Cookie" |
| **S-04** | 0:45 – 1:15 | Browser Window (Team Creation) | Navigate to `/app/events/:id/teams`, click "Create Team". Enter Name: "Cloud Innovators", Min Size: 2, Max Size: 3, Skills: TypeScript, Go. Click "Create". Team appears with 1/3 members (`forming`). | Highlight: "minSize: 2 (readiness), maxSize: 3 (hard capacity cap)" |
| **S-05** | 1:15 – 1:55 | Split Screen (Left: Window 1 Alice; Right: Window 2 Bob incognito) | On Right: Register Bob. Browse team board, find "Cloud Innovators", click "Request to Join", type message "Experienced Go backend dev".<br>On Left: Leader inbox shows notification badge. Alice views request and clicks "Approve".<br>Both windows automatically update to 2/3 members without reloading. | Green Banner: "Real-time SSE Notification & TanStack Query Invalidation" |
| **S-06** | 1:55 – 2:30 | Split Screen (Left: Alice; Right: Charlie incognito) | On Left: Alice clicks "Manage Invites" $\rightarrow$ "Generate Invite Link". Copy link.<br>On Right: Charlie pastes invite link `https://crewgrid-api.onrender.com/invite#token=...`, clicks "Join Team". Team transitions to 3/3 (`ready`).<br>On Right: Open new incognito Dave, try same invite link $\rightarrow$ Displays toast error: "Invite code already used (409 INVITE_USED)". | Red Toast Highlight: "HTTP 409 INVITE_USED (Single-Use Enforced)" |
| **S-07** | 2:30 – 3:30 | Terminal Full Screen (iTerm2 / Terminal with large legible font) | Run: `pnpm --filter @crewgrid/api exec vitest run test/concurrency.race.test.ts`.<br>Highlight RACE 1: 50 concurrent users racing for 1 seat $\rightarrow$ 1 success, 49 conflicts (409 TEAM_FULL), 0 server errors.<br>Highlight invariant verification output: 0 violations. | Callout Box: "O-04 Concurrency Mandate: Exactly 1 Winner, 49 Clean Rejections" |
| **S-08** | 3:30 – 4:10 | Split Screen (Left: Mermaid architecture diagram; Right: Browser on GitHub Actions) | On Left: Trace request flow through `withDomainTransaction`, guarded update, and unique index.<br>On Right: Scroll through GitHub Actions CI run #42869098437, showing all 104 API tests, 8 web tests, and 10 Playwright tests passing green. | Badge: "GitHub Actions CI Run #42869098437 (100% Green)" |
| **S-09** | 4:10 – 4:40 | Terminal & Evidence Viewer | Show `evidence/seed-summary.json` (10,000 synthetic participants and 2,000 teams generated in 0.98s).<br>Show k6 summary: 100 concurrent VUs, 68,728 requests, 1,200.4 RPS, board p95 = 88.83 ms.<br>Show query execution stats: 0 COLLSCAN, 0 in-memory sorts. | Metric Callout: "Board p95: 88.83 ms vs < 200 ms target (55.6% margin)" |
| **S-10** | 4:40 – 4:55 | End Card (Dark theme) | Links to GitHub repository, live URL, load-test report, and one-page design document. Closing thank-you message. | "Repo: github.com/Udit-Agarwal20/CrewGrid<br>Live: crewgrid-api.onrender.com" |

---

## Production Checklist Before Hitting Record
1. Clean desktop, close unnecessary dock apps, notifications disabled (Do Not Disturb).
2. Terminal font size set to 16pt+ with high-contrast color scheme (e.g. Dracula, Solarized Dark).
3. Browser zoom set to 110%–125% for high readability on 1080p displays.
4. Pre-test all browser actions in incognito before starting recording.
