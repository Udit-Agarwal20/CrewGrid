import React, { useState } from 'react';
import { useParams } from 'react-router';
import { Search, Filter, Plus, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { AppShell } from '../components/common/AppShell';
import { PageHeader } from '../components/common/PageHeader';
import { TeamCard } from '../components/teams/TeamCard';
import { SkeletonCard } from '../components/common/SkeletonCard';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorPanel } from '../components/common/ErrorPanel';
import { CreateTeamModal } from '../components/teams/CreateTeamModal';
import { useTeamBoard, useMyTeam } from '../hooks/useTeams';
import { useMyRequests, useCreateJoinRequest } from '../hooks/useRequests';
import { useToast } from '../context/ToastContext';
import { TeamResponse } from '@crewgrid/contracts';
import { isValidObjectId } from '../utils/validation';

export function TeamDiscovery() {
  const { id: hackathonId } = useParams<{ id: string }>();
  const [search, setSearch] = useState('');
  const [skill, setSkill] = useState('');
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [joinModalTeam, setJoinModalTeam] = useState<TeamResponse | null>(null);
  const [joinMessage, setJoinMessage] = useState('');

  const validHackathonId = isValidObjectId(hackathonId) ? hackathonId : undefined;

  const { data: myTeam } = useMyTeam(validHackathonId);
  const { data: myRequests = [] } = useMyRequests();
  const createJoinRequestMutation = useCreateJoinRequest();
  const { success, error: toastError } = useToast();

  const {
    data: boardData,
    isLoading,
    isError,
    error,
    refetch
  } = useTeamBoard(validHackathonId, {
    search: search.trim() || undefined,
    skill: skill.trim() || undefined,
    onlyOpen,
    cursor,
    limit: 12
  });

  const teams = boardData?.data || [];
  const meta = boardData?.meta;

  const pendingTeamIds = new Set(
    myRequests.filter((r) => r.status === 'pending').map((r) => r.teamId)
  );

  const handleNextPage = () => {
    if (meta?.nextCursor) {
      setCursorHistory((prev) => [...prev, cursor || '']);
      setCursor(meta.nextCursor);
    }
  };

  const handlePrevPage = () => {
    if (cursorHistory.length > 0) {
      const prevCursor = cursorHistory[cursorHistory.length - 1];
      setCursorHistory((prev) => prev.slice(0, -1));
      setCursor(prevCursor === '' ? undefined : prevCursor);
    }
  };

  const handleConfirmJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinModalTeam) return;

    try {
      await createJoinRequestMutation.mutateAsync({
        teamId: joinModalTeam.id,
        message: joinMessage.trim()
      });
      success('Join request sent!', 'The team leader will review your application.');
      setJoinModalTeam(null);
      setJoinMessage('');
    } catch (err: any) {
      toastError('Cannot submit request', err.message);
    }
  };

  if (hackathonId === 'default') {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center min-h-[350px] gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#9BF5CC]" />
          <p className="text-sm font-medium text-[#B5C1D4]">Redirecting to active hackathon...</p>
        </div>
      </AppShell>
    );
  }

  if (!isValidObjectId(hackathonId)) {
    return (
      <AppShell>
        <div className="max-w-xl mx-auto py-12">
          <ErrorPanel
            title="Invalid Event Identifier"
            message="The requested hackathon ID is invalid or malformed. Please select an active event from the navigation menu."
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell hackathonId={hackathonId}>
      <PageHeader
        title="Discover Teams"
        description="Browse squads forming for this event. Apply for open seats in real time."
        actions={
          !myTeam && (
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

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-[#171E31] border border-[#35405A] mb-8 flex flex-col md:flex-row items-stretch md:items-center gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#B5C1D4] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCursor(undefined);
              setCursorHistory([]);
            }}
            placeholder="Search teams by name or description..."
            className="w-full pl-9 pr-3.5 py-2 rounded-lg bg-[#222A42] border border-[#35405A] text-xs text-[#E9EDF5] placeholder-[#B5C1D4]/40 focus:ring-2 focus:ring-[#9BF5CC] focus:outline-none"
          />
        </div>

        {/* Skill Filter */}
        <div className="relative w-full md:w-56">
          <Filter className="w-4 h-4 text-[#B5C1D4] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={skill}
            onChange={(e) => {
              setSkill(e.target.value);
              setCursor(undefined);
              setCursorHistory([]);
            }}
            placeholder="Filter by skill (e.g. React)..."
            className="w-full pl-9 pr-3.5 py-2 rounded-lg bg-[#222A42] border border-[#35405A] text-xs text-[#E9EDF5] placeholder-[#B5C1D4]/40 focus:ring-2 focus:ring-[#9BF5CC] focus:outline-none"
          />
        </div>

        {/* Only Open Teams Toggle */}
        <label className="flex items-center gap-2 text-xs font-semibold text-[#E9EDF5] cursor-pointer px-2 py-1 select-none shrink-0">
          <input
            type="checkbox"
            checked={onlyOpen}
            onChange={(e) => {
              setOnlyOpen(e.target.checked);
              setCursor(undefined);
              setCursorHistory([]);
            }}
            className="w-4 h-4 rounded text-[#9BF5CC] bg-[#222A42] border-[#35405A] focus:ring-[#9BF5CC]"
          />
          <span>Only open seats</span>
        </label>
      </div>

      {/* Team Cards Grid */}
      {isError ? (
        <ErrorPanel
          title="Could not load teams"
          message={(error as Error)?.message || 'Network error fetching team board.'}
          onRetry={() => refetch()}
        />
      ) : isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : teams.length === 0 ? (
        <EmptyState
          title="No teams match your criteria"
          description={
            search || skill || onlyOpen
              ? 'Try clearing your search or skill filter to view more squads.'
              : 'Be the first to form a squad for this event!'
          }
          action={
            !myTeam
              ? {
                  label: 'Create Team',
                  onClick: () => setCreateModalOpen(true)
                }
              : undefined
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {teams.map((team) => (
              <TeamCard
                key={team.id}
                team={team}
                isMyTeam={myTeam?.id === team.id}
                hasTeamInHackathon={!!myTeam}
                hasPendingRequest={pendingTeamIds.has(team.id)}
                onRequestJoin={(t) => setJoinModalTeam(t)}
              />
            ))}
          </div>

          {/* Pagination Controls */}
          <div className="flex items-center justify-between mt-8 pt-4 border-t border-[#35405A]">
            <button
              type="button"
              onClick={handlePrevPage}
              disabled={cursorHistory.length === 0}
              className="px-3.5 py-1.5 rounded-lg bg-[#171E31] border border-[#35405A] text-xs font-semibold text-[#E9EDF5] hover:bg-[#222A42] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>

            <span className="text-xs font-mono text-[#B5C1D4]">
              {meta ? `Showing ${teams.length} teams` : ''}
            </span>

            <button
              type="button"
              onClick={handleNextPage}
              disabled={!meta?.hasMore}
              className="px-3.5 py-1.5 rounded-lg bg-[#171E31] border border-[#35405A] text-xs font-semibold text-[#E9EDF5] hover:bg-[#222A42] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </>
      )}

      {/* Create Team Modal */}
      {createModalOpen && (
        <CreateTeamModal
          isOpen={createModalOpen}
          hackathonId={hackathonId}
          onClose={() => setCreateModalOpen(false)}
        />
      )}

      {/* Join Request Confirmation Dialog */}
      {joinModalTeam && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md bg-[#171E31] border border-[#35405A] rounded-2xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-[#E9EDF5] mb-2">
              Apply to join {joinModalTeam.name}
            </h3>
            <p className="text-xs text-[#B5C1D4] mb-4">
              Send a note to the team leader explaining why you'd be a great fit for their squad.
            </p>

            <form onSubmit={handleConfirmJoin} className="mt-4 space-y-4">
              <div>
                <label htmlFor="join-msg" className="block text-xs font-semibold text-[#E9EDF5] mb-1">
                  Message (Optional)
                </label>
                <textarea
                  id="join-msg"
                  rows={3}
                  value={joinMessage}
                  onChange={(e) => setJoinMessage(e.target.value)}
                  placeholder="Hey, I have strong experience in React and backend services..."
                  maxLength={280}
                  className="w-full px-3 py-2 rounded-lg bg-[#222A42] border border-[#35405A] text-xs text-[#E9EDF5] focus:ring-2 focus:ring-[#9BF5CC] focus:outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setJoinModalTeam(null)}
                  disabled={createJoinRequestMutation.isPending}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-[#B5C1D4] hover:text-[#E9EDF5] hover:bg-[#222A42] border border-[#35405A] transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createJoinRequestMutation.isPending}
                  className="px-4 py-2 rounded-lg bg-[#9BF5CC] text-[#0B1020] text-xs font-bold hover:bg-[#86e0b7] flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  {createJoinRequestMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
