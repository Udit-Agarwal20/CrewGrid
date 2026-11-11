import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

async function generatePdf() {
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>CrewGrid — Final Design One-Pager</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 6mm 8mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 7.6pt;
      line-height: 1.18;
      color: #1e293b;
      background: #ffffff;
    }
    header {
      border-bottom: 1.5px solid #0f172a;
      padding-bottom: 2px;
      margin-bottom: 4px;
    }
    .header-title {
      font-size: 13pt;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.2px;
    }
    .header-sub {
      font-size: 7.8pt;
      color: #475569;
      margin-top: 1px;
    }
    .meta-bar {
      display: flex;
      justify-content: space-between;
      background: #f1f5f9;
      padding: 2px 5px;
      border-radius: 2px;
      margin-top: 3px;
      font-size: 7.2pt;
      color: #334155;
      font-weight: 600;
    }
    .meta-bar a {
      color: #2563eb;
      text-decoration: none;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 5px;
    }
    .full-width {
      grid-column: span 2;
    }
    .card {
      border: 1px solid #e2e8f0;
      border-radius: 3px;
      padding: 4px 6px;
      background: #fafafa;
    }
    h2 {
      font-size: 8.5pt;
      font-weight: 700;
      color: #0f172a;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 1px;
      margin-bottom: 3px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    ul, ol {
      padding-left: 12px;
    }
    li {
      margin-bottom: 1.5px;
    }
    strong {
      color: #0f172a;
    }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 7.0pt;
      background: #e2e8f0;
      padding: 0.5px 2px;
      border-radius: 2px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 1px;
      font-size: 6.8pt;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 1.5px 3px;
      text-align: left;
    }
    th {
      background: #e2e8f0;
      font-weight: 700;
    }
    .badge-pass {
      color: #166534;
      font-weight: 700;
    }
    .footer {
      margin-top: 4px;
      border-top: 1px solid #e2e8f0;
      padding-top: 2px;
      font-size: 6.8pt;
      color: #64748b;
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>

  <header>
    <div class="header-title">CrewGrid — Race-Proof Team Formation at Scale</div>
    <div class="header-sub">Hack4Hack Crew Hiring Challenge 2026 — Problem Statement 1 (Production Verification)</div>
    <div class="meta-bar">
      <span>Author: Udit Agarwal</span>
      <span>Commit: <code>4f9c829</code></span>
      <span>CI: GitHub Actions #42869098437 (100% Green)</span>
      <span>Live Demo: <a href="https://crewgrid-api.onrender.com">crewgrid-api.onrender.com</a></span>
    </div>
  </header>

  <div class="grid">
    <!-- 1. Problem & Invariants -->
    <div class="card">
      <h2>1. Problem & Verified Domain Invariants</h2>
      <p style="margin-bottom: 3px;">High contention during team formation leads to overbooked rosters and race conditions. CrewGrid guarantees 5 core invariants:</p>
      <ul>
        <li><strong>Capacity Cap (I-01):</strong> <code>memberCount &le; maxSize</code> strictly preserved at all times. A 5-person team never admits a 6th member.</li>
        <li><strong>Event Exclusivity (I-03):</strong> Exactly &le; 1 active team per user per hackathon event (O-01). Compound unique index guarantees isolation.</li>
        <li><strong>Leadership Integrity (I-04):</strong> Active teams never left leaderless; departure triggers deterministic succession or logical delete (O-03).</li>
        <li><strong>Invite Secrecy & Single-Use (I-05):</strong> High-entropy 256-bit tokens, SHA-256 hashed at rest; exactly one redemption allowed (O-02).</li>
        <li><strong>Zero Count Drift (I-02):</strong> <code>memberCount == count(memberships)</code> always.</li>
      </ul>
    </div>

    <!-- 2. Concurrency Protection -->
    <div class="card">
      <h2>2. Concurrency & Overbooking Prevention</h2>
      <p style="margin-bottom: 3px;">All join actions execute inside atomic MongoDB replica-set transactions:</p>
      <ul>
        <li><strong>Guarded Increment:</strong> <code>teams.findOneAndUpdate({ _id, memberCount: { $lt: maxSize }, deletedAt: null }, { $inc: { memberCount: 1 } })</code>. Once full, subsequent ops match 0 docs and abort with 409 <code>TEAM_FULL</code>.</li>
        <li><strong>Cross-Team Dual-Join Arbitration:</strong> If a user redeems 2 invites concurrently, compound unique index <code>{ hackathonId: 1, userId: 1 }</code> on <code>memberships</code> rejects the loser with <code>E11000</code>, rolling back the losing counter.</li>
        <li><strong>Transactional Outbox:</strong> <code>realtime_events</code> written in same transaction; aborted transactions emit zero SSE events.</li>
      </ul>
    </div>

    <!-- 3. Data Model -->
    <div class="card full-width">
      <h2>3. Relational MongoDB Data Model & Indexes</h2>
      <table>
        <thead>
          <tr>
            <th>Collection</th>
            <th>Primary Fields</th>
            <th>Target Index Key & Options</th>
            <th>Engine Purpose & Guarantee</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>users</code></td>
            <td>_id, emailNormalized, passwordHash, discoverable, skills, timezone</td>
            <td><code>{ emailNormalized: 1 }</code> (unique), <code>{ discoverable: 1, skills: 1, updatedAt: -1, _id: -1 }</code></td>
            <td>Argon2id (RFC 9106); zero in-memory sort on teammate discovery.</td>
          </tr>
          <tr>
            <td><code>teams</code></td>
            <td>_id, hackathonId, name, memberCount, minSize, maxSize, leaderId, deletedAt</td>
            <td><code>{ hackathonId: 1, deletedAt: 1, updatedAt: -1, _id: -1 }</code>, <code>{ board_skills }</code></td>
            <td>Guarded atomic seat increment; O(1) cursor pagination.</td>
          </tr>
          <tr>
            <td><code>memberships</code></td>
            <td>_id, hackathonId, teamId, userId, joinedAt</td>
            <td><code>{ hackathonId: 1, userId: 1 }</code> (unique), <code>{ teamId: 1, joinedAt: 1, _id: 1 }</code></td>
            <td>Hard single-team constraint; deterministic seniority succession.</td>
          </tr>
          <tr>
            <td><code>invites</code></td>
            <td>_id, teamId, tokenHash, expiresAt, usedAt, usedBy</td>
            <td><code>{ tokenHash: 1 }</code> (unique), <code>{ teamId: 1, createdAt: -1 }</code></td>
            <td>Single-use invite redemption; plaintext tokens never persisted.</td>
          </tr>
          <tr>
            <td><code>join_requests</code></td>
            <td>_id, teamId, applicantId, status ("pending"|"approved"|"declined")</td>
            <td><code>{ teamId: 1, applicantId: 1 }</code> (unique partial for <code>pending</code>)</td>
            <td>Prevents duplicate pending applications per user per team.</td>
          </tr>
          <tr>
            <td><code>idempotency_keys</code></td>
            <td>_id, actorId, scope, key, requestHash, responseStatus, responseBody</td>
            <td><code>{ actorId: 1, scope: 1, key: 1 }</code> (unique), <code>{ expiresAt: 1 }</code> (TTL)</td>
            <td>Exact replay caching; duplicate mutation safety (O-05).</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 4. Test Evidence & Benchmarks -->
    <div class="card full-width">
      <h2>4. Empirical Test Evidence & Performance Benchmarks</h2>
      <div style="display: grid; grid-template-columns: 1.1fr 1fr; gap: 8px;">
        <div>
          <p><strong>Verified Concurrency & Quality Gates (CI Run #42869098437):</strong></p>
          <ul style="margin-top: 2px;">
            <li><strong>50-Way Last-Seat Race (O-04):</strong> 50 concurrent racers for 1 open seat &rarr; <span class="badge-pass">EXACTLY 1 succeeds (200), 49 rejected (409 TEAM_FULL)</span>, 0 server 5xx errors.</li>
            <li><strong>Automated Suite:</strong> 104 API tests, 8 web unit tests, 10 Playwright E2E tests, 0 invariant violations.</li>
            <li><strong>Query Plan Audit (9 Queries):</strong> 0 COLLSCAN, 0 in-memory sorts, sub-ms engine execution.</li>
            <li><strong>Security Audit:</strong> 13/13 passing (Argon2id, CSRF headers, RBAC leader guards, rate limits).</li>
          </ul>
        </div>
        <div>
          <p><strong>Scale & k6 Load Testing (10,000 Users, 2,000 Teams, 100 VUs):</strong></p>
          <table>
            <thead>
              <tr><th>Metric</th><th>Target</th><th>Measured Result</th><th>Status</th></tr>
            </thead>
            <tbody>
              <tr><td>Live Board p95</td><td>&lt; 200 ms</td><td><strong>88.83 ms</strong></td><td><span class="badge-pass">PASS (-55.6%)</span></td></tr>
              <tr><td>Cursor Paging p95</td><td>&lt; 200 ms</td><td><strong>85.92 ms</strong></td><td><span class="badge-pass">PASS</span></td></tr>
              <tr><td>Skills Filter p95</td><td>&lt; 200 ms</td><td><strong>85.69 ms</strong></td><td><span class="badge-pass">PASS</span></td></tr>
              <tr><td>System Throughput</td><td>—</td><td><strong>1,200.4 req/s</strong> (68.7k req)</td><td><span class="badge-pass">PASS</span></td></tr>
              <tr><td>Error Rate</td><td>&lt; 1.0%</td><td><strong>0.00%</strong> (0 errors)</td><td><span class="badge-pass">PASS</span></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- 5. Trade-offs -->
    <div class="card">
      <h2>5. Architectural Trade-offs</h2>
      <ul>
        <li><strong>Replica Set Overhead:</strong> Multi-document transactions require replica-set coordination and write locks. Mitigated via fine-grained collection indexes and bounded retry loops.</li>
        <li><strong>Free-Tier Cold Starts:</strong> Render and Atlas M0 free tier spin down after 15 min of inactivity (30–50s wake-up). Local benchmarks provide controlled, repeatable performance data.</li>
        <li><strong>Single-Instance In-Memory Primitives:</strong> In-process rate limiting and SSE polling are optimized for single-node deployment; multi-node scale requires a distributed Redis layer.</li>
      </ul>
    </div>

    <!-- 6. Next Steps -->
    <div class="card">
      <h2>6. With One Additional Week...</h2>
      <ul>
        <li><strong>Change Streams & Redis Pub/Sub:</strong> Replace outbox polling with reactive MongoDB Change Streams and a Redis backplane for horizontal multi-instance SSE fanout.</li>
        <li><strong>Chaos & Split-Brain Testing:</strong> Automated Jepsen test suite to simulate primary failover and network partitions during active admission races.</li>
        <li><strong>Semantic Vector Matching:</strong> Integrate vector embeddings into BigQuery or MongoDB Atlas Vector Search for semantic teammate topic matching.</li>
      </ul>
    </div>
  </div>

  <div class="footer">
    <span>CrewGrid &bull; Hack4Hack Crew Hiring Challenge 2026 &bull; Problem Statement 1</span>
    <span>Source Code: github.com/Udit-Agarwal20/CrewGrid &bull; Verified Commit: 4f9c829</span>
  </div>

</body>
</html>`;

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: 'networkidle' });

  const outputPath = path.resolve(process.cwd(), 'docs/FINAL-DESIGN-ONE-PAGER.pdf');
  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '8mm', bottom: '8mm', left: '10mm', right: '10mm' }
  });

  await browser.close();
  console.log(`✓ Generated single-page PDF at: ${outputPath}`);
}

generatePdf().catch((err) => {
  console.error('Failed to generate PDF:', err);
  process.exit(1);
});
