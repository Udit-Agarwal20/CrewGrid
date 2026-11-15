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
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5 rounded-2xl bg-[#111114] border border-[#2C2826] hover:border-[#4E4A48] transition-colors">
      <div className="flex items-start sm:items-center gap-3.5 min-w-0">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
            isLeader
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
              : 'bg-[#18181C] border-[#2C2826] text-zinc-400'
          }`}
        >
          {isLeader ? <Crown className="w-5 h-5" /> : <User className="w-5 h-5" />}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-white truncate">{member.displayName}</span>
            {isMe && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-[#FF6B35]/20 text-[#FF7A45] border border-[#FF6B35]/30 font-bold">
                You
              </span>
            )}
            {isLeader && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                Leader
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-zinc-400 font-mono">
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
            className="px-3 py-1.5 rounded-xl bg-[#18181C] hover:bg-[#202026] text-xs font-semibold text-zinc-200 hover:text-white border border-[#2C2826] flex items-center gap-1.5 transition-colors"
            title="Transfer team leadership to this member"
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-[#FF7A45]" />
            Make Leader
          </button>
          <button
            type="button"
            onClick={() => onRemove?.(member)}
            className="p-2 rounded-xl bg-[#18181C] hover:bg-[#241417] text-zinc-400 hover:text-[#F43F5E] border border-[#2C2826] hover:border-[#52242D] transition-colors"
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
