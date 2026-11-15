import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router';
import {
  Users,
  Search,
  Sparkles,
  Link2,
  ArrowLeft,
  Loader2,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useMyTeam } from '../hooks/useTeams';
import { useTeammates, useTeamSuggestions } from '../hooks/useTeammates';
import { AppShell } from '../components/common/AppShell';
import { PageHeader } from '../components/common/PageHeader';
import { CandidateCard } from '../components/matching/CandidateCard';
import { SuggestionCard } from '../components/matching/SuggestionCard';
import { SkeletonCard } from '../components/common/SkeletonCard';
import { ErrorPanel } from '../components/common/ErrorPanel';
import { InviteModal } from '../components/invites/InviteModal';
import { isValidObjectId } from '../utils/validation';

const COMMON_TIMEZONES = [
  'All Timezones',
  'America/New_York',
  'America/Los_Angeles',
  'America/Chicago',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'UTC'
];

export function TeammateDiscovery() {
  const { id: hackathonId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const validHackathonId = isValidObjectId(hackathonId) ? hackathonId : undefined;
  const { data: myTeam } = useMyTeam(validHackathonId);

  const isLeader = Boolean(myTeam && myTeam.leaderId === user?.id);

  const [activeTab, setActiveTab] = useState<'all' | 'suggestions'>('all');
  const [skillFilter, setSkillFilter] = useState('');
  const [debouncedSkill, setDebouncedSkill] = useState('');
  const [selectedTimezone, setSelectedTimezone] = useState('All Timezones');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [selectedTeamForInvite, setSelectedTeamForInvite] = useState<string | null>(null);

  // Debounce skill search by 250ms to prevent query spamming
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSkill(skillFilter.trim());
      setCursor(undefined);
      setCursorHistory([]);
    }, 250);
    return () => clearTimeout(timer);
  }, [skillFilter]);

  // Reset pagination state when switching hackathons (Finding C)
  useEffect(() => {
    setCursor(undefined);
    setCursorHistory([]);
  }, [validHackathonId]);

  const timezoneParam = selectedTimezone === 'All Timezones' ? undefined : selectedTimezone;

  const {
    data: candidateResult,
    isLoading: loadingCandidates,
    error: candidateError,
    refetch: refetchCandidates
  } = useTeammates(validHackathonId, {
    skill: debouncedSkill || undefined,
    timezone: timezoneParam,
    cursor,
    limit: 12
  });

  const {
    data: suggestions = [],
    isLoading: loadingSuggestions
  } = useTeamSuggestions(isLeader ? myTeam?.id : undefined);

  const candidates = candidateResult?.data || [];
  const meta = candidateResult?.meta;

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
      <div className="space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2 text-xs font-mono text-[#B5C1D4]">
          <Link
            to={`/app/events/${hackathonId}/teams`}
            className="hover:text-[#9BF5CC] flex items-center gap-1 transition focus-visible:ring-2 focus-visible:ring-[#9BF5CC] rounded"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Team Board
          </Link>
          <span>/</span>
          <span className="text-[#E9EDF5] font-bold">Teammate Discovery</span>
        </div>

        <PageHeader
          title="Teammate Discovery"
          subtitle="Discover participants looking for teams who have explicitly opted into discoverability. Find teammates by skill or timezone alignment."
          action={
            isLeader && (
              <div className="flex flex-col items-start sm:items-end gap-1">
                <button
                  type="button"
                  onClick={() => setSelectedTeamForInvite(myTeam?.id || null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-[#0B1020] bg-[#9BF5CC] hover:bg-[#86E4BA] flex items-center gap-2 transition shadow-sm focus-visible:ring-2 focus-visible:ring-[#9BF5CC] focus:outline-none"
                >
                  <Link2 className="w-4 h-4" />
                  Create Team Invite Link
                </button>
                <span className="text-[11px] font-mono text-[#B5C1D4]">
                  Single-use link for {myTeam?.name}
                </span>
              </div>
            )
          }
        />

        {/* Tab Selection if viewer is a team leader */}
        {isLeader && (
          <div className="flex border-b border-[#35405A] gap-4">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition focus-visible:ring-2 focus-visible:ring-[#9BF5CC] focus:outline-none ${
                activeTab === 'all'
                  ? 'border-[#9BF5CC] text-[#9BF5CC]'
                  : 'border-transparent text-[#B5C1D4] hover:text-[#E9EDF5]'
              }`}
            >
              <Users className="w-4 h-4" />
              All Candidates
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('suggestions')}
              className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition focus-visible:ring-2 focus-visible:ring-[#9BF5CC] focus:outline-none ${
                activeTab === 'suggestions'
                  ? 'border-[#9BF5CC] text-[#9BF5CC]'
                  : 'border-transparent text-[#B5C1D4] hover:text-[#E9EDF5]'
              }`}
            >
              <Sparkles className="w-4 h-4 text-[#9BF5CC]" />
              Smart Recommendations ({suggestions.length})
            </button>
          </div>
        )}

        {/* Tab 1: All Candidates */}
        {activeTab === 'all' && (
          <div className="space-y-6">
            {/* Filter Bar */}
            <div className="p-4 rounded-2xl bg-[#171E31] border border-[#35405A] grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-[#B5C1D4] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <label htmlFor="candidate-skill-filter" className="sr-only">
                  Filter by skill
                </label>
                <input
                  id="candidate-skill-filter"
                  type="text"
                  placeholder="Filter by skill (e.g. react, node)..."
                  value={skillFilter}
                  onChange={(e) => setSkillFilter(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2 rounded-xl bg-[#0B1020] border border-[#35405A] text-xs text-[#E9EDF5] placeholder-[#B5C1D4]/50 focus:outline-none focus:border-[#9BF5CC] focus:ring-2 focus:ring-[#9BF5CC] focus-visible:ring-2 focus-visible:ring-[#9BF5CC] transition"
                />
              </div>

              <div>
                <label htmlFor="candidate-timezone-filter" className="sr-only">
                  Filter by timezone
                </label>
                <select
                  id="candidate-timezone-filter"
                  value={selectedTimezone}
                  onChange={(e) => {
                    setSelectedTimezone(e.target.value);
                    setCursor(undefined);
                    setCursorHistory([]);
                  }}
                  className="w-full px-3.5 py-2 rounded-xl bg-[#0B1020] border border-[#35405A] text-xs text-[#E9EDF5] focus:outline-none focus:border-[#9BF5CC] focus:ring-2 focus:ring-[#9BF5CC] focus-visible:ring-2 focus-visible:ring-[#9BF5CC] transition"
                >
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>

              {(skillFilter || selectedTimezone !== 'All Timezones') && (
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => {
                      setSkillFilter('');
                      setDebouncedSkill('');
                      setSelectedTimezone('All Timezones');
                      setCursor(undefined);
                      setCursorHistory([]);
                    }}
                    className="text-xs font-mono text-[#9BF5CC] hover:underline focus-visible:ring-2 focus-visible:ring-[#9BF5CC] rounded p-1"
                  >
                    Clear Filters
                  </button>
                </div>
              )}
            </div>

            {/* Candidate Results States */}
            {candidateError ? (
              <ErrorPanel
                title="Could not load candidates"
                message={(candidateError as Error).message}
                onRetry={() => refetchCandidates()}
              />
            ) : loadingCandidates ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <SkeletonCard className="h-48" />
                <SkeletonCard className="h-48" />
                <SkeletonCard className="h-48" />
              </div>
            ) : candidates.length === 0 ? (
              <div className="p-12 text-center rounded-2xl bg-[#171E31] border border-[#35405A] space-y-3">
                <Users className="w-10 h-10 text-[#B5C1D4]/40 mx-auto" />
                <h3 className="text-sm font-bold text-[#E9EDF5]">No Discoverable Candidates Found</h3>
                <p className="text-xs text-[#B5C1D4] max-w-sm mx-auto">
                  No participants matched your filters, or participants haven't opted into public discoverability yet.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {candidates.map((cand) => (
                    <CandidateCard
                      key={cand.id}
                      user={cand}
                    />
                  ))}
                </div>

                {/* Pagination Controls */}
                <div className="flex items-center justify-between mt-8 pt-4 border-t border-[#35405A]">
                  <button
                    type="button"
                    onClick={handlePrevPage}
                    disabled={cursorHistory.length === 0}
                    aria-label="Previous page of candidates"
                    className="px-3.5 py-1.5 rounded-lg bg-[#171E31] border border-[#35405A] text-xs font-semibold text-[#E9EDF5] hover:bg-[#222A42] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition focus-visible:ring-2 focus-visible:ring-[#9BF5CC]"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </button>

                  <span className="text-xs font-mono text-[#B5C1D4]">
                    Page {cursorHistory.length + 1}
                    {candidates.length > 0 ? ` (Showing ${candidates.length} candidates)` : ''}
                  </span>

                  <button
                    type="button"
                    onClick={handleNextPage}
                    disabled={!meta?.hasMore}
                    aria-label="Next page of candidates"
                    className="px-3.5 py-1.5 rounded-lg bg-[#171E31] border border-[#35405A] text-xs font-semibold text-[#E9EDF5] hover:bg-[#222A42] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition focus-visible:ring-2 focus-visible:ring-[#9BF5CC]"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Tab 2: Smart Recommendations (Leader only) */}
        {activeTab === 'suggestions' && isLeader && (
          <div className="space-y-6">
            <div className="p-4 rounded-xl bg-[#222A42]/60 border border-[#35405A] space-y-2">
              <div className="text-xs text-[#B5C1D4]">
                <strong className="text-[#9BF5CC]">Explainable Matching:</strong> Suggestions are scored via{' '}
                <code className="text-[#E9EDF5] bg-[#0B1020] px-1.5 py-0.5 rounded font-mono">
                  Score = (0.7 * SkillCoverage) + (0.3 * TimezoneOverlap)
                </code>
                . Only discoverable participants who are not yet in a team are suggested.
              </div>
              <p className="text-[11px] text-[#B5C1D4]/80">
                To invite a candidate to your team, generate a team invite link using the "Create Team Invite Link" action above and share it directly with them.
              </p>
            </div>

            {loadingSuggestions ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SkeletonCard className="h-48" />
                <SkeletonCard className="h-48" />
              </div>
            ) : suggestions.length === 0 ? (
              <div className="p-12 text-center rounded-2xl bg-[#171E31] border border-[#35405A] space-y-2">
                <Sparkles className="w-10 h-10 text-[#B5C1D4]/40 mx-auto" />
                <h3 className="text-sm font-bold text-[#E9EDF5]">No Recommendations Right Now</h3>
                <p className="text-xs text-[#B5C1D4] max-w-sm mx-auto">
                  Make sure your team specifies skills needed in team settings. As participants update their profiles, suggestions will appear here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {suggestions.map((suggestion) => (
                  <SuggestionCard
                    key={suggestion.userId}
                    suggestion={suggestion}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Invite Generator Modal */}
        {selectedTeamForInvite && (
          <InviteModal
            isOpen={!!selectedTeamForInvite}
            teamId={selectedTeamForInvite}
            onClose={() => setSelectedTeamForInvite(null)}
          />
        )}
      </div>
    </AppShell>
  );
}
