import { Link } from 'react-router';
import { ShieldCheck, Zap, Users, ArrowRight, Lock, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function Home() {
  const { isAuthenticated, user } = useAuth();

  return (
    <div className="flex flex-col min-h-screen bg-[#0B1020] text-[#E9EDF5]">
      {/* Hero Section */}
      <section className="relative px-4 pt-20 pb-16 md:pt-32 md:pb-24 max-w-5xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#9BF5CC]/10 border border-[#9BF5CC]/30 text-xs font-mono text-[#9BF5CC] mb-6">
          <ShieldCheck className="w-4 h-4" />
          <span>Hack4Hack Crew Hiring Challenge 2026 · Problem Statement 1</span>
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl font-black text-[#E9EDF5] tracking-tight leading-tight">
          Race-Proof Team Formation <br />
          <span className="text-[#9BF5CC]">Built to Survive the Last-Seat Race</span>
        </h1>

        <p className="mt-6 text-base sm:text-lg text-[#B5C1D4] max-w-2xl mx-auto leading-relaxed">
          High-contention hackathons cause broken team rosters and orphaned members when 50 applicants compete for the final seat. CrewGrid enforces strict MongoDB replica-set transactions, deterministic idempotency, and real-time SSE updates.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          {isAuthenticated ? (
            <Link
              to="/app"
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#9BF5CC] text-[#0B1020] font-bold text-sm hover:bg-[#86e0b7] flex items-center justify-center gap-2 transition shadow-lg shadow-[#9BF5CC]/20"
            >
              Go to Dashboard ({user?.displayName})
              <ArrowRight className="w-4 h-4" />
            </Link>
          ) : (
            <>
              <Link
                to="/register"
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#9BF5CC] text-[#0B1020] font-bold text-sm hover:bg-[#86e0b7] flex items-center justify-center gap-2 transition shadow-lg shadow-[#9BF5CC]/20"
              >
                Create Account
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/login"
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#171E31] hover:bg-[#222A42] border border-[#35405A] text-[#E9EDF5] font-semibold text-sm transition"
              >
                Sign In
              </Link>
            </>
          )}
        </div>
      </section>

      {/* Core Architectural Pillars */}
      <section className="px-4 py-16 border-t border-[#35405A] bg-[#171E31]/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center max-w-xl mx-auto mb-12">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#E9EDF5]">
              Guaranteed Invariants Under Concurrency
            </h2>
            <p className="text-sm text-[#B5C1D4] mt-2">
              Every team admission executes inside an isolated MongoDB replica-set transaction.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-[#171E31] border border-[#35405A]">
              <div className="w-10 h-10 rounded-xl bg-[#9BF5CC]/15 text-[#9BF5CC] flex items-center justify-center mb-4">
                <Lock className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-[#E9EDF5]">50-Way Last Seat Protection</h3>
              <p className="text-xs text-[#B5C1D4] mt-2 leading-relaxed">
                When 50 users concurrently redeem invites or request approvals for 1 seat, exactly one commits. The remaining 49 receive clean 409 conflict errors with zero partial writes.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[#171E31] border border-[#35405A]">
              <div className="w-10 h-10 rounded-xl bg-[#9BF5CC]/15 text-[#9BF5CC] flex items-center justify-center mb-4">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-[#E9EDF5]">Atomic Leader Succession</h3>
              <p className="text-xs text-[#B5C1D4] mt-2 leading-relaxed">
                If a leader leaves while incoming applicants race for seats, leadership transfers atomically to the oldest remaining member. A team never becomes leaderless.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[#171E31] border border-[#35405A]">
              <div className="w-10 h-10 rounded-xl bg-[#9BF5CC]/15 text-[#9BF5CC] flex items-center justify-center mb-4">
                <Zap className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-[#E9EDF5]">Transactional SSE Outbox</h3>
              <p className="text-xs text-[#B5C1D4] mt-2 leading-relaxed">
                Outbox events commit inside the same database transaction. The SSE poller streams events to clients with reconnect recovery and query invalidation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Verified Test Highlights */}
      <section className="px-4 py-16 border-t border-[#35405A] max-w-5xl mx-auto w-full">
        <div className="p-8 rounded-2xl bg-[#171E31] border border-[#35405A] text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#9BF5CC]">
              Automated CI Verification
            </span>
            <h3 className="text-xl font-bold text-[#E9EDF5] mt-1">
              104 Integration Tests + 16 E2E Flows Passing (0 Violations)
            </h3>
            <p className="text-xs text-[#B5C1D4] mt-1.5 max-w-lg">
              Verified against MongoDB 8.0 replica set with Vitest, Supertest, and Playwright across all race scenarios.
            </p>
          </div>
          <Link
            to="/engineering"
            className="px-5 py-2.5 rounded-xl bg-[#222A42] hover:bg-[#35405A] border border-[#35405A] text-xs font-semibold text-[#E9EDF5] flex items-center gap-2 transition shrink-0"
          >
            <CheckCircle2 className="w-4 h-4 text-[#9BF5CC]" />
            Technical Evidence
          </Link>
        </div>
      </section>

      {/* Landing Page Footer with Discreet Technical Evidence Link */}
      <footer className="border-t border-[#35405A] py-8 px-4 mt-auto">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#B5C1D4]">
          <div>
            CrewGrid © 2026 · Problem Statement 1 (Race-Proof Team Formation)
          </div>
          <div className="flex items-center gap-6">
            <Link to="/engineering" className="hover:text-[#9BF5CC] transition underline underline-offset-2">
              Technical Evidence
            </Link>
            <a
              href="https://github.com/Udit-Agarwal20/CrewGrid"
              target="_blank"
              rel="noreferrer"
              className="hover:text-[#9BF5CC] transition"
            >
              GitHub Repository
            </a>
            <a
              href="https://crewgrid-api.onrender.com/health"
              target="_blank"
              rel="noreferrer"
              className="hover:text-[#9BF5CC] transition"
            >
              API Health
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
