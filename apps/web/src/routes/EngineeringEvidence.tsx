import { Link } from 'react-router';
import {
  ShieldCheck,
  Zap,
  Terminal,
  ExternalLink,
  Lock,
  FileCode,
  Database,
  Cpu,
  BarChart3,
  Layers,
  CheckCircle2,
  AlertTriangle,
  ArrowRight
} from 'lucide-react';

const INVARIANTS = [
  {
    id: 'I-01',
    title: 'Single-Team Assignment Guarantee',
    description: 'A user may belong to at most one team per hackathon. Enforced by unique compound index on memberships(hackathonId, userId) and transactional pre-checks before membership write.',
    index: "db.collection('memberships').createIndex({ hackathonId: 1, userId: 1 }, { unique: true, name: 'uniq_member_per_event' })"
  },
  {
    id: 'I-02',
    title: 'Strict Capacity Ceiling',
    description: 'team.memberCount <= team.maxSize is enforced atomically within MongoDB session transactions. Concurrency tests confirm 0 over-allocation under concurrent races.',
    index: "db.collection('teams').updateOne({ _id: teamId, memberCount: { $lt: maxSize } }, { $inc: { memberCount: 1 } }, { session })"
  },
  {
    id: 'I-03',
    title: 'Valid Capacity Range',
    description: 'minSize <= maxSize within hackathon bounds. Reductions of maxSize below the current memberCount are guarded and rejected with HTTP 400.',
    index: 'Zod refinement schema validation + guarded transactional capacity reductions'
  },
  {
    id: 'I-04',
    title: 'Deterministic Stage Derivation',
    description: "Team stage is derived dynamically: 'ready' when memberCount >= minSize, 'forming' otherwise.",
    index: "Derived inside transaction on every membership mutation: memberCount >= minSize ? 'ready' : 'forming'"
  },
  {
    id: 'I-05',
    title: 'Leader Invariant',
    description: 'Every team has exactly one active leader referenced by team.leaderId matching a valid membership record with role: leader.',
    index: "db.collection('memberships').createIndex({ teamId: 1, joinedAt: 1, _id: 1 }, { name: 'team_roster_succession' })"
  },
  {
    id: 'I-06',
    title: 'Atomic Leader Succession',
    description: 'When a leader leaves without explicit transfer, leadership automatically passes to the oldest member by joinedAt. If 1 member remains, the team is disbanded.',
    index: "membershipRepo.findOldestMember(teamId, session) -> sort({ joinedAt: 1 }).limit(1)"
  },
  {
    id: 'I-07',
    title: 'Join Request Lifecycle & Auto-Invalidation',
    description: 'A user may have at most one pending request per team. Joining a team automatically transitions all other pending requests for that user to invalidated.',
    index: "db.collection('join_requests').createIndex({ teamId: 1, applicantId: 1 }, { unique: true, partialFilterExpression: { status: 'pending' }, name: 'uniq_pending_request' })"
  },
  {
    id: 'I-08',
    title: 'Invite Token Secrecy & Single-Use Safety',
    description: 'Invite tokens are hashed with SHA-256 before storage. Plaintext tokens are never stored in the database, and URL fragments (#token=...) prevent network transmission.',
    index: "db.collection('invites').createIndex({ tokenHash: 1 }, { unique: true, name: 'uniq_invite_hash' })"
  },
  {
    id: 'I-09',
    title: 'Audit & Outbox Atomicity',
    description: 'Every domain mutation writes state change, immutable audit event, and transactional outbox event inside the exact same MongoDB ClientSession transaction.',
    index: "await auditService.recordEvent(..., session); await outboxRepo.insertEvent(..., session);"
  }
];

