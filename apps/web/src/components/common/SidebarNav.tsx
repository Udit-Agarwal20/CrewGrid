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
            icon: <Sparkles className="w-4 h-4 text-[#FF7A45]" />,
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
    <aside className="w-64 bg-[#0C0C0F] border-r border-[#2C2826] flex flex-col h-full text-white">
      {/* Brand Header */}
      <div className="h-16 px-5 border-b border-[#2C2826] flex items-center gap-3 shrink-0">
        <span className="w-7 h-7 rounded-xl bg-white text-black flex items-center justify-center font-display font-black text-xs shadow-sm">
          C
        </span>
        <div className="min-w-0">
          <span className="font-display font-bold text-base tracking-tight text-white">CrewGrid</span>
          <span className="block text-[10px] font-mono text-[#FF7A45] tracking-wider uppercase font-semibold">
            Team Formation
          </span>
        </div>
      </div>

      {/* Hackathon Selector */}
      <div className="p-4 border-b border-[#2C2826] bg-[#111114]/50">
        <label htmlFor="hackathon-select" className="block text-[11px] font-mono text-zinc-400 mb-1.5 uppercase font-semibold">
          Active Hackathon
        </label>
        <div className="relative">
          <select
            id="hackathon-select"
            value={activeHackathon?.id || ''}
            onChange={(e) => selectHackathon(e.target.value)}
            disabled={hackathons.length === 0}
            className="w-full pl-3 pr-8 py-2 rounded-xl bg-[#18181C] border border-[#2C2826] hover:border-[#4E4A48] text-xs font-semibold text-white appearance-none focus:ring-2 focus:ring-white focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {hackathons.length === 0 ? (
              <option value="">No active hackathons</option>
            ) : (
              hackathons.map((h) => (
                <option key={h.id} value={h.id} className="bg-[#111114] text-white">
                  {h.title}
                </option>
              ))
            )}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
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
                className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium text-zinc-600 cursor-not-allowed select-none"
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
                `flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-white/10 text-white font-semibold border border-white/15 shadow-xs'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`
              }
            >
              <div className="flex items-center gap-3 min-w-0">
                {item.icon}
                <span className="truncate">{item.label}</span>
              </div>
              {item.badge && (
                <span className="px-2 py-0.5 rounded-full text-[10px] uppercase font-mono font-bold bg-white/15 text-white border border-white/20">
                  {item.badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* User Footer */}
      <div className="p-3 border-t border-[#2C2826] bg-[#111114]/50 shrink-0">
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#18181C] border border-[#2C2826]">
          <div className="min-w-0 flex-1 mr-2">
            <p className="text-xs font-bold text-white truncate">{user?.displayName || 'User'}</p>
            <p className="text-[11px] font-mono text-zinc-400 truncate">
              {user?.handle ? `@${user.handle}` : 'Onboarding pending'}
            </p>
          </div>
          <button
            type="button"
            onClick={logout}
            aria-label="Sign out"
            title="Sign out"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-[#F43F5E] hover:bg-white/5 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
