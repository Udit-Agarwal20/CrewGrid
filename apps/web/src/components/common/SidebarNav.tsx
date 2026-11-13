import { NavLink } from 'react-router';
import {
  LayoutDashboard,
  Users,
  UserPlus,
  Send,
  User,
  LogOut,
  Sparkles,
  ChevronDown
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useHackathon } from '../../context/HackathonContext';
import { useMyTeam } from '../../hooks/useTeams';
import { isValidObjectId } from '../../utils/validation';

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const { hackathons, activeHackathon, selectHackathon } = useHackathon();
  const hasValidHackathon = isValidObjectId(activeHackathon?.id);
  const { data: myTeam } = useMyTeam(hasValidHackathon ? activeHackathon?.id : undefined);

  interface NavItem {
    to: string;
    label: string;
    icon: React.ReactNode;
    end?: boolean;
    badge?: string;
    disabled?: boolean;
  }

  const navLinks: NavItem[] = [
    {
      to: '/app',
      label: 'Dashboard',
      icon: <LayoutDashboard className="w-4 h-4" />,
      end: true
    },
    {
      to: hasValidHackathon ? `/app/events/${activeHackathon.id}/teams` : '#',
      label: 'Discover Teams',
      icon: <Users className="w-4 h-4" />,
      disabled: !hasValidHackathon
    },
    {
      to: hasValidHackathon ? `/app/events/${activeHackathon.id}/teammates` : '#',
      label: 'Find Teammates',
      icon: <UserPlus className="w-4 h-4" />,
      disabled: !hasValidHackathon
    },
    {
      to: hasValidHackathon ? `/app/events/${activeHackathon.id}/my-requests` : '#',
      label: 'My Requests',
      icon: <Send className="w-4 h-4" />,
      disabled: !hasValidHackathon
    },
    ...(myTeam
      ? [
          {
            to: `/app/teams/${myTeam.id}`,
            label: 'My Team',
            icon: <Sparkles className="w-4 h-4 text-[#9BF5CC]" />,
            badge: myTeam.stage
          }
        ]
      : []),
    {
      to: '/app/profile',
      label: 'Profile & Settings',
      icon: <User className="w-4 h-4" />
    }
  ];

  return (
    <aside className="w-64 bg-[#171E31] border-r border-[#35405A] flex flex-col h-full text-[#E9EDF5]">
      {/* Brand Header */}
      <div className="h-16 px-5 border-b border-[#35405A] flex items-center gap-3 shrink-0">
        <span className="w-7 h-7 rounded-lg bg-[#9BF5CC] flex items-center justify-center text-[#0B1020] text-sm font-black shadow-md shadow-[#9BF5CC]/20">
          C
        </span>
        <div className="min-w-0">
          <span className="font-bold text-base tracking-tight text-[#E9EDF5]">CrewGrid</span>
          <span className="block text-[10px] font-mono text-[#9BF5CC] tracking-wider uppercase font-semibold">
            Race-Proof Formation
          </span>
        </div>
      </div>

      {/* Hackathon Selector */}
      <div className="p-4 border-b border-[#35405A] bg-[#0B1020]/40">
        <label htmlFor="hackathon-select" className="block text-[11px] font-mono text-[#B5C1D4] mb-1.5 uppercase font-semibold">
          Active Hackathon
        </label>
        <div className="relative">
          <select
            id="hackathon-select"
            value={activeHackathon?.id || ''}
            onChange={(e) => selectHackathon(e.target.value)}
            disabled={hackathons.length === 0}
            className="w-full pl-3 pr-8 py-2 rounded-lg bg-[#222A42] border border-[#35405A] text-xs font-semibold text-[#E9EDF5] appearance-none focus:ring-2 focus:ring-[#9BF5CC] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {hackathons.length === 0 ? (
              <option value="">No active hackathons</option>
            ) : (
              hackathons.map((h) => (
                <option key={h.id} value={h.id} className="bg-[#171E31] text-[#E9EDF5]">
                  {h.title}
                </option>
              ))
            )}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-[#B5C1D4] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {navLinks.map((item) => {
          if (item.disabled) {
            return (
              <div
                key={item.label}
                aria-disabled="true"
                title="Select a valid hackathon to enable"
                className="flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium text-[#B5C1D4]/40 cursor-not-allowed select-none"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </div>
              </div>
            );
          }

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-[#9BF5CC]/15 text-[#9BF5CC] border border-[#9BF5CC]/30 font-semibold'
                    : 'text-[#B5C1D4] hover:text-[#E9EDF5] hover:bg-[#222A42]/60'
                }`
              }
            >
              <div className="flex items-center gap-3 min-w-0">
                {item.icon}
                <span className="truncate">{item.label}</span>
              </div>
              {item.badge && (
                <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-mono font-bold bg-[#9BF5CC]/20 text-[#9BF5CC]">
                  {item.badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* User Footer */}
      <div className="p-3 border-t border-[#35405A] bg-[#0B1020]/40 shrink-0">
        <div className="flex items-center justify-between p-2 rounded-lg bg-[#222A42]/60 border border-[#35405A]">
          <div className="min-w-0 flex-1 mr-2">
            <p className="text-xs font-bold text-[#E9EDF5] truncate">{user?.displayName || 'User'}</p>
            <p className="text-[11px] font-mono text-[#B5C1D4] truncate">
              {user?.handle ? `@${user.handle}` : 'Onboarding pending'}
            </p>
          </div>
          <button
            type="button"
            onClick={logout}
            aria-label="Sign out"
            title="Sign out"
            className="p-1.5 rounded-md text-[#B5C1D4] hover:text-[#F87171] hover:bg-[#171E31] transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
