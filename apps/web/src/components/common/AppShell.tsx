import React, { useState, useRef, useEffect } from 'react';
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
  const drawerRef = useRef<HTMLDivElement>(null);
  const toggleBtnRef = useRef<HTMLButtonElement>(null);

  const { activeHackathon } = useHackathon();
  const effectiveHackathonId = (hackathonId && isValidObjectId(hackathonId))
    ? hackathonId
    : (activeHackathon && isValidObjectId(activeHackathon.id))
      ? activeHackathon.id
      : undefined;
  const { status, lastActivity } = useEvents(effectiveHackathonId);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const drawerEl = drawerRef.current;
    if (drawerEl) {
      const focusable = drawerEl.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length > 0) {
        focusable[0].focus();
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setMobileMenuOpen(false);
        toggleBtnRef.current?.focus();
        return;
      }

      if (e.key === 'Tab') {
        if (!drawerRef.current) return;
        const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileMenuOpen]);

  return (
    <div className="min-h-screen bg-[#08080A] text-[#F4F4F5] flex flex-col md:flex-row selection:bg-[#FF6B35] selection:text-[#08080A]">
      {/* Accessible Skip Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 z-50 px-4 py-2 bg-white text-black font-bold rounded-xl shadow-lg"
      >
        Skip to main content
      </a>

      {/* Desktop Sidebar */}
      <div className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 z-30">
        <SidebarNav />
      </div>

      {/* Mobile Top Header */}
      <div className="md:hidden sticky top-0 z-50 bg-[#08080A]/90 backdrop-blur-md border-b border-[#2C2826] px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-xl bg-white text-black font-display font-black flex items-center justify-center text-xs">
            C
          </span>
          <span className="font-display font-bold text-base text-white tracking-tight">CrewGrid</span>
        </div>

        <div className="flex items-center gap-2.5">
          <LiveConnectionStatus status={status} lastActivity={lastActivity} />
          <button
            ref={toggleBtnRef}
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10 transition-colors"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Drawer */}
      {mobileMenuOpen && (
        <div
          ref={drawerRef}
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation menu"
          className="fixed inset-0 z-40 md:hidden bg-black/80 backdrop-blur-sm flex pt-16"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setMobileMenuOpen(false);
              toggleBtnRef.current?.focus();
            }
          }}
        >
          <div className="w-4/5 max-w-xs h-full bg-[#0C0C0F] border-r border-[#2C2826] flex flex-col shadow-2xl">
            <SidebarNav
              onNavigate={() => {
                setMobileMenuOpen(false);
                toggleBtnRef.current?.focus();
              }}
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 md:pl-64 flex flex-col min-w-0">
        {/* Top Status Bar (Desktop) */}
        <header className="hidden md:flex h-16 px-8 items-center justify-between border-b border-[#2C2826] bg-[#08080A]/70 backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-center gap-2.5 text-xs font-mono text-zinc-400">
            <span className="uppercase text-[11px] font-semibold text-zinc-400">Event:</span>
            <span className="font-semibold text-white px-2.5 py-0.5 rounded-full bg-[#18181C] border border-[#2C2826]">
              {activeHackathon?.title || 'None selected'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <LiveConnectionStatus status={status} lastActivity={lastActivity} />
          </div>
        </header>

        {/* Content Body */}
        <main id="main-content" className="flex-1 p-4 sm:p-6 md:p-8 max-w-6xl w-full mx-auto">
          {children}
        </main>

        <footer className="py-6 px-8 border-t border-[#2C2826] text-xs text-zinc-400 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>CrewGrid · Hack4Hack Crew Hiring Challenge 2026 (Problem Statement 1)</p>
          <div className="flex items-center gap-4 text-xs">
            <Link to="/engineering" className="hover:text-white transition-colors underline underline-offset-2">
              Technical Evidence
            </Link>
            <a
              href="https://github.com/Udit-Agarwal20/CrewGrid"
              target="_blank"
              rel="noreferrer"
              className="hover:text-white transition-colors"
            >
              GitHub
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
