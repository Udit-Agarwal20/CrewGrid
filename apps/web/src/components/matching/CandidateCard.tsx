import { User, Clock, Link2 } from 'lucide-react';
import { PublicUser } from '@crewgrid/contracts';
import { SkillPill } from '../common/SkillPill';

interface CandidateCardProps {
  user: PublicUser;
  canInvite?: boolean;
  onInvite?: (user: PublicUser) => void;
}

export function CandidateCard({ user, canInvite, onInvite }: CandidateCardProps) {
  return (
    <div className="flex flex-col justify-between p-5 rounded-2xl bg-[#171E31] border border-[#35405A] hover:border-[#9BF5CC]/30 transition shadow-lg">
      <div>
        <div className="flex items-start gap-3.5 mb-3">
          <div className="w-10 h-10 rounded-xl bg-[#222A42] border border-[#35405A] text-[#9BF5CC] flex items-center justify-center shrink-0">
            <User className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-[#E9EDF5] truncate">{user.displayName}</h3>
            {user.handle && (
              <span className="font-mono text-xs text-[#9BF5CC] block">@{user.handle}</span>
            )}
          </div>
        </div>

        {user.bio ? (
          <p className="text-xs text-[#B5C1D4] line-clamp-3 mb-4 leading-relaxed">{user.bio}</p>
        ) : (
          <p className="text-xs text-[#B5C1D4]/60 italic mb-4">No bio provided.</p>
        )}

        <div className="flex flex-wrap items-center gap-3 text-xs text-[#B5C1D4] mb-4 font-mono">
          {user.timezone && (
            <div className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-[#9BF5CC]" />
              <span>{user.timezone}</span>
            </div>
          )}
          {user.preferredHours && (
            <span>
              Hours: {user.preferredHours.startLocal}–{user.preferredHours.endLocal}
            </span>
          )}
        </div>

        {user.skills && user.skills.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {user.skills.map((skill) => (
              <SkillPill key={skill} skill={skill} size="sm" />
            ))}
          </div>
        )}
      </div>

      {canInvite && (
        <div className="pt-3 border-t border-[#35405A]/50">
          <button
            type="button"
            onClick={() => onInvite?.(user)}
            className="w-full py-2 px-3 rounded-lg bg-[#222A42] hover:bg-[#9BF5CC]/15 text-[#E9EDF5] hover:text-[#9BF5CC] border border-[#35405A] hover:border-[#9BF5CC]/40 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
          >
            <Link2 className="w-3.5 h-3.5 text-[#9BF5CC]" />
            Generate Invite for Candidate
          </button>
        </div>
      )}
    </div>
  );
}
