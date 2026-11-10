import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/client';

export function Home() {
  const { data: health, isLoading } = useQuery({
    queryKey: ['health'],
    queryFn: () => apiFetch<{ status: string; timestamp: string }>('/health')
  });

  return (
    <div className="max-w-4xl mx-auto py-16 px-4">
      <div className="bg-[#171E31] border border-[#35405A] rounded-2xl p-8 md:p-12 shadow-2xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#222A42] border border-[#35405A] text-[#9BF5CC] text-xs font-mono uppercase tracking-wider mb-6">
          <span className="w-2 h-2 rounded-full bg-[#9BF5CC] animate-pulse"></span>
          Hack4Hack 2026 PS1 Baseline
        </div>

        <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-[#E9EDF5] mb-4">
          CrewGrid
        </h1>
        <p className="text-lg md:text-xl text-[#B5C1D4] leading-relaxed mb-8 max-w-2xl">
          Race-proof team formation at scale. Built with multi-document MongoDB transactions,
          strict unique invariants, and real-time synchronization designed to survive high-contention last-seat races.
        </p>

        <div className="flex flex-wrap gap-4 items-center mb-10">
          <Link
            to="/register"
            className="px-6 py-3 rounded-lg bg-[#9BF5CC] text-[#0B1020] font-semibold hover:bg-[#86e0b7] transition focus:outline-none focus:ring-2 focus:ring-[#9BF5CC] focus:ring-offset-2 focus:ring-offset-[#0B1020]"
          >
            Create Account
          </Link>
          <Link
            to="/login"
            className="px-6 py-3 rounded-lg bg-[#222A42] border border-[#35405A] text-[#E9EDF5] font-medium hover:bg-[#2c3654] transition focus:outline-none focus:ring-2 focus:ring-[#9BF5CC]"
          >
            Sign In
          </Link>
        </div>

        <div className="border-t border-[#35405A] pt-6 flex items-center justify-between text-xs text-[#B5C1D4] font-mono">
          <span>Backend status:</span>
          <span>
            {isLoading ? (
              <span className="text-yellow-400">Probing /health...</span>
            ) : health?.data?.status === 'ok' ? (
              <span className="text-[#9BF5CC]">● /health online ({health.data.timestamp})</span>
            ) : (
              <span className="text-red-400">Offline</span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

