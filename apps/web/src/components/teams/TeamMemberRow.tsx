import { Crown, User, UserMinus, ArrowRightLeft } from 'lucide-react';
import { TeamMember } from '@crewgrid/contracts';
import { SkillPill } from '../common/SkillPill';

interface TeamMemberRowProps {
  member: TeamMember;
  isLeaderViewer: boolean;
  currentUserId?: string;
  onRemove?: (member: TeamMember) => void;
  onTransferLeader?: (member: TeamMember) => void;
}

export function TeamMemberRow({
  member,
  isLeaderViewer,
  currentUserId,
  onRemove,
  onTransferLeader
}: TeamMemberRowProps) {
  const isLeader = member.role === 'leader';
  const isMe = currentUserId === member.userId;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-[#171E31] border border-[#35405A]">
      <div className="flex items-start sm:items-center gap-3.5 min-w-0">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
            isLeader
              ? 'bg-[#FBBF24]/15 border-[#FBBF24]/30 text-[#FBBF24]'
              : 'bg-[#222A42] border-[#35405A] text-[#B5C1D4]'
          }`}
        >
          {isLeader ? <Crown className="w-5 h-5" /> : <User className="w-5 h-5" />}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-[#E9EDF5] truncate">{member.displayName}</span>
            {isMe && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#9BF5CC]/20 text-[#9BF5CC] font-bold">
                You
              </span>
            )}
            {isLeader && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#FBBF24]/15 text-[#FBBF24] border border-[#FBBF24]/30">
                Leader
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-[#B5C1D4]">
            {member.handle && <span>@{member.handle}</span>}
            {member.timezone && <span>TZ: {member.timezone}</span>}
            <span>Joined: {new Date(member.joinedAt).toLocaleDateString()}</span>
          </div>

          {member.skills && member.skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {member.skills.slice(0, 4).map((s) => (
                <SkillPill key={s} skill={s} size="sm" />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Leader Actions */}
      {isLeaderViewer && !isLeader && (
        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          <button
            type="button"
            onClick={() => onTransferLeader?.(member)}
            className="px-2.5 py-1.5 rounded-lg bg-[#222A42] hover:bg-[#35405A] text-xs font-semibold text-[#E9EDF5] border border-[#35405A] flex items-center gap-1.5 transition"
            title="Transfer team leadership to this member"
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-[#9BF5CC]" />
            Make Leader
          </button>
          <button
            type="button"
            onClick={() => onRemove?.(member)}
            className="p-1.5 rounded-lg bg-[#222A42] hover:bg-[#F87171]/20 text-[#B5C1D4] hover:text-[#F87171] border border-[#35405A] hover:border-[#F87171]/40 transition"
            title="Remove member from team"
            aria-label={`Remove ${member.displayName}`}
          >
            <UserMinus className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
