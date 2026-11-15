import { useState } from 'react';
import { useParams } from 'react-router';
import { Search, Filter, Plus, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { AppShell } from '../components/common/AppShell';
import { PageHeader } from '../components/common/PageHeader';
import { TeamCard } from '../components/teams/TeamCard';
import { SkeletonCard } from '../components/common/SkeletonCard';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorPanel } from '../components/common/ErrorPanel';
import { CreateTeamModal } from '../components/teams/CreateTeamModal';
import { JoinRequestModal } from '../components/requests/JoinRequestModal';
import { useTeamBoard, useMyTeam } from '../hooks/useTeams';
import { useMyRequests } from '../hooks/useRequests';
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

  const validHackathonId = isValidObjectId(hackathonId) ? hackathonId : undefined;

  const { data: myTeam } = useMyTeam(validHackathonId);
  const { data: myRequests = [] } = useMyRequests();

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

  if (hackathonId === 'default') {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center min-h-[350px] gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#FF7A45]" />
          <p className="text-sm font-medium text-zinc-400">Redirecting to active hackathon...</p>
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
              className="px-4 py-2 rounded-full bg-white hover:bg-zinc-200 text-black text-xs font-semibold flex items-center gap-1.5 transition-all duration-200 active:scale-95 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Create Team
            </button>
          )
        }
      />

      {/* Filter and Search Bar */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-[#111114] border border-[#2C2826] mb-8 flex flex-col md:flex-row items-stretch md:items-center gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <label htmlFor="team-search-input" className="sr-only">
            Search teams by name or description
          </label>
          <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id="team-search-input"
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCursor(undefined);
              setCursorHistory([]);
            }}
            placeholder="Search teams by name or description..."
            aria-label="Search teams by name or description"
            className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[#18181C] border border-[#2C2826] hover:border-[#4E4A48] text-xs text-white placeholder-zinc-500 focus:ring-2 focus:ring-white focus:outline-none transition-colors"
          />
        </div>

        {/* Skill Filter */}
        <div className="relative w-full md:w-56">
          <label htmlFor="team-skill-input" className="sr-only">
            Filter teams by skill
          </label>
          <Filter className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id="team-skill-input"
            type="text"
            value={skill}
            onChange={(e) => {
              setSkill(e.target.value);
              setCursor(undefined);
              setCursorHistory([]);
            }}
            placeholder="Filter by skill (e.g. React)..."
            aria-label="Filter teams by skill"
            className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[#18181C] border border-[#2C2826] hover:border-[#4E4A48] text-xs text-white placeholder-zinc-500 focus:ring-2 focus:ring-white focus:outline-none transition-colors"
          />
        </div>

        {/* Only Open Teams Toggle */}
        <label htmlFor="only-open-teams" className="flex items-center gap-2 text-xs font-semibold text-zinc-300 cursor-pointer px-2 py-1 select-none shrink-0">
          <input
            id="only-open-teams"
            type="checkbox"
            checked={onlyOpen}
            onChange={(e) => {
              setOnlyOpen(e.target.checked);
              setCursor(undefined);
              setCursorHistory([]);
            }}
            aria-label="Only show teams with open seats"
            className="w-4 h-4 rounded text-white bg-[#18181C] border-[#2C2826] focus:ring-white accent-white"
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
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-[#2C2826]">
            <button
              type="button"
              onClick={handlePrevPage}
              disabled={cursorHistory.length === 0}
              aria-label="Previous page of teams"
              className="px-4 py-2 rounded-xl bg-[#111114] border border-[#2C2826] hover:border-[#4E4A48] hover:bg-white/5 text-xs font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>

            <span className="text-xs font-mono text-zinc-400">
              {meta ? `Showing ${teams.length} teams` : ''}
            </span>

            <button
              type="button"
              onClick={handleNextPage}
              disabled={!meta?.hasMore}
              aria-label="Next page of teams"
              className="px-4 py-2 rounded-xl bg-[#111114] border border-[#2C2826] hover:border-[#4E4A48] hover:bg-white/5 text-xs font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
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
        <JoinRequestModal
          isOpen={!!joinModalTeam}
          teamId={joinModalTeam.id}
          teamName={joinModalTeam.name}
          onClose={() => setJoinModalTeam(null)}
        />
      )}
    </AppShell>
  );
}