export function EngineeringEvidence() {
  return (
    <div className="min-h-screen bg-[#08080A] text-[#F4F4F5] selection:bg-[#FF6B35] selection:text-[#08080A]">
      {/* Top Navigation Bar */}
      <header className="border-b border-[#2C2826] bg-[#08080A]/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-white text-black font-display font-bold flex items-center justify-center text-sm shadow-sm">
                C
              </div>
              <span className="font-display font-bold tracking-tight text-lg text-white">CrewGrid</span>
            </Link>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-white/5 text-zinc-300 border border-[#2C2826]">
              Technical Evidence Dossier
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/app"
              className="px-4 py-2 rounded-full text-xs font-bold text-black bg-white hover:bg-zinc-200 transition-all duration-200 active:scale-95 flex items-center gap-1.5 shadow-sm"
            >
              <span>App Dashboard</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <a
              href="https://github.com/Udit-Agarwal20/CrewGrid"
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-2 rounded-full text-xs font-mono text-zinc-300 bg-white/5 border border-[#2C2826] hover:text-white hover:border-[#4E4A48] flex items-center gap-1.5 transition"
            >
              <FileCode className="w-3.5 h-3.5 text-[#FF7A45]" />
              GitHub
            </a>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-12 space-y-16">
        {/* Hero Section */}
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#111114] border border-[#2C2826] text-xs font-mono text-zinc-300">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Hack4Hack Crew Hiring Challenge 2026 — Problem Statement 1
          </div>
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white">
            Technical Evidence &amp; Verification Dossier
          </h1>
          <p className="text-sm sm:text-base text-zinc-400 leading-relaxed max-w-3xl">
            CrewGrid treats team admission under high contention as an atomic distributed state transition.
            This document compiles verified concurrency race proofs, local scale benchmarks, architectural invariants, automated test results, and production limitations.
          </p>

          <div className="p-3.5 rounded-xl bg-[#111114] border border-[#2C2826] flex flex-wrap items-center gap-3 text-xs text-zinc-400">
            <div className="flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-[#FF7A45] shrink-0" />
              <span><strong>Environment:</strong> Node.js 24 LTS · Express 5 · React 19 · MongoDB 8.0 Replica Set</span>
            </div>
            <span className="hidden sm:inline text-zinc-600">|</span>
            <a
              href="https://github.com/Udit-Agarwal20/CrewGrid/actions/runs/43374684523"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-emerald-400 hover:underline font-mono"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              GitHub Actions CI Run #43374684523 (Passing)
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Executive Verification Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-[#111114] border border-[#2C2826]">
            <div className="text-2xl font-black font-display text-white">100%</div>
            <div className="text-xs font-bold uppercase text-zinc-400 mt-1 font-mono">API Integration Pass</div>
            <div className="text-[11px] text-zinc-400 mt-1">Comprehensive test suites on real MongoDB RS</div>
          </div>

          <div className="p-5 rounded-2xl bg-[#111114] border border-[#2C2826]">
            <div className="text-2xl font-black font-display text-white">0</div>
            <div className="text-xs font-bold uppercase text-zinc-400 mt-1 font-mono">Invariant Violations</div>
            <div className="text-[11px] text-zinc-400 mt-1">Validated via verify:invariants</div>
          </div>

          <div className="p-5 rounded-2xl bg-[#111114] border border-[#2C2826]">
            <div className="text-2xl font-black font-display text-emerald-400">50-Way Race</div>
            <div className="text-xs font-bold uppercase text-zinc-400 mt-1 font-mono">Zero Over-Allocation</div>
            <div className="text-[11px] text-zinc-400 mt-1">Exactly 1 winner, 49 rejected (409)</div>
          </div>

          <div className="p-5 rounded-2xl bg-[#111114] border border-[#2C2826]">
            <div className="text-2xl font-black font-display text-[#FF7A45]">88.83 ms</div>
            <div className="text-xs font-bold uppercase text-zinc-400 mt-1 font-mono">Local 100-VU p95</div>
            <div className="text-[11px] text-zinc-400 mt-1">10k users / 2k teams dataset</div>
          </div>
        </div>

        {/* SECTION 1: Concurrency Race Condition Proof (Evaluation Priority 1) */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#2C2826] pb-3">
            <div className="flex items-center gap-2.5">
              <Zap className="w-5 h-5 text-[#FF7A45]" />
              <h2 className="font-display text-xl font-bold tracking-tight text-white">1. Concurrency Race Condition Proof</h2>
            </div>
            <a
              href="https://github.com/Udit-Agarwal20/CrewGrid/blob/main/apps/api/test/concurrency.race.test.ts"
              target="_blank"
              rel="noreferrer"
              className="text-xs font-mono text-zinc-400 hover:text-white flex items-center gap-1 transition"
            >
              View Test Suite <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <p className="text-xs text-zinc-400 leading-relaxed">
            The core requirement of PS1 is deterministic behavior under high concurrency. All membership mutations run within multi-document ACID transactions with WriteConflict retries and guarded atomic updates.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            {/* 50-way last seat */}
            <div className="p-6 rounded-2xl bg-[#111114] border border-[#2C2826] space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-white">50-Way Last-Seat Race (O-04)</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  PASS (0 overbooking)
                </span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                50 simulated concurrent users race for 1 remaining seat simultaneously via <code className="text-[#FF7A45] font-mono">Promise.all</code>.
              </p>
              <div className="p-3.5 rounded-xl bg-[#18181C] border border-[#2C2826] font-mono text-xs text-zinc-300 space-y-1">
                <div>&gt; Total concurrent requests: 50</div>
                <div className="text-emerald-400">&gt; HTTP 200/201 successful admissions: 1</div>
                <div className="text-amber-400">&gt; HTTP 409 Conflict (TEAM_FULL): 49</div>
                <div>&gt; HTTP 500 / 503 Internal Errors: 0</div>
                <div>&gt; Final team.memberCount: exactly maxSize</div>
              </div>
            </div>

            {/* Same-user two-team race */}
            <div className="p-6 rounded-2xl bg-[#111114] border border-[#2C2826] space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-white">Same-User Two-Team Race (O-01)</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  PASS (0 double-memberships)
                </span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                A single user simultaneously attempts to join Team A and Team B in the same event.
              </p>
              <div className="p-3.5 rounded-xl bg-[#18181C] border border-[#2C2826] font-mono text-xs text-zinc-300 space-y-1">
                <div>&gt; Total concurrent requests: 2</div>
                <div className="text-emerald-400">&gt; Successful join: 1</div>
                <div className="text-amber-400">&gt; Rejected join (ALREADY_IN_TEAM): 1</div>
                <div>&gt; Invariant I-01 verified: 0 duplicate memberships</div>
                <div>&gt; Unique index enforced: memberships(hackathonId, userId)</div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 2: Performance & Scale Benchmark */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#2C2826] pb-3">
            <div className="flex items-center gap-2.5">
              <BarChart3 className="w-5 h-5 text-[#FF7A45]" />
              <h2 className="font-display text-xl font-bold tracking-tight text-white">2. Performance &amp; Scale Benchmark</h2>
            </div>
            <a
              href="https://github.com/Udit-Agarwal20/CrewGrid/blob/main/docs/LOAD-TEST-REPORT.md"
              target="_blank"
              rel="noreferrer"
              className="text-xs font-mono text-zinc-400 hover:text-white flex items-center gap-1 transition"
            >
              Full Load Test Report <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Environment Label Notice */}
          <div className="p-4 rounded-xl bg-[#18181C] border border-amber-500/30 text-xs text-zinc-400 space-y-1">
            <div className="font-bold text-amber-400 flex items-center gap-1.5 font-display">
              <AlertTriangle className="w-4 h-4" />
              <span>Environment Notice: Local Benchmark Result vs Hosted Free-Tier</span>
            </div>
            <p>
              The <strong className="text-white">88.83 ms p95</strong> latency figure was recorded in a controlled <strong className="text-white">local 100-VU benchmark</strong> on an Apple Silicon host running Docker MongoDB 8.0 with sub-millisecond loopback latency. It is <strong className="text-white">not</strong> a measurement of the hosted free-tier deployment on Render/Atlas M0, which operates under shared vCPUs and cross-cloud network hops.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="p-5 rounded-2xl bg-[#111114] border border-[#2C2826] space-y-1">
              <div className="text-xs font-mono text-zinc-400">Dataset Scale</div>
              <div className="text-xl font-bold text-white font-display">10,000 Users · 2,000 Teams</div>
              <div className="text-[11px] text-zinc-400">Seeded deterministically in 0.98s</div>
            </div>

            <div className="p-5 rounded-2xl bg-[#111114] border border-[#2C2826] space-y-1">
              <div className="text-xs font-mono text-zinc-400">Sustained Concurrency</div>
              <div className="text-xl font-bold text-white font-display">100 Virtual Users (k6)</div>
              <div className="text-[11px] text-zinc-400">68,728 requests · 1,200.4 RPS · 0.00% errors</div>
            </div>

            <div className="p-5 rounded-2xl bg-[#111114] border border-[#2C2826] space-y-1">
              <div className="text-xs font-mono text-zinc-400">Board Query Latency (Local)</div>
              <div className="text-xl font-bold text-emerald-400 font-display">p95 = 88.83 ms</div>
              <div className="text-[11px] text-zinc-400">p50 = 39.54 ms · Target &lt; 200 ms met</div>
            </div>
          </div>

          {/* Explain Query Stats */}
          <div className="p-5 rounded-2xl bg-[#111114] border border-[#2C2826] space-y-2 font-mono text-xs text-zinc-400">
            <div className="font-bold text-white flex items-center gap-2 font-display">
              <Database className="w-4 h-4 text-[#FF7A45]" />
              MongoDB Query Plan (Explain Output — Page 2 Cursor)
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              <div>stage: <span className="text-emerald-400">FETCH + IXSCAN</span></div>
              <div>totalKeysExamined: <span className="text-emerald-400">24</span></div>
              <div>totalDocsExamined: <span className="text-emerald-400">24</span></div>
              <div>inMemorySort: <span className="text-emerald-400">false</span></div>
            </div>
          </div>
        </section>

        {/* SECTION 3: System Architecture & Invariants Matrix */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#2C2826] pb-3">
            <div className="flex items-center gap-2.5">
              <Layers className="w-5 h-5 text-[#FF7A45]" />
              <h2 className="font-display text-xl font-bold tracking-tight text-white">3. System Architecture &amp; Invariants Matrix</h2>
            </div>
            <a
              href="https://github.com/Udit-Agarwal20/CrewGrid/blob/main/docs/FINAL-DESIGN-ONE-PAGER.md"
              target="_blank"
              rel="noreferrer"
              className="text-xs font-mono text-zinc-400 hover:text-white flex items-center gap-1 transition"
            >
              Design One-Pager <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <p className="text-xs text-zinc-400">
            Every invariant is guarded at both the MongoDB unique index layer and within multi-document ACID transactions.
          </p>

          <div className="space-y-3 pt-2">
            {INVARIANTS.map((inv) => (
              <div
                key={inv.id}
                className="p-5 rounded-2xl bg-[#111114] border border-[#2C2826] space-y-2 hover:border-[#4E4A48] transition"
              >
                <div className="flex items-center gap-2.5">
                  <span className="px-2.5 py-0.5 rounded-full font-mono font-bold text-xs bg-white/10 text-white border border-[#2C2826]">
                    {inv.id}
                  </span>
                  <h3 className="font-display font-bold text-sm text-white">{inv.title}</h3>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">{inv.description}</p>
                <div className="p-3 rounded-xl bg-[#18181C] border border-[#2C2826] font-mono text-[11px] text-zinc-300 overflow-x-auto">
                  {inv.index}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION 4: Automated Tests & Hosted CI Verification */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#2C2826] pb-3">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <h2 className="font-display text-xl font-bold tracking-tight text-white">4. Automated Tests &amp; Hosted CI Proof</h2>
            </div>
            <a
              href="https://github.com/Udit-Agarwal20/CrewGrid/actions/workflows/ci.yml"
              target="_blank"
              rel="noreferrer"
              className="text-xs font-mono text-zinc-400 hover:text-white flex items-center gap-1 transition"
            >
              CI Workflow <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="p-5 rounded-2xl bg-[#111114] border border-[#2C2826] space-y-1">
              <div className="text-xs font-mono text-emerald-400 font-bold">166 API Tests</div>
              <div className="text-sm font-bold text-white font-display">API Integration Suite</div>
              <div className="text-xs text-zinc-400">16 test files covering auth, teams, invites, requests, races, outbox delivery, and SSE.</div>
            </div>

            <div className="p-5 rounded-2xl bg-[#111114] border border-[#2C2826] space-y-1">
              <div className="text-xs font-mono text-emerald-400 font-bold">28 Web Tests</div>
              <div className="text-sm font-bold text-white font-display">Frontend Unit Suite</div>
              <div className="text-xs text-zinc-400">5 test files covering auth context, routing sync, named SSE events, matching UI, and modal a11y.</div>
            </div>

            <div className="p-5 rounded-2xl bg-[#111114] border border-[#2C2826] space-y-1">
              <div className="text-xs font-mono text-emerald-400 font-bold">30 E2E Tests</div>
              <div className="text-sm font-bold text-white font-display">Playwright Browser Suite</div>
              <div className="text-xs text-zinc-400">10 full user flows, 9 automated WCAG 2.2 AA Axe scans, responsive layouts, and SSE scenarios.</div>
            </div>
          </div>

          {/* Reproduce Commands */}
          <div className="p-5 rounded-2xl bg-[#111114] border border-[#2C2826] space-y-3 font-mono text-xs">
            <div className="text-white font-bold flex items-center gap-2 font-display">
              <Terminal className="w-4 h-4 text-[#FF7A45]" />
              Local Reproduction Commands
            </div>
            <div className="space-y-2">
              <div className="p-2.5 rounded-xl bg-[#18181C] border border-[#2C2826] text-white">
                pnpm test:api <span className="text-zinc-400"># Runs integration, SSE authorization &amp; race tests</span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#18181C] border border-[#2C2826] text-white">
                pnpm --filter @crewgrid/web test <span className="text-zinc-400"># Runs web unit &amp; accessibility tests</span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#18181C] border border-[#2C2826] text-white">
                pnpm verify:invariants <span className="text-zinc-400"># Validates all 9 database invariants</span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#18181C] border border-[#2C2826] text-white">
                pnpm test:e2e <span className="text-zinc-400"># Runs Playwright browser &amp; accessibility tests</span>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 5: Security & Token Secrecy Model */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#2C2826] pb-3">
            <div className="flex items-center gap-2.5">
              <Lock className="w-5 h-5 text-[#FF7A45]" />
              <h2 className="font-display text-xl font-bold tracking-tight text-white">5. Security &amp; Token Secrecy Model</h2>
            </div>
            <span className="text-xs font-mono text-zinc-400">Documented Controls</span>
          </div>

          <div className="p-6 rounded-2xl bg-[#111114] border border-[#2C2826] space-y-4 text-xs text-zinc-400 leading-relaxed">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <h3 className="font-bold text-sm text-white font-display">1. SHA-256 Hash Storage at Rest</h3>
                <p>
                  Invite tokens are generated with 32 cryptographically secure random bytes (<code className="text-[#FF7A45] font-mono">crypto.randomBytes(32).toString('base64url')</code>).
                  Only their SHA-256 digest is stored in MongoDB. If the database were leaked, no plaintext invite tokens could be recovered.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-bold text-sm text-white font-display">2. URL Fragment (#token=...) Defense</h3>
                <p>
                  Invite URLs transmit tokens via URI hash fragments (<code className="text-[#FF7A45] font-mono">/invite#token=...</code>).
                  Per RFC 3986, fragments are never transmitted in HTTP request headers or logged in web server access logs. The client extracts and strips the fragment on mount.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-bold text-sm text-white font-display">3. Argon2id Password Hashing</h3>
                <p>
                  Passwords require minimum 12 characters and are hashed with Argon2id (<code className="text-[#FF7A45] font-mono">memoryCost: 19456, timeCost: 2, parallelism: 4</code>). A constant-time dummy verification runs on nonexistent users to eliminate username enumeration timing attacks.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-bold text-sm text-white font-display">4. Origin + Server-Stored CSRF Validation</h3>
                <p>
                  State-changing requests validate Origin against allowed hosts. Authenticated sessions verify an <code className="text-[#FF7A45] font-mono">X-CSRF-Token</code> request header against the database session document using <code className="text-[#FF7A45] font-mono">crypto.timingSafeEqual</code>.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 6: Known Constraints & Technical Trade-offs */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#2C2826] pb-3">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              <h2 className="font-display text-xl font-bold tracking-tight text-white">6. Known Constraints &amp; Technical Trade-offs</h2>
            </div>
            <span className="text-xs font-mono text-amber-400">Free-Tier Realities</span>
          </div>

          <div className="p-6 rounded-2xl bg-[#111114] border border-[#2C2826] space-y-4 text-xs text-zinc-400 leading-relaxed">
            <div className="space-y-3">
              <div>
                <strong className="text-white font-display">1. Free-Tier Spin-Down Latency:</strong> Render free web services spin down after 15 minutes of inactivity. The first request after spin-down incurs a 30–50 second cold-start delay while the Node process boots.
              </div>
              <div>
                <strong className="text-white font-display">2. MongoDB Atlas M0 Operational Caps:</strong> The free Atlas tier shares memory (512MB RAM) and caps operations at 100 ops/sec. Scale load benchmarks were intentionally executed locally on Docker to measure true database throughput rather than free-tier network throttling.
              </div>
              <div>
                <strong className="text-white font-display">3. High-Contention Write Lock Serialization:</strong> While read queries achieve sub-millisecond RAM caching, 50 simultaneous write transactions competing for the exact same team document lock will serialize, requiring ~3.5–4.0s for the entire 50-way race to resolve. <strong className="text-white">Correctness and zero overbooking take absolute precedence over speculative parallel writes.</strong>
              </div>
              <div>
                <strong className="text-white font-display">4. In-Memory Rate Limiting:</strong> Sliding-window rate limiters use an in-memory Map. Horizontal multi-instance scaling would replace this with a distributed Redis or Valkey cluster.
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <div className="pt-8 border-t border-[#2C2826] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-400">
          <div>CrewGrid &copy; 2026 Udit Agarwal. Problem Statement 1 Submission.</div>
          <div className="flex items-center gap-4">
            <a
              href="https://crewgrid-api.onrender.com/health"
              target="_blank"
              rel="noreferrer"
              className="hover:text-white flex items-center gap-1 transition"
            >
              API Health <ExternalLink className="w-3 h-3" />
            </a>
            <Link to="/app" className="hover:text-white transition">
              Back to App
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
