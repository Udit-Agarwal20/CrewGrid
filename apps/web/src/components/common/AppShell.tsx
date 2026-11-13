import React, { useState } from 'react';
import { Link } from 'react-router';
import { Menu, X } from 'lucide-react';
import { SidebarNav } from './SidebarNav';
import { LiveConnectionStatus } from './LiveConnectionStatus';
import { useHackathon } from '../../context/HackathonContext';
import { useEvents } from '../../hooks/useEvents';
import { isValidObjectId } from '../../utils/validation';

interface AppShellProps {
  children: React.ReactNode;
  hackathonId?: string;
}

export function AppShell({ children, hackathonId }: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { activeHackathon } = useHackathon();
  const effectiveHackathonId = (hackathonId && isValidObjectId(hackathonId))
    ? hackathonId
    : (activeHackathon && isValidObjectId(activeHackathon.id))
      ? activeHackathon.id
      : undefined;
  const { status, lastActivity } = useEvents(effectiveHackathonId);

  return (
    <div className="min-h-screen bg-[#0B1020] text-[#E9EDF5] flex flex-col md:flex-row">
      {/* Accessible Skip Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 z-50 px-4 py-2 bg-[#9BF5CC] text-[#0B1020] font-bold rounded-lg"
      >
        Skip to main content
      </a>

      {/* Desktop Sidebar */}
      <div className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 z-30">
        <SidebarNav />
      </div>

      {/* Mobile Top Header */}
      <div className="md:hidden sticky top-0 z-50 bg-[#171E31]/95 backdrop-blur border-b border-[#35405A] px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="w-6 h-6 rounded-md bg-[#9BF5CC] flex items-center justify-center text-[#0B1020] text-xs font-black">
            C
          </span>
          <span className="font-bold text-base text-[#E9EDF5]">CrewGrid</span>
        </div>

        <div className="flex items-center gap-2">
          <LiveConnectionStatus status={status} lastActivity={lastActivity} />
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            className="p-2 rounded-lg text-[#B5C1D4] hover:text-[#E9EDF5] hover:bg-[#222A42] transition"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Drawer */}
      {mobileMenuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-40 md:hidden bg-black/75 backdrop-blur-xs flex pt-16"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMobileMenuOpen(false);
          }}
        >
          <div className="w-4/5 max-w-xs h-full bg-[#171E31] border-r border-[#35405A] flex flex-col shadow-2xl">
            <SidebarNav onNavigate={() => setMobileMenuOpen(false)} />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 md:pl-64 flex flex-col min-w-0">
        {/* Top Status Bar (Desktop) */}
        <header className="hidden md:flex h-16 px-8 items-center justify-between border-b border-[#35405A] bg-[#0B1020]/60 backdrop-blur sticky top-0 z-20">
          <div className="flex items-center gap-2 text-xs font-mono text-[#B5C1D4]">
            <span>Event:</span>
            <span className="font-semibold text-[#E9EDF5]">{activeHackathon?.title || 'None selected'}</span>
          </div>
          <div className="flex items-center gap-3">
            <LiveConnectionStatus status={status} lastActivity={lastActivity} />
          </div>
        </header>

        {/* Content Body */}
        <main id="main-content" className="flex-1 p-4 sm:p-6 md:p-8 max-w-6xl w-full mx-auto">
          {children}
        </main>

        <footer className="py-6 px-8 border-t border-[#35405A] text-xs text-[#B5C1D4] flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>CrewGrid · Hack4Hack Crew Hiring Challenge 2026 (PS1)</p>
          <div className="flex items-center gap-4 text-[11px]">
            <Link to="/engineering" className="hover:text-[#9BF5CC] transition underline underline-offset-2">
              Technical Evidence
            </Link>
            <a
              href="https://github.com/Udit-Agarwal20/CrewGrid"
              target="_blank"
              rel="noreferrer"
              className="hover:text-[#9BF5CC] transition"
            >
              GitHub
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
