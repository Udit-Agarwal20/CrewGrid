import { useState } from 'react';
import { Link } from 'react-router';
import {
  Users,
  UserPlus,
  Plus,
  ArrowRight,
  Send,
  Sparkles,
  Crown
} from 'lucide-react';
import { AppShell } from '../components/common/AppShell';
import { PageHeader } from '../components/common/PageHeader';
import { SeatProgress } from '../components/common/SeatProgress';
import { StageBadge } from '../components/common/StageBadge';
import { CreateTeamModal } from '../components/teams/CreateTeamModal';
import { useAuth } from '../context/AuthContext';
import { useHackathon } from '../context/HackathonContext';
import { useMyTeam } from '../hooks/useTeams';
import { useMyRequests } from '../hooks/useRequests';
import { isValidObjectId } from '../utils/validation';

export function Dashboard() {
  const { user } = useAuth();
  const { activeHackathon } = useHackathon();
  const hasValidHackathon = isValidObjectId(activeHackathon?.id);
  const validHackathonId = hasValidHackathon ? activeHackathon?.id : undefined;

  const { data: myTeam, isLoading: loadingTeam } = useMyTeam(validHackathonId);
  const { data: myRequests = [] } = useMyRequests();
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const pendingRequests = myRequests.filter((r) => r.status === 'pending');
  const isLeader = Boolean(myTeam && user && myTeam.leaderId === user.id);

  return (
    <AppShell hackathonId={validHackathonId}>
      <PageHeader
        title={`Welcome, ${user?.displayName || 'Builder'}`}
        description="Your team formation command center for Hack4Hack 2026."
        actions={
          hasValidHackathon && !myTeam && (
            <button
              type="button"
              onClick={() => setCreateModalOpen(true)}
              className="px-4 py-2 rounded-full bg-white hover:bg-zinc-200 text-black text-xs font-semibold flex items-center gap-1.5 transition-all duration-200 active:scale-95 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Create Team
            </button>
          )
        }
      />

      {/* Active Team / Unassigned Status Banner */}
      <section className="mb-8">
        {loadingTeam ? (
          <div className="p-6 rounded-2xl bg-[#111114] border border-[#2C2826] animate-pulse h-36" />
        ) : myTeam ? (
          <div className="p-6 sm:p-7 rounded-2xl bg-[#111114] border border-[#2C2826] hover:border-[#4E4A48] shadow-xl relative overflow-hidden transition-all duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 mb-5">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-mono uppercase font-bold text-[#FF7A45]">
                    Active Assignment
                  </span>
                  <StageBadge stage={myTeam.stage} />
                  {isLeader && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      <Crown className="w-3 h-3" />
                      Team Leader
                    </span>
                  )}
                </div>
                <h2 className="font-display text-2xl font-bold text-white tracking-tight">{myTeam.name}</h2>
                <p className="text-xs text-zinc-400 mt-1.5 max-w-lg line-clamp-1">
                  {myTeam.description || 'No description provided.'}
                </p>
              </div>

              <Link
                to={`/app/teams/${myTeam.id}`}
                className="px-5 py-2.5 rounded-full bg-white hover:bg-zinc-200 text-black font-semibold text-xs flex items-center gap-2 transition-all duration-200 active:scale-95 shrink-0 self-start sm:self-center shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Manage Crew
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <SeatProgress
              memberCount={myTeam.memberCount}
              maxSize={myTeam.maxSize}
              minSize={myTeam.minSize}
              className="max-w-md mt-2"
            />
          </div>
        ) : (
          <div className="p-6 sm:p-7 rounded-2xl bg-[#111114] border border-[#2C2826] flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="max-w-lg">
              <span className="inline-block px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/25 text-[11px] font-mono font-semibold mb-3">
                {hasValidHackathon ? `Unassigned in ${activeHackathon?.title}` : 'No active hackathon available'}
              </span>
              <h2 className="font-display text-xl font-bold text-white">You are currently looking for a team</h2>
              <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                Browse open teams with available seats, or create your own squad to start inviting complementary members.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              {hasValidHackathon && (
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(true)}
                  className="px-5 py-2.5 rounded-full bg-white hover:bg-zinc-200 text-black text-xs font-semibold flex items-center gap-1.5 transition-all duration-200 active:scale-95 shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  Create Team
                </button>
              )}
              {hasValidHackathon ? (
                <Link
                  to={`/app/events/${activeHackathon.id}/teams`}
                  className="px-5 py-2.5 rounded-full bg-[#18181C] hover:bg-[#202026] border border-[#2C2826] text-xs font-semibold text-zinc-200 hover:text-white flex items-center gap-1.5 transition-all duration-200"
                >
                  <Users className="w-4 h-4" />
                  Browse Teams
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  className="px-5 py-2.5 rounded-full bg-[#18181C]/50 border border-[#2C2826]/40 text-xs font-semibold text-zinc-600 flex items-center gap-1.5 cursor-not-allowed"
                >
                  <Users className="w-4 h-4" />
                  Browse Teams
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Pending Requests Alert if any */}
      {pendingRequests.length > 0 && (
        <section className="mb-8">
          <div className="p-4 sm:p-5 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <Send className="w-5 h-5 text-amber-400 shrink-0" />
              <div className="text-xs">
                <span className="font-bold text-white">
                  You have {pendingRequests.length} pending join request{pendingRequests.length > 1 ? 's' : ''}.
                </span>
                <p className="text-zinc-400 mt-0.5">
                  Remember: pending requests do not reserve a seat until approved by the leader.
                </p>
              </div>
            </div>
            {hasValidHackathon ? (
              <Link
                to={`/app/events/${activeHackathon.id}/my-requests`}
                className="px-3.5 py-1.5 rounded-full bg-[#18181C] hover:bg-[#202026] border border-[#2C2826] text-xs font-semibold text-white flex items-center gap-1 transition-all duration-200 shrink-0"
              >
                View Requests
                <ArrowRight className="w-3 h-3" />
              </Link>
            ) : null}
          </div>
        </section>
      )}

      {/* Grid of Workspaces */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {hasValidHackathon ? (
          <Link
            to={`/app/events/${activeHackathon.id}/teams`}
            className="p-6 rounded-2xl bg-[#111114] border border-[#2C2826] hover:border-[#4E4A48] hover:-translate-y-1 transition-all duration-300 group shadow-lg flex flex-col justify-between"
          >
            <div>
              <div className="w-10 h-10 rounded-xl bg-[#18181C] text-[#FF7A45] border border-[#2C2826] flex items-center justify-center mb-5">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="font-display text-base font-bold text-white group-hover:text-[#FF7A45] transition-colors">
                Live Team Board
              </h3>
              <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                Explore teams actively recruiting, filter by required skills, and request to join open seats in real time.
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#FF7A45] mt-6">
              <span>Explore Teams</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
        ) : (
          <div
            aria-disabled="true"
            className="p-6 rounded-2xl bg-[#111114]/50 border border-[#2C2826]/40 opacity-50 cursor-not-allowed flex flex-col justify-between select-none"
          >
            <div>
              <div className="w-10 h-10 rounded-xl bg-[#18181C] text-zinc-600 border border-[#2C2826] flex items-center justify-center mb-5">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="font-display text-base font-bold text-zinc-500">
                Live Team Board
              </h3>
              <p className="text-xs text-zinc-600 mt-2 leading-relaxed">
                Explore teams actively recruiting. Select an active hackathon to view available squads.
              </p>
            </div>
            <div className="text-xs font-semibold text-zinc-600 mt-6">
              <span>No Active Event</span>
            </div>
          </div>
        )}

        {hasValidHackathon ? (
          <Link
            to={`/app/events/${activeHackathon.id}/teammates`}
            className="p-6 rounded-2xl bg-[#111114] border border-[#2C2826] hover:border-[#4E4A48] hover:-translate-y-1 transition-all duration-300 group shadow-lg flex flex-col justify-between"
          >
            <div>
              <div className="w-10 h-10 rounded-xl bg-[#18181C] text-[#FF7A45] border border-[#2C2826] flex items-center justify-center mb-5">
                <UserPlus className="w-5 h-5" />
              </div>
              <h3 className="font-display text-base font-bold text-white group-hover:text-[#FF7A45] transition-colors">
                Find Teammates
              </h3>
              <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                Discover unassigned participants who opted in to be matched based on complementary skills and timezone fit.
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#FF7A45] mt-6">
              <span>Discover Builders</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
        ) : (
          <div
            aria-disabled="true"
            className="p-6 rounded-2xl bg-[#111114]/50 border border-[#2C2826]/40 opacity-50 cursor-not-allowed flex flex-col justify-between select-none"
          >
            <div>
              <div className="w-10 h-10 rounded-xl bg-[#18181C] text-zinc-600 border border-[#2C2826] flex items-center justify-center mb-5">
                <UserPlus className="w-5 h-5" />
              </div>
              <h3 className="font-display text-base font-bold text-zinc-500">
                Find Teammates
              </h3>
              <p className="text-xs text-zinc-600 mt-2 leading-relaxed">
                Discover unassigned participants. Select an active hackathon to view builder recommendations.
              </p>
            </div>
            <div className="text-xs font-semibold text-zinc-600 mt-6">
              <span>No Active Event</span>
            </div>
          </div>
        )}

        {hasValidHackathon ? (
          <Link
            to={`/app/events/${activeHackathon.id}/my-requests`}
            className="p-6 rounded-2xl bg-[#111114] border border-[#2C2826] hover:border-[#4E4A48] hover:-translate-y-1 transition-all duration-300 group shadow-lg flex flex-col justify-between"
          >
            <div>
              <div className="w-10 h-10 rounded-xl bg-[#18181C] text-[#FF7A45] border border-[#2C2826] flex items-center justify-center mb-5">
                <Send className="w-5 h-5" />
              </div>
              <h3 className="font-display text-base font-bold text-white group-hover:text-[#FF7A45] transition-colors">
                My Applications
              </h3>
              <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                Review submitted join applications, check pending statuses, and track team admission decisions in real time.
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#FF7A45] mt-6">
              <span>View Applications</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
        ) : (
          <div
            aria-disabled="true"
            className="p-6 rounded-2xl bg-[#111114]/50 border border-[#2C2826]/40 opacity-50 cursor-not-allowed flex flex-col justify-between select-none"
          >
            <div>
              <div className="w-10 h-10 rounded-xl bg-[#18181C] text-zinc-600 border border-[#2C2826] flex items-center justify-center mb-5">
                <Send className="w-5 h-5" />
              </div>
              <h3 className="font-display text-base font-bold text-zinc-500">
                My Applications
              </h3>
              <p className="text-xs text-zinc-600 mt-2 leading-relaxed">
                Review submitted join applications. Select an active hackathon to view your applications.
              </p>
            </div>
            <div className="text-xs font-semibold text-zinc-600 mt-6">
              <span>No Active Event</span>
            </div>
          </div>
        )}
      </section>

      {/* Create Team Modal */}
      {hasValidHackathon && createModalOpen && (
        <CreateTeamModal
          isOpen={createModalOpen}
          hackathonId={activeHackathon.id}
          onClose={() => setCreateModalOpen(false)}
        />
      )}
    </AppShell>
  );
}
