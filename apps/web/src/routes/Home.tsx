import { Link } from 'react-router';
import {
  Users,
  ArrowRight,
  ShieldCheck,
  Zap,
  Sparkles,
  Lock,
  UserCheck,
  CheckCircle2,
  Layers,
  Code2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function Home() {
  const { isAuthenticated, user } = useAuth();

  return (
    <div className="flex flex-col min-h-screen overflow-x-hidden w-full max-w-[100vw] bg-[#08080A] text-[#F4F4F5] selection:bg-[#FF6B35] selection:text-[#08080A]">
      {/* Top Floating Navigation */}
      <header className="sticky top-0 z-40 w-full border-b border-[#2C2826] bg-[#08080A]/85 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group shrink-0">
            <span className="w-8 h-8 rounded-xl bg-white text-black font-display font-black flex items-center justify-center text-sm shadow-sm transition-transform group-hover:scale-105">
              C
            </span>
            <div className="flex flex-col">
              <span className="font-display font-bold text-base text-white tracking-tight">CrewGrid</span>
              <span className="text-[10px] font-mono text-[#FF7A45] uppercase tracking-wider -mt-1 font-semibold">
                Team Formation
              </span>
            </div>
          </Link>

          <nav className="flex items-center gap-2 sm:gap-6">
            <Link
              to="/engineering"
              className="hidden sm:inline-block text-xs sm:text-sm font-medium text-zinc-400 hover:text-white transition-colors"
            >
              Technical Evidence
            </Link>

            {isAuthenticated ? (
              <Link
                to="/app"
                className="px-4 py-2 rounded-full bg-white hover:bg-zinc-200 text-black text-xs sm:text-sm font-semibold transition-all duration-200 active:scale-95 shadow-xs flex items-center gap-1.5"
              >
                <span>Dashboard</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className="px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium text-zinc-300 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  className="px-4 py-2 rounded-full bg-white hover:bg-zinc-200 text-black text-xs sm:text-sm font-semibold transition-all duration-200 active:scale-95 shadow-xs flex items-center gap-1"
                >
                  <span>Get Started</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            )}
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative px-4 pt-16 pb-20 md:pt-28 md:pb-28 max-w-6xl mx-auto w-full text-center overflow-hidden">
        {/* Subtle Ambient Background Accents */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[600px] h-[300px] bg-[#FF6B35]/10 blur-[130px] rounded-full pointer-events-none" />

        {/* Challenge Kicker Pill */}
        <div className="inline-flex max-w-full flex-wrap items-center justify-center gap-2 px-3.5 py-1.5 rounded-full bg-[#18181C] border border-[#2C2826] text-xs font-mono text-zinc-300 mb-8 hover:border-[#4E4A48] transition-colors text-center">
          <span className="w-2 h-2 rounded-full bg-[#FF6B35] animate-pulse shrink-0" />
          <span className="break-words">Hack4Hack Crew Hiring Challenge 2026 · Problem Statement 1</span>
        </div>

        {/* Master Headline */}
        <h1 className="font-display text-4xl sm:text-6xl md:text-7xl font-bold tracking-tighter text-white max-w-4xl mx-auto leading-[1.08]">
          Find your crew. <br />
          <span className="text-[#FF7A45]">Build something bigger.</span>
        </h1>

        <p className="mt-6 text-base sm:text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed font-normal">
          Discover hackathon teammates, find complementary skills, and recruit your squad with race-proof concurrency guarantees, real-time live sync, and algorithmic matching.
        </p>

        {/* Action Buttons */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3.5 max-w-md mx-auto">
          {isAuthenticated ? (
            <Link
              to="/app"
              className="w-full sm:w-auto px-7 py-3.5 rounded-full bg-white hover:bg-zinc-200 text-black font-bold text-sm flex items-center justify-center gap-2 transition-all duration-200 active:scale-95 shadow-md shadow-white/10"
            >
              <span>Continue to Dashboard ({user?.displayName})</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          ) : (
            <>
              <Link
                to="/register"
                className="w-full sm:w-auto px-7 py-3.5 rounded-full bg-white hover:bg-zinc-200 text-black font-bold text-sm flex items-center justify-center gap-2 transition-all duration-200 active:scale-95 shadow-md shadow-white/10"
              >
                <span>Create Your Profile</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/login"
                className="w-full sm:w-auto px-6 py-3.5 rounded-full bg-[#18181C] hover:bg-[#202026] border border-[#2C2826] text-zinc-200 hover:text-white font-semibold text-sm transition-all duration-200"
              >
                Sign In
              </Link>
            </>
          )}
        </div>

        {/* Hero Interactive-Style Team Preview Card */}
        <div className="mt-16 sm:mt-20 max-w-4xl mx-auto text-left">
          <div className="relative rounded-2xl bg-[#111114] border border-[#2C2826] p-6 sm:p-8 shadow-2xl">
            {/* Top Bar Preview */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 mb-6 border-b border-[#2C2826] gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/25">
                    Forming (2/3 Seats)
                  </span>
                  <span className="text-xs font-mono text-zinc-400">Team #2026</span>
                </div>
                <h3 className="font-display text-2xl font-bold text-white tracking-tight">
                  Autonomous Infra Squad
                </h3>
                <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-xl">
                  Building verifiable distributed consensus systems with zero partial writes and sub-second failover.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#18181C] border border-[#2C2826] text-xs font-mono text-zinc-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live SSE Connected
                </span>
              </div>
            </div>

            {/* Roster & Compatibility Preview */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column: Roster */}
              <div className="space-y-3">
                <span className="text-xs font-mono uppercase text-zinc-400 font-semibold tracking-wider">
                  Confirmed Crew (2 of 3)
                </span>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-[#18181C] border border-[#2C2826]">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-zinc-800 text-white font-display font-bold flex items-center justify-center text-xs">
                        GH
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white">Grace Hopper (Leader)</p>
                        <p className="text-[11px] font-mono text-zinc-400">Compilers · Distributed Systems</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">Leader</span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-[#18181C] border border-[#2C2826]">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-zinc-800 text-white font-display font-bold flex items-center justify-center text-xs">
                        AL
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white">Ada Lovelace</p>
                        <p className="text-[11px] font-mono text-zinc-400">TypeScript · Web Architecture</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">Builder</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Looking for 1 Seat */}
              <div className="space-y-3">
                <span className="text-xs font-mono uppercase text-[#FF7A45] font-semibold tracking-wider">
                  Target Missing Skill (1 Seat Left)
                </span>
                <div className="p-4 rounded-xl bg-[#18181C]/60 border border-[#2C2826] flex flex-col justify-between h-[120px]">
                  <div>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-[#FF6B35]/15 text-[#FF7A45] border border-[#FF6B35]/30">
                        Rust
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-[#18181C] text-zinc-300 border border-[#2C2826]">
                        Terraform
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400">
                      Top Recommendation: <span className="text-white font-medium">94% Compatibility Match</span> based on timezone synergy and novel skill contribution.
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 pt-2 border-t border-[#2C2826]/60">
                    <span>Atomic Lock-in</span>
                    <span className="text-emerald-400">Zero Race Condition</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How CrewGrid Works: 01, 02, 03 */}
      <section className="px-4 py-20 border-t border-[#2C2826] bg-[#0C0C0F]/60">
        <div className="max-w-6xl mx-auto">
          <div className="mb-14">
            <span className="text-xs font-mono text-[#FF7A45] uppercase font-bold tracking-wider">
              Workflow
            </span>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-white mt-1.5 tracking-tight">
              How CrewGrid Works
            </h2>
            <p className="text-sm text-zinc-400 mt-2 max-w-lg">
              Three streamlined steps from individual developer to a complete, race-proof hackathon crew.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 sm:p-7 rounded-2xl bg-[#111114] border border-[#2C2826] flex flex-col justify-between hover:border-[#4E4A48] transition-all">
              <div>
                <span className="font-display text-4xl sm:text-5xl font-bold text-zinc-400 block mb-4">
                  01
                </span>
                <h3 className="font-display text-xl font-bold text-white">Create Your Profile</h3>
                <p className="text-xs sm:text-sm text-zinc-400 mt-2.5 leading-relaxed">
                  List your core skills, timezone, preferred working hours, and discoverability preferences with opt-in privacy controls.
                </p>
              </div>
              <div className="pt-6 mt-6 border-t border-[#2C2826]/60 flex items-center gap-2 text-xs font-mono text-zinc-400">
                <Code2 className="w-4 h-4 text-[#FF7A45]" />
                <span>Skills & Availability Profile</span>
              </div>
            </div>

            <div className="p-6 sm:p-7 rounded-2xl bg-[#111114] border border-[#2C2826] flex flex-col justify-between hover:border-[#4E4A48] transition-all">
              <div>
                <span className="font-display text-4xl sm:text-5xl font-bold text-zinc-400 block mb-4">
                  02
                </span>
                <h3 className="font-display text-xl font-bold text-white">Discover & Match</h3>
                <p className="text-xs sm:text-sm text-zinc-400 mt-2.5 leading-relaxed">
                  Browse open teams by capacity and required skills, or browse unassigned candidates with explainable 0–100 match breakdown scores.
                </p>
              </div>
              <div className="pt-6 mt-6 border-t border-[#2C2826]/60 flex items-center gap-2 text-xs font-mono text-zinc-400">
                <Sparkles className="w-4 h-4 text-[#FF7A45]" />
                <span>Algorithmic Recommendations</span>
              </div>
            </div>

            <div className="p-6 sm:p-7 rounded-2xl bg-[#111114] border border-[#2C2826] flex flex-col justify-between hover:border-[#4E4A48] transition-all">
              <div>
                <span className="font-display text-4xl sm:text-5xl font-bold text-zinc-400 block mb-4">
                  03
                </span>
                <h3 className="font-display text-xl font-bold text-white">Atomic Lock-In</h3>
                <p className="text-xs sm:text-sm text-zinc-400 mt-2.5 leading-relaxed">
                  Apply with custom notes, approve join requests, or share single-use invite tokens. Capacity limits are enforced atomically in transactions.
                </p>
              </div>
              <div className="pt-6 mt-6 border-t border-[#2C2826]/60 flex items-center gap-2 text-xs font-mono text-zinc-400">
                <Lock className="w-4 h-4 text-[#FF7A45]" />
                <span>Transactional Concurrency</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Product Experience Showcase */}
      <section className="px-4 py-20 border-t border-[#2C2826]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-xs font-mono text-[#FF7A45] uppercase font-bold tracking-wider">
              Experience
            </span>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-white mt-1.5 tracking-tight">
              Engineered for Real Hackathon Teams
            </h2>
            <p className="text-sm text-zinc-400 mt-2">
              Every interface is built to make recruitment intuitive, transparent, and immediate.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 sm:p-8 rounded-2xl bg-[#111114] border border-[#2C2826] hover:border-[#4E4A48] transition-all">
              <div className="w-10 h-10 rounded-xl bg-[#18181C] text-[#FF7A45] border border-[#2C2826] flex items-center justify-center mb-5">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="font-display text-xl font-bold text-white">Dynamic Team Discovery</h3>
              <p className="text-xs sm:text-sm text-zinc-400 mt-2 leading-relaxed">
                Filter teams by forming status, missing skills, and available seats. Clear visual capacity progress indicates immediately whether a team has open seats.
              </p>
            </div>

            <div className="p-6 sm:p-8 rounded-2xl bg-[#111114] border border-[#2C2826] hover:border-[#4E4A48] transition-all">
              <div className="w-10 h-10 rounded-xl bg-[#18181C] text-[#FF7A45] border border-[#2C2826] flex items-center justify-center mb-5">
                <Sparkles className="w-5 h-5" />
              </div>
              <h3 className="font-display text-xl font-bold text-white">Smart Match Breakdown</h3>
              <p className="text-xs sm:text-sm text-zinc-400 mt-2 leading-relaxed">
                No black boxes: recommendations show clear breakdowns between required skill overlap (70%) and timezone collaboration window synergy (30%).
              </p>
            </div>

            <div className="p-6 sm:p-8 rounded-2xl bg-[#111114] border border-[#2C2826] hover:border-[#4E4A48] transition-all">
              <div className="w-10 h-10 rounded-xl bg-[#18181C] text-[#FF7A45] border border-[#2C2826] flex items-center justify-center mb-5">
                <Layers className="w-5 h-5" />
              </div>
              <h3 className="font-display text-xl font-bold text-white">Shareable Invite Links</h3>
              <p className="text-xs sm:text-sm text-zinc-400 mt-2 leading-relaxed">
                Team leaders can create one-time shareable links with cryptographic tokens. Direct redemption commits member admission with zero duplicate claims.
              </p>
            </div>

            <div className="p-6 sm:p-8 rounded-2xl bg-[#111114] border border-[#2C2826] hover:border-[#4E4A48] transition-all">
              <div className="w-10 h-10 rounded-xl bg-[#18181C] text-[#FF7A45] border border-[#2C2826] flex items-center justify-center mb-5">
                <Zap className="w-5 h-5" />
              </div>
              <h3 className="font-display text-xl font-bold text-white">Live SSE Outbox Stream</h3>
              <p className="text-xs sm:text-sm text-zinc-400 mt-2 leading-relaxed">
                Real-time updates without manual polling. When a candidate joins or leaves, team boards and rosters update instantly across all active connected browsers.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Why CrewGrid: Technical Pillars & Guarantees */}
      <section className="px-4 py-20 border-t border-[#2C2826] bg-[#0C0C0F]/60">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-xl mx-auto mb-14">
            <span className="text-xs font-mono text-[#FF7A45] uppercase font-bold tracking-wider">
              Architecture
            </span>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-white mt-1.5 tracking-tight">
              Why CrewGrid
            </h2>
            <p className="text-sm text-zinc-400 mt-2">
              Built to withstand extreme high-contention scenarios during major hackathon deadlines.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-[#111114] border border-[#2C2826]">
              <div className="w-10 h-10 rounded-xl bg-[#18181C] text-[#FF7A45] border border-[#2C2826] flex items-center justify-center mb-4">
                <Lock className="w-5 h-5" />
              </div>
              <h3 className="font-display text-base font-bold text-white">50-Way Last Seat Protection</h3>
              <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                When 50 users simultaneously race for 1 open seat, exactly one commits. The remaining 49 receive clean 409 conflict responses with zero corrupted rosters.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[#111114] border border-[#2C2826]">
              <div className="w-10 h-10 rounded-xl bg-[#18181C] text-[#FF7A45] border border-[#2C2826] flex items-center justify-center mb-4">
                <UserCheck className="w-5 h-5" />
              </div>
              <h3 className="font-display text-base font-bold text-white">Atomic Leader Succession</h3>
              <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                If a leader departs while applicants race for seats, leadership transfers atomically to the oldest remaining member. A team never becomes leaderless.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[#111114] border border-[#2C2826]">
              <div className="w-10 h-10 rounded-xl bg-[#18181C] text-[#FF7A45] border border-[#2C2826] flex items-center justify-center mb-4">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="font-display text-base font-bold text-white">Session Isolation</h3>
              <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                Multi-device authentication with strict session token hashing. Logging out on one device cleanly preserves other independent device connections.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Verified CI Callout */}
      <section className="px-4 py-16 border-t border-[#2C2826] max-w-6xl mx-auto w-full">
        <div className="p-8 sm:p-10 rounded-2xl bg-[#111114] border border-[#2C2826] flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="max-w-xl text-center sm:text-left">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#FF7A45]">
              Verified Implementation
            </span>
            <h3 className="font-display text-2xl font-bold text-white mt-1 tracking-tight">
              Comprehensive Automated Verification
            </h3>
            <p className="text-xs sm:text-sm text-zinc-400 mt-2 leading-relaxed">
              Every invariant, transactional concurrency race, and end-to-end browser workflow is rigorously tested in hosted CI against a replica-set cluster with zero test failures.
            </p>
          </div>
          <Link
            to="/engineering"
            className="px-6 py-3 rounded-full bg-white hover:bg-zinc-200 text-black font-semibold text-xs sm:text-sm flex items-center gap-2 transition-all duration-200 active:scale-95 shrink-0 shadow-sm"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Technical Evidence</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Final Recruitment CTA */}
      <section className="px-4 py-20 border-t border-[#2C2826] bg-[#0C0C0F] text-center">
        <div className="max-w-3xl mx-auto">
          <h2 className="font-display text-3xl sm:text-5xl font-bold text-white tracking-tight">
            Ready to assemble your dream squad?
          </h2>
          <p className="text-sm sm:text-base text-zinc-400 mt-4 max-w-lg mx-auto leading-relaxed">
            Join the Hack4Hack Crew Hiring Challenge 2026. Discover open teams or start recruiting complementary builders today.
          </p>
          <div className="mt-8 flex justify-center">
            {isAuthenticated ? (
              <Link
                to="/app"
                className="px-8 py-3.5 rounded-full bg-white hover:bg-zinc-200 text-black font-bold text-sm flex items-center gap-2 transition-all duration-200 active:scale-95 shadow-md shadow-white/10"
              >
                <span>Go to Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <Link
                to="/register"
                className="px-8 py-3.5 rounded-full bg-white hover:bg-zinc-200 text-black font-bold text-sm flex items-center gap-2 transition-all duration-200 active:scale-95 shadow-md shadow-white/10"
              >
                <span>Get Started Now</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Landing Page Footer */}
      <footer className="border-t border-[#2C2826] py-8 px-4 sm:px-6 mt-auto bg-[#08080A]">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-400">
          <div>
            CrewGrid © 2026 · Problem Statement 1 (Race-Proof Team Formation)
          </div>
          <div className="flex items-center gap-6">
            <Link to="/engineering" className="hover:text-white transition-colors underline underline-offset-2">
              Technical Evidence
            </Link>
            <a
              href="https://github.com/Udit-Agarwal20/CrewGrid"
              target="_blank"
              rel="noreferrer"
              className="hover:text-white transition-colors"
            >
              GitHub Repository
            </a>
            <a
              href="https://crewgrid-api.onrender.com/health"
              target="_blank"
              rel="noreferrer"
              className="hover:text-white transition-colors"
            >
              API Health
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
