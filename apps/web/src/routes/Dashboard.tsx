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
              className="px-4 py-2 rounded-xl bg-[#9BF5CC] text-[#0B1020] text-xs font-bold hover:bg-[#86e0b7] flex items-center gap-1.5 transition shadow-sm"
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
          <div className="p-6 rounded-2xl bg-[#171E31] border border-[#35405A] animate-pulse h-36" />
        ) : myTeam ? (
          <div className="p-6 rounded-2xl bg-[#171E31] border border-[#9BF5CC]/40 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#9BF5CC]/5 rounded-full blur-3xl pointer-events-none" />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-mono uppercase font-bold text-[#9BF5CC]">
                    Active Assignment
                  </span>
                  <StageBadge stage={myTeam.stage} />
                  {isLeader && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#FBBF24]/15 text-[#FBBF24] border border-[#FBBF24]/30">
                      <Crown className="w-3 h-3" />
                      Team Leader
                    </span>
                  )}
                </div>
                <h2 className="text-2xl font-bold text-[#E9EDF5]">{myTeam.name}</h2>
                <p className="text-xs text-[#B5C1D4] mt-1 max-w-lg line-clamp-1">
                  {myTeam.description || 'No description provided.'}
                </p>
              </div>

              <Link
                to={`/app/teams/${myTeam.id}`}
                className="px-5 py-2.5 rounded-xl bg-[#9BF5CC] text-[#0B1020] font-bold text-xs hover:bg-[#86e0b7] flex items-center gap-2 transition shrink-0 self-start sm:self-center shadow-md shadow-[#9BF5CC]/15"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Manage Crew
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
          <div className="p-6 rounded-2xl bg-[#171E31] border border-[#35405A] flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="max-w-lg">
              <span className="inline-block px-2.5 py-0.5 rounded-full bg-[#FBBF24]/15 text-[#FBBF24] text-[11px] font-mono font-semibold mb-2">
                {hasValidHackathon ? `Unassigned in ${activeHackathon?.title}` : 'No active hackathon available'}
              </span>
              <h2 className="text-xl font-bold text-[#E9EDF5]">You are currently looking for a team</h2>
              <p className="text-xs text-[#B5C1D4] mt-1.5 leading-relaxed">
                Browse open teams with available seats, or create your own squad to start inviting complementary members.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {hasValidHackathon && (
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(true)}
                  className="px-4 py-2.5 rounded-xl bg-[#9BF5CC] text-[#0B1020] text-xs font-bold hover:bg-[#86e0b7] flex items-center gap-1.5 transition"
                >
                  <Plus className="w-4 h-4" />
                  Create Team
                </button>
              )}
              {hasValidHackathon ? (
                <Link
                  to={`/app/events/${activeHackathon.id}/teams`}
                  className="px-4 py-2.5 rounded-xl bg-[#222A42] hover:bg-[#35405A] border border-[#35405A] text-xs font-semibold text-[#E9EDF5] flex items-center gap-1.5 transition"
                >
                  <Users className="w-4 h-4" />
                  Browse Teams
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  className="px-4 py-2.5 rounded-xl bg-[#222A42]/50 border border-[#35405A]/40 text-xs font-semibold text-[#B5C1D4]/40 flex items-center gap-1.5 cursor-not-allowed"
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
          <div className="p-4 rounded-xl bg-[#FBBF24]/10 border border-[#FBBF24]/30 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Send className="w-5 h-5 text-[#FBBF24] shrink-0" />
              <div className="text-xs">
                <span className="font-bold text-[#E9EDF5]">
                  You have {pendingRequests.length} pending join request{pendingRequests.length > 1 ? 's' : ''}.
                </span>
                <p className="text-[#B5C1D4] mt-0.5">
                  Remember: pending requests do not reserve a seat until approved by the leader.
                </p>
              </div>
            </div>
            {hasValidHackathon ? (
              <Link
                to={`/app/events/${activeHackathon.id}/my-requests`}
                className="px-3 py-1.5 rounded-lg bg-[#222A42] hover:bg-[#35405A] border border-[#35405A] text-xs font-semibold text-[#E9EDF5] flex items-center gap-1 transition shrink-0"
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
            className="p-6 rounded-2xl bg-[#171E31] border border-[#35405A] hover:border-[#9BF5CC]/40 transition group shadow-lg flex flex-col justify-between"
          >
            <div>
              <div className="w-10 h-10 rounded-xl bg-[#9BF5CC]/15 text-[#9BF5CC] flex items-center justify-center mb-4">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-[#E9EDF5] group-hover:text-[#9BF5CC] transition">
                Live Team Board
              </h3>
              <p className="text-xs text-[#B5C1D4] mt-2 leading-relaxed">
                Explore teams actively recruiting, filter by required skills, and request to join open seats in real time.
              </p>
            </div>
            <div className="flex items-center gap-1 text-xs font-semibold text-[#9BF5CC] mt-6">
              <span>Explore Teams</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition" />
            </div>
          </Link>
        ) : (
          <div
            aria-disabled="true"
            className="p-6 rounded-2xl bg-[#171E31]/50 border border-[#35405A]/40 opacity-50 cursor-not-allowed flex flex-col justify-between select-none"
          >
            <div>
              <div className="w-10 h-10 rounded-xl bg-[#9BF5CC]/10 text-[#9BF5CC]/40 flex items-center justify-center mb-4">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-[#E9EDF5]/50">
                Live Team Board
              </h3>
              <p className="text-xs text-[#B5C1D4]/40 mt-2 leading-relaxed">
                Explore teams actively recruiting. Select an active hackathon to view available squads.
              </p>
            </div>
            <div className="text-xs font-semibold text-[#B5C1D4]/40 mt-6">
              <span>No Active Event</span>
            </div>
          </div>
        )}

        {hasValidHackathon ? (
          <Link
            to={`/app/events/${activeHackathon.id}/teammates`}
            className="p-6 rounded-2xl bg-[#171E31] border border-[#35405A] hover:border-[#9BF5CC]/40 transition group shadow-lg flex flex-col justify-between"
          >
            <div>
              <div className="w-10 h-10 rounded-xl bg-[#9BF5CC]/15 text-[#9BF5CC] flex items-center justify-center mb-4">
                <UserPlus className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-[#E9EDF5] group-hover:text-[#9BF5CC] transition">
                Find Teammates
              </h3>
              <p className="text-xs text-[#B5C1D4] mt-2 leading-relaxed">
                Discover unassigned participants who opted in to be matched based on complementary skills and timezone fit.
              </p>
            </div>
            <div className="flex items-center gap-1 text-xs font-semibold text-[#9BF5CC] mt-6">
              <span>Discover Builders</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition" />
            </div>
          </Link>
        ) : (
          <div
            aria-disabled="true"
            className="p-6 rounded-2xl bg-[#171E31]/50 border border-[#35405A]/40 opacity-50 cursor-not-allowed flex flex-col justify-between select-none"
          >
            <div>
              <div className="w-10 h-10 rounded-xl bg-[#9BF5CC]/10 text-[#9BF5CC]/40 flex items-center justify-center mb-4">
                <UserPlus className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-[#E9EDF5]/50">
                Find Teammates
              </h3>
              <p className="text-xs text-[#B5C1D4]/40 mt-2 leading-relaxed">
                Discover unassigned participants. Select an active hackathon to view builder recommendations.
              </p>
            </div>
            <div className="text-xs font-semibold text-[#B5C1D4]/40 mt-6">
              <span>No Active Event</span>
            </div>
          </div>
        )}

        <Link
          to="/engineering"
          className="p-6 rounded-2xl bg-[#171E31] border border-[#35405A] hover:border-[#9BF5CC]/40 transition group shadow-lg flex flex-col justify-between"
        >
          <div>
            <div className="w-10 h-10 rounded-xl bg-[#9BF5CC]/15 text-[#9BF5CC] flex items-center justify-center mb-4">
              <Sparkles className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-[#E9EDF5] group-hover:text-[#9BF5CC] transition">
              System Architecture
            </h3>
            <p className="text-xs text-[#B5C1D4] mt-2 leading-relaxed">
              Review live transaction benchmarks, 50-way concurrency race guarantees, and MongoDB invariant proofs.
            </p>
          </div>
          <div className="flex items-center gap-1 text-xs font-semibold text-[#9BF5CC] mt-6">
            <span>Inspect Evidence</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition" />
          </div>
        </Link>
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
