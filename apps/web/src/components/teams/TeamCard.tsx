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
    <div className="flex flex-col justify-between p-6 rounded-2xl bg-[#111114] border border-[#2C2826] hover:border-[#4E4A48] hover:-translate-y-1 transition-all duration-300 shadow-lg group">
      <div>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <Link
            to={`/app/teams/${team.id}`}
            className="font-display text-lg font-bold text-white hover:text-[#FF7A45] transition-colors"
          >
            {team.name}
          </Link>
          <StageBadge stage={team.stage} />
        </div>

        {/* Description */}
        <p className="text-xs text-zinc-400 line-clamp-2 mb-4 leading-relaxed">
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
              <span className="text-[11px] font-mono text-zinc-500 self-center">
                +{team.requiredSkills.length - 4} more
              </span>
            )}
          </div>
        )}
      </div>

      {/* Primary Action Button */}
      <div className="pt-4 border-t border-[#2C2826]">
        {isMyTeam ? (
          <Link
            to={`/app/teams/${team.id}`}
            className="w-full py-2.5 px-3 rounded-xl bg-[#FF6B35]/15 text-[#FF7A45] hover:bg-[#FF6B35]/25 border border-[#FF6B35]/30 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
          >
            <UserCheck className="w-3.5 h-3.5" />
            Open My Team
          </Link>
        ) : hasPendingRequest ? (
          <button
            type="button"
            disabled
            className="w-full py-2.5 px-3 rounded-xl bg-[#18181C] text-zinc-400 border border-[#2C2826] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-not-allowed opacity-80"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Request Pending
          </button>
        ) : isFull ? (
          <button
            type="button"
            disabled
            className="w-full py-2.5 px-3 rounded-xl bg-[#18181C] text-zinc-500 border border-[#2C2826] text-xs font-medium flex items-center justify-center gap-1.5 cursor-not-allowed opacity-60"
          >
            <Lock className="w-3.5 h-3.5" />
            Team Full
          </button>
        ) : hasTeamInHackathon ? (
          <button
            type="button"
            disabled
            title="You are already in a team for this hackathon"
            className="w-full py-2.5 px-3 rounded-xl bg-[#18181C] text-zinc-500 border border-[#2C2826] text-xs font-medium flex items-center justify-center gap-1.5 cursor-not-allowed opacity-60"
          >
            Already in a Team
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onRequestJoin?.(team)}
            className="w-full py-2.5 px-3 rounded-xl bg-white hover:bg-zinc-200 text-black text-xs font-bold flex items-center justify-center gap-1.5 transition-all duration-200 active:scale-95 shadow-sm"
          >
            Request to Join
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
