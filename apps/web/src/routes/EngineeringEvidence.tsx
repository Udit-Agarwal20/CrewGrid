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
    <div className="min-h-screen bg-[#0B1020] text-[#E9EDF5] selection:bg-[#9BF5CC] selection:text-[#0B1020]">
      {/* Top Navigation Bar */}
      <header className="border-b border-[#35405A] bg-[#0B1020]/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#9BF5CC] flex items-center justify-center font-black text-[#0B1020] font-mono text-base shadow-sm">
                C
              </div>
              <span className="font-black tracking-tight text-lg">CrewGrid</span>
            </Link>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-[#9BF5CC]/15 text-[#9BF5CC] border border-[#9BF5CC]/30">
              Technical Evidence Dossier
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/app"
              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-[#E9EDF5] bg-[#222A42] hover:bg-[#35405A] border border-[#35405A] transition flex items-center gap-1.5"
            >
              <span>App Dashboard</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <a
              href="https://github.com/Udit-Agarwal20/CrewGrid"
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 rounded-xl text-xs font-mono text-[#E9EDF5] bg-[#171E31] border border-[#35405A] hover:border-[#9BF5CC] flex items-center gap-1.5 transition"
            >
              <FileCode className="w-3.5 h-3.5 text-[#9BF5CC]" />
              GitHub
            </a>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-12 space-y-16">
        {/* Hero Section */}
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#171E31] border border-[#35405A] text-xs font-mono text-[#9BF5CC]">
            <ShieldCheck className="w-3.5 h-3.5" />
            Hack4Hack Crew Hiring Challenge 2026 — Problem Statement 1
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight">
            Technical Evidence & Verification Dossier
          </h1>
          <p className="text-sm sm:text-base text-[#B5C1D4] leading-relaxed max-w-3xl">
            CrewGrid treats team admission under high contention as an atomic distributed state transition.
            This document compiles verified concurrency race proofs, local scale benchmarks, architectural invariants, automated test results, and production limitations.
          </p>

          <div className="p-3.5 rounded-xl bg-[#222A42]/50 border border-[#35405A] flex flex-wrap items-center gap-3 text-xs text-[#B5C1D4]">
            <div className="flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-[#9BF5CC] shrink-0" />
              <span><strong>Environment:</strong> Node.js 24 LTS · Express 5 · React 19 · MongoDB 8.0 Replica Set</span>
            </div>
            <span className="hidden sm:inline text-[#35405A]">|</span>
            <a
              href="https://github.com/Udit-Agarwal20/CrewGrid/actions/runs/43369567196"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[#9BF5CC] hover:underline font-mono"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              GitHub Actions CI Run #43369567196 (Passing)
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Executive Verification Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-[#171E31] border border-[#35405A]">
            <div className="text-2xl font-black font-mono text-[#9BF5CC]">104 / 104</div>
            <div className="text-xs font-bold uppercase text-[#B5C1D4] mt-1">API Integration Tests</div>
            <div className="text-[11px] text-[#B5C1D4]/70 mt-1">13 suites on real MongoDB RS</div>
          </div>

          <div className="p-5 rounded-2xl bg-[#171E31] border border-[#35405A]">
            <div className="text-2xl font-black font-mono text-[#9BF5CC]">0</div>
            <div className="text-xs font-bold uppercase text-[#B5C1D4] mt-1">Invariant Violations</div>
            <div className="text-[11px] text-[#B5C1D4]/70 mt-1">Validated via verify:invariants</div>
          </div>

          <div className="p-5 rounded-2xl bg-[#171E31] border border-[#35405A]">
            <div className="text-2xl font-black font-mono text-[#9BF5CC]">50-Way Race</div>
            <div className="text-xs font-bold uppercase text-[#B5C1D4] mt-1">Zero Over-Allocation</div>
            <div className="text-[11px] text-[#B5C1D4]/70 mt-1">Exactly 1 winner, 49 rejected (409)</div>
          </div>

          <div className="p-5 rounded-2xl bg-[#171E31] border border-[#35405A]">
            <div className="text-2xl font-black font-mono text-[#9BF5CC]">88.83 ms</div>
            <div className="text-xs font-bold uppercase text-[#B5C1D4] mt-1">Local 100-VU p95</div>
            <div className="text-[11px] text-[#B5C1D4]/70 mt-1">10k users / 2k teams dataset</div>
          </div>
        </div>

        {/* SECTION 1: Concurrency Race Condition Proof (Evaluation Priority 1) */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#35405A] pb-3">
            <div className="flex items-center gap-2.5">
              <Zap className="w-5 h-5 text-[#9BF5CC]" />
              <h2 className="text-xl font-bold tracking-tight">1. Concurrency Race Condition Proof</h2>
            </div>
            <a
              href="https://github.com/Udit-Agarwal20/CrewGrid/blob/main/apps/api/test/concurrency.race.test.ts"
              target="_blank"
              rel="noreferrer"
              className="text-xs font-mono text-[#9BF5CC] hover:underline flex items-center gap-1"
            >
              View Test Suite <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <p className="text-xs text-[#B5C1D4] leading-relaxed">
            The core requirement of PS1 is deterministic behavior under high concurrency. All membership mutations run within multi-document ACID transactions with WriteConflict retries and guarded atomic updates.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            {/* 50-way last seat */}
            <div className="p-6 rounded-2xl bg-[#171E31] border border-[#35405A] space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-[#E9EDF5]">50-Way Last-Seat Race (O-04)</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#9BF5CC]/20 text-[#9BF5CC]">
                  PASS (0 overbooking)
                </span>
              </div>
              <p className="text-xs text-[#B5C1D4] leading-relaxed">
                50 simulated concurrent users race for 1 remaining seat simultaneously via <code className="text-[#9BF5CC]">Promise.all</code>.
              </p>
              <div className="p-3.5 rounded-xl bg-[#0B1020] border border-[#35405A] font-mono text-xs text-[#B5C1D4] space-y-1">
                <div>&gt; Total concurrent requests: 50</div>
                <div className="text-[#9BF5CC]">&gt; HTTP 200/201 successful admissions: 1</div>
                <div className="text-[#FBBF24]">&gt; HTTP 409 Conflict (TEAM_FULL): 49</div>
                <div>&gt; HTTP 500 / 503 Internal Errors: 0</div>
                <div>&gt; Final team.memberCount: exactly maxSize</div>
              </div>
            </div>

            {/* Same-user two-team race */}
            <div className="p-6 rounded-2xl bg-[#171E31] border border-[#35405A] space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-[#E9EDF5]">Same-User Two-Team Race (O-01)</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#9BF5CC]/20 text-[#9BF5CC]">
                  PASS (0 double-memberships)
                </span>
              </div>
              <p className="text-xs text-[#B5C1D4] leading-relaxed">
                A single user simultaneously attempts to join Team A and Team B in the same event.
              </p>
              <div className="p-3.5 rounded-xl bg-[#0B1020] border border-[#35405A] font-mono text-xs text-[#B5C1D4] space-y-1">
                <div>&gt; Total concurrent requests: 2</div>
                <div className="text-[#9BF5CC]">&gt; Successful join: 1</div>
                <div className="text-[#FBBF24]">&gt; Rejected join (ALREADY_IN_TEAM): 1</div>
                <div>&gt; Invariant I-01 verified: 0 duplicate memberships</div>
                <div>&gt; Unique index enforced: memberships(hackathonId, userId)</div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 2: Performance & Scale Benchmark */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#35405A] pb-3">
            <div className="flex items-center gap-2.5">
              <BarChart3 className="w-5 h-5 text-[#9BF5CC]" />
              <h2 className="text-xl font-bold tracking-tight">2. Performance & Scale Benchmark</h2>
            </div>
            <a
              href="https://github.com/Udit-Agarwal20/CrewGrid/blob/main/docs/LOAD-TEST-REPORT.md"
              target="_blank"
              rel="noreferrer"
              className="text-xs font-mono text-[#9BF5CC] hover:underline flex items-center gap-1"
            >
              Full Load Test Report <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Environment Label Notice */}
          <div className="p-4 rounded-xl bg-[#222A42]/60 border border-[#FBBF24]/30 text-xs text-[#B5C1D4] space-y-1">
            <div className="font-bold text-[#FBBF24] flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              <span>Environment Notice: Local Benchmark Result vs Hosted Free-Tier</span>
            </div>
            <p>
              The <strong>88.83 ms p95</strong> latency figure was recorded in a controlled <strong>local 100-VU benchmark</strong> on an Apple Silicon host running Docker MongoDB 8.0 with sub-millisecond loopback latency. It is <strong>not</strong> a measurement of the hosted free-tier deployment on Render/Atlas M0, which operates under shared vCPUs and cross-cloud network hops.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="p-5 rounded-2xl bg-[#171E31] border border-[#35405A] space-y-1">
              <div className="text-xs font-mono text-[#B5C1D4]">Dataset Scale</div>
              <div className="text-xl font-bold text-[#E9EDF5]">10,000 Users · 2,000 Teams</div>
              <div className="text-[11px] text-[#B5C1D4]">Seeded deterministically in 0.98s</div>
            </div>

            <div className="p-5 rounded-2xl bg-[#171E31] border border-[#35405A] space-y-1">
              <div className="text-xs font-mono text-[#B5C1D4]">Sustained Concurrency</div>
              <div className="text-xl font-bold text-[#E9EDF5]">100 Virtual Users (k6)</div>
              <div className="text-[11px] text-[#B5C1D4]">68,728 requests · 1,200.4 RPS · 0.00% errors</div>
            </div>

            <div className="p-5 rounded-2xl bg-[#171E31] border border-[#35405A] space-y-1">
              <div className="text-xs font-mono text-[#B5C1D4]">Board Query Latency (Local)</div>
              <div className="text-xl font-bold text-[#9BF5CC]">p95 = 88.83 ms</div>
              <div className="text-[11px] text-[#B5C1D4]">p50 = 39.54 ms · Target &lt; 200 ms met</div>
            </div>
          </div>

          {/* Explain Query Stats */}
          <div className="p-5 rounded-2xl bg-[#171E31] border border-[#35405A] space-y-2 font-mono text-xs text-[#B5C1D4]">
            <div className="font-bold text-[#E9EDF5] flex items-center gap-2">
              <Database className="w-4 h-4 text-[#9BF5CC]" />
              MongoDB Query Plan (Explain Output — Page 2 Cursor)
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              <div>stage: <span className="text-[#9BF5CC]">FETCH + IXSCAN</span></div>
              <div>totalKeysExamined: <span className="text-[#9BF5CC]">24</span></div>
              <div>totalDocsExamined: <span className="text-[#9BF5CC]">24</span></div>
              <div>inMemorySort: <span className="text-[#9BF5CC]">false</span></div>
            </div>
          </div>
        </section>

        {/* SECTION 3: System Architecture & Invariants Matrix */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#35405A] pb-3">
            <div className="flex items-center gap-2.5">
              <Layers className="w-5 h-5 text-[#9BF5CC]" />
              <h2 className="text-xl font-bold tracking-tight">3. System Architecture & Invariants Matrix</h2>
            </div>
            <a
              href="https://github.com/Udit-Agarwal20/CrewGrid/blob/main/docs/FINAL-DESIGN-ONE-PAGER.md"
              target="_blank"
              rel="noreferrer"
              className="text-xs font-mono text-[#9BF5CC] hover:underline flex items-center gap-1"
            >
              Design One-Pager <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <p className="text-xs text-[#B5C1D4]">
            Every invariant is guarded at both the MongoDB unique index layer and within multi-document ACID transactions.
          </p>

          <div className="space-y-3 pt-2">
            {INVARIANTS.map((inv) => (
              <div
                key={inv.id}
                className="p-5 rounded-2xl bg-[#171E31] border border-[#35405A] space-y-2 hover:border-[#9BF5CC]/30 transition"
              >
                <div className="flex items-center gap-2.5">
                  <span className="px-2 py-0.5 rounded font-mono font-black text-xs bg-[#9BF5CC]/20 text-[#9BF5CC] border border-[#9BF5CC]/30">
                    {inv.id}
                  </span>
                  <h3 className="font-bold text-sm text-[#E9EDF5]">{inv.title}</h3>
                </div>
                <p className="text-xs text-[#B5C1D4] leading-relaxed">{inv.description}</p>
                <div className="p-2.5 rounded-lg bg-[#0B1020] border border-[#35405A] font-mono text-[11px] text-[#9BF5CC] overflow-x-auto">
                  {inv.index}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* SECTION 4: Automated Tests & Hosted CI Verification */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#35405A] pb-3">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-[#9BF5CC]" />
              <h2 className="text-xl font-bold tracking-tight">4. Automated Tests & Hosted CI Proof</h2>
            </div>
            <a
              href="https://github.com/Udit-Agarwal20/CrewGrid/actions/workflows/ci.yml"
              target="_blank"
              rel="noreferrer"
              className="text-xs font-mono text-[#9BF5CC] hover:underline flex items-center gap-1"
            >
              CI Workflow <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="p-5 rounded-2xl bg-[#171E31] border border-[#35405A] space-y-1">
              <div className="text-xs font-mono text-[#9BF5CC]">104 API Tests</div>
              <div className="text-sm font-bold text-[#E9EDF5]">API Integration Suite</div>
              <div className="text-xs text-[#B5C1D4]">13 files covering auth, teams, invites, requests, races, and SSE.</div>
            </div>

            <div className="p-5 rounded-2xl bg-[#171E31] border border-[#35405A] space-y-1">
              <div className="text-xs font-mono text-[#9BF5CC]">14 Web Tests</div>
              <div className="text-sm font-bold text-[#E9EDF5]">Frontend Unit Suite</div>
              <div className="text-xs text-[#B5C1D4]">Vitest tests covering auth context, routing sync, and named SSE events.</div>
            </div>

            <div className="p-5 rounded-2xl bg-[#171E31] border border-[#35405A] space-y-1">
              <div className="text-xs font-mono text-[#9BF5CC]">16 E2E Tests</div>
              <div className="text-sm font-bold text-[#E9EDF5]">Playwright Browser Suite</div>
              <div className="text-xs text-[#B5C1D4]">10 full user flows + 6 routing &amp; SSE regression scenarios.</div>
            </div>
          </div>

          {/* Reproduce Commands */}
          <div className="p-5 rounded-2xl bg-[#171E31] border border-[#35405A] space-y-3 font-mono text-xs">
            <div className="text-[#E9EDF5] font-bold flex items-center gap-2">
              <Terminal className="w-4 h-4 text-[#9BF5CC]" />
              Local Reproduction Commands
            </div>
            <div className="space-y-2">
              <div className="p-2.5 rounded-lg bg-[#0B1020] text-[#9BF5CC]">
                pnpm test:api <span className="text-[#B5C1D4]/60"># Runs 104 integration &amp; race tests</span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#0B1020] text-[#9BF5CC]">
                pnpm --filter @crewgrid/web test <span className="text-[#B5C1D4]/60"># Runs 14 web unit &amp; routing tests</span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#0B1020] text-[#9BF5CC]">
                pnpm verify:invariants <span className="text-[#B5C1D4]/60"># Validates all 9 database invariants</span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#0B1020] text-[#9BF5CC]">
                pnpm test:e2e <span className="text-[#B5C1D4]/60"># Runs 16 Playwright browser tests</span>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 5: Security & Token Secrecy Model */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#35405A] pb-3">
            <div className="flex items-center gap-2.5">
              <Lock className="w-5 h-5 text-[#9BF5CC]" />
              <h2 className="text-xl font-bold tracking-tight">5. Security &amp; Token Secrecy Model</h2>
            </div>
            <span className="text-xs font-mono text-[#B5C1D4]">Documented Controls</span>
          </div>

          <div className="p-6 rounded-2xl bg-[#171E31] border border-[#35405A] space-y-4 text-xs text-[#B5C1D4] leading-relaxed">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <h3 className="font-bold text-sm text-[#E9EDF5]">1. SHA-256 Hash Storage at Rest</h3>
                <p>
                  Invite tokens are generated with 32 cryptographically secure random bytes (<code className="text-[#9BF5CC]">crypto.randomBytes(32).toString('base64url')</code>).
                  Only their SHA-256 digest is stored in MongoDB. If the database were leaked, no plaintext invite tokens could be recovered.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-bold text-sm text-[#E9EDF5]">2. URL Fragment (#token=...) Defense</h3>
                <p>
                  Invite URLs transmit tokens via URI hash fragments (<code className="text-[#9BF5CC]">/invite#token=...</code>).
                  Per RFC 3986, fragments are never transmitted in HTTP request headers or logged in web server access logs. The client extracts and strips the fragment on mount.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-bold text-sm text-[#E9EDF5]">3. Argon2id Password Hashing</h3>
                <p>
                  Passwords require minimum 12 characters and are hashed with Argon2id (<code className="text-[#9BF5CC]">memoryCost: 19456, timeCost: 2, parallelism: 4</code>). A constant-time dummy verification runs on nonexistent users to eliminate username enumeration timing attacks.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-bold text-sm text-[#E9EDF5]">4. Origin + Server-Stored CSRF Validation</h3>
                <p>
                  State-changing requests validate Origin against allowed hosts. Authenticated sessions verify an <code className="text-[#9BF5CC]">X-CSRF-Token</code> request header against the database session document using <code className="text-[#9BF5CC]">crypto.timingSafeEqual</code>.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 6: Known Constraints & Technical Trade-offs */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#35405A] pb-3">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-[#FBBF24]" />
              <h2 className="text-xl font-bold tracking-tight">6. Known Constraints &amp; Technical Trade-offs</h2>
            </div>
            <span className="text-xs font-mono text-[#FBBF24]">Free-Tier Realities</span>
          </div>

          <div className="p-6 rounded-2xl bg-[#171E31] border border-[#35405A] space-y-4 text-xs text-[#B5C1D4] leading-relaxed">
            <div className="space-y-3">
              <div>
                <strong className="text-[#E9EDF5]">1. Free-Tier Spin-Down Latency:</strong> Render free web services spin down after 15 minutes of inactivity. The first request after spin-down incurs a 30–50 second cold-start delay while the Node process boots.
              </div>
              <div>
                <strong className="text-[#E9EDF5]">2. MongoDB Atlas M0 Operational Caps:</strong> The free Atlas tier shares memory (512MB RAM) and caps operations at 100 ops/sec. Scale load benchmarks were intentionally executed locally on Docker to measure true database throughput rather than free-tier network throttling.
              </div>
              <div>
                <strong className="text-[#E9EDF5]">3. High-Contention Write Lock Serialization:</strong> While read queries achieve sub-millisecond RAM caching, 50 simultaneous write transactions competing for the exact same team document lock will serialize, requiring ~3.5–4.0s for the entire 50-way race to resolve. <strong>Correctness and zero overbooking take absolute precedence over speculative parallel writes.</strong>
              </div>
              <div>
                <strong className="text-[#E9EDF5]">4. In-Memory Rate Limiting:</strong> Sliding-window rate limiters use an in-memory Map. Horizontal multi-instance scaling would replace this with a distributed Redis or Valkey cluster.
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <div className="pt-8 border-t border-[#35405A] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#B5C1D4]">
          <div>CrewGrid &copy; 2026 Udit Agarwal. Problem Statement 1 Submission.</div>
          <div className="flex items-center gap-4">
            <a
              href="https://crewgrid-api.onrender.com/health"
              target="_blank"
              rel="noreferrer"
              className="hover:text-[#9BF5CC] flex items-center gap-1 transition"
            >
              API Health <ExternalLink className="w-3 h-3" />
            </a>
            <Link to="/app" className="hover:text-[#9BF5CC] transition">
              Back to App
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
