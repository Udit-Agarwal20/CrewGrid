# CrewGrid — Video Recording & Pre-Flight Checklist

Before recording the 5-minute video presentation, complete every item below to guarantee smooth execution without interruptions, unexpected errors, or visual glitches.

---

## 1. System & Environment Setup

- [ ] **Display Resolution:** Set main display resolution to 1920x1080 (or 2560x1440 scaled to 1080p output).
- [ ] **Do Not Disturb:** Enable macOS System Focus / Do Not Disturb to block notifications, Calendar alerts, and Slack popups.
- [ ] **Clean Desktop & Browser:**
  - Close all background browser tabs and personal bookmarks.
  - Hide the macOS Dock or configure auto-hide.
  - Use Google Chrome or Chromium in a clean profile.
  - Set default browser zoom to **110%–125%** so text is easily legible at 1080p.
- [ ] **Terminal Setup:**
  - Terminal font size: **16pt** or larger.
  - High-contrast color scheme (e.g., Dracula or Pro Dark).
  - Clear terminal history before starting (`clear`).
- [ ] **Audio Setup:**
  - Dedicated USB or condenser microphone positioned 4–6 inches from mouth.
  - Record a 15-second test clip; verify zero hum, echo, or clipped peaks.
  - Audio recording software set to 48 kHz / 24-bit.

---

## 2. Application & Data Pre-Flight Checks

- [ ] **Local Replica Set Running:**
  ```bash
  docker compose up -d --wait
  docker exec crewgrid_mongo mongosh --quiet --eval "rs.status().ok"
  # Must output: 1
  ```
- [ ] **Build Fresh Binaries:**
  ```bash
  pnpm -r build
  ```
- [ ] **Verify Concurrency Test Passes Cleanly:**
  ```bash
  pnpm --filter @crewgrid/api exec vitest run test/concurrency.race.test.ts
  # Must output: 8 passed (8)
  ```
- [ ] **Check Hosted Deployment Readiness:**
  - Visit [https://crewgrid-api.onrender.com/health](https://crewgrid-api.onrender.com/health) (ensure instance is awake from cold start).
  - Visit [https://crewgrid-api.onrender.com/ready](https://crewgrid-api.onrender.com/ready) (ensure database status is `connected`).
  - Open landing page [https://crewgrid-api.onrender.com](https://crewgrid-api.onrender.com).

---

## 3. Recording Rehearsal Run-Through

- [ ] **Scene 1 (Intro):** 25 seconds. Speak smoothly; cover problem, invariants, and stack.
- [ ] **Scene 2 (Live Journey):** 110 seconds.
  - Window 1: Alice registers, sets skills, creates "Cloud Innovators" (min 2, max 3).
  - Window 2 (Incognito): Bob registers, applies to team.
  - Window 1: Alice approves Bob; verify real-time update in both windows (2/3 members).
  - Window 1: Alice creates single-use invite link.
  - Window 3 (Incognito): Charlie redeems invite; verify team becomes 3/3 (`ready`).
  - Window 4 (Incognito): Dave tries same invite; verify 409 `INVITE_USED` error toast.
- [ ] **Scene 3 (Terminal Proof):** 60 seconds.
  - Run `pnpm --filter @crewgrid/api exec vitest run test/concurrency.race.test.ts`.
  - Pause cursor over RACE 1 (50 users for 1 seat $\rightarrow$ 1 success, 49 conflicts, 0 server errors).
  - Highlight 0 domain invariant violations.
- [ ] **Scene 4 (Architecture & Scale):** 50 seconds.
  - Show GitHub Actions CI run #42869098437 (100% green).
  - Show `evidence/k6-summary.json` and board p95: **88.83 ms** vs < 200 ms target.
  - Deliver free-tier environment disclosure.
- [ ] **Scene 5 (Conclusion):** 15 seconds.
  - Display links slide; conclude with confidence.

---

## 4. Post-Recording Quality Verification

- [ ] Total video duration is between **4m 15s and 4m 55s** (strictly under the 5-minute competition limit).
- [ ] Video renders in **1080p (1920x1080) MP4 (H.264)**.
- [ ] Audio is synchronized with screen actions; voice is clear and intelligible throughout.
- [ ] No personal emails, unhashed tokens, or sensitive API keys visible in any frame.
- [ ] Upload video to accessible, unlisted YouTube or Google Drive link (verify link opens in an incognito window without login requirements).

