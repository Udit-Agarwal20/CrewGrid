import { Link } from 'react-router';
import { ArrowRight, Lock, CheckCircle2, UserCheck } from 'lucide-react';
import { TeamResponse } from '@crewgrid/contracts';
import { StageBadge } from '../common/StageBadge';
import { SeatProgress } from '../common/SeatProgress';
import { SkillPill } from '../common/SkillPill';

interface TeamCardProps {
  team: TeamResponse;
  isMyTeam?: boolean;
  hasTeamInHackathon?: boolean;
  hasPendingRequest?: boolean;
  onRequestJoin?: (team: TeamResponse) => void;
}

export function TeamCard({
  team,
  isMyTeam,
  hasTeamInHackathon,
  hasPendingRequest,
  onRequestJoin
}: TeamCardProps) {
  const isFull = team.openSeats === 0;

  return (
    <div className="flex flex-col justify-between p-5 rounded-2xl bg-[#171E31] border border-[#35405A] hover:border-[#9BF5CC]/40 transition shadow-lg group">
      <div>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <Link
            to={`/app/teams/${team.id}`}
            className="text-lg font-bold text-[#E9EDF5] hover:text-[#9BF5CC] transition group-hover:underline"
          >
            {team.name}
          </Link>
          <StageBadge stage={team.stage} />
        </div>

        {/* Description */}
        <p className="text-xs text-[#B5C1D4] line-clamp-2 mb-4 leading-relaxed">
          {team.description || 'No description provided.'}
        </p>

        {/* Seat Progress */}
        <SeatProgress
          memberCount={team.memberCount}
          maxSize={team.maxSize}
          minSize={team.minSize}
          className="mb-4"
        />

        {/* Required Skills */}
        {team.requiredSkills && team.requiredSkills.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-5">
            {team.requiredSkills.slice(0, 4).map((skill) => (
              <SkillPill key={skill} skill={skill} size="sm" />
            ))}
            {team.requiredSkills.length > 4 && (
              <span className="text-[11px] font-mono text-[#B5C1D4] self-center">
                +{team.requiredSkills.length - 4} more
              </span>
            )}
          </div>
        )}
      </div>

      {/* Primary Action Button */}
      <div className="pt-4 border-t border-[#35405A]/60">
        {isMyTeam ? (
          <Link
            to={`/app/teams/${team.id}`}
            className="w-full py-2 px-3 rounded-lg bg-[#9BF5CC]/15 text-[#9BF5CC] hover:bg-[#9BF5CC]/25 border border-[#9BF5CC]/40 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
          >
            <UserCheck className="w-3.5 h-3.5" />
            Open My Team
          </Link>
        ) : hasPendingRequest ? (
          <button
            type="button"
            disabled
            className="w-full py-2 px-3 rounded-lg bg-[#222A42] text-[#B5C1D4] border border-[#35405A] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-not-allowed opacity-80"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-[#9BF5CC]" />
            Request Pending
          </button>
        ) : isFull ? (
          <button
            type="button"
            disabled
            className="w-full py-2 px-3 rounded-lg bg-[#222A42] text-[#B5C1D4] border border-[#35405A] text-xs font-medium flex items-center justify-center gap-1.5 cursor-not-allowed opacity-60"
          >
            <Lock className="w-3.5 h-3.5" />
            Team Full
          </button>
        ) : hasTeamInHackathon ? (
          <button
            type="button"
            disabled
            title="You are already in a team for this hackathon"
            className="w-full py-2 px-3 rounded-lg bg-[#222A42] text-[#B5C1D4] border border-[#35405A] text-xs font-medium flex items-center justify-center gap-1.5 cursor-not-allowed opacity-60"
          >
            Already in a team
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onRequestJoin?.(team)}
            className="w-full py-2 px-3 rounded-lg bg-[#9BF5CC] text-[#0B1020] hover:bg-[#86e0b7] text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-sm"
          >
            Request to Join
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
