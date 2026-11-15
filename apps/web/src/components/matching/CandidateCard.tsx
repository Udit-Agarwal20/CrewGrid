import { User, Clock } from 'lucide-react';
import { PublicUser } from '@crewgrid/contracts';
import { SkillPill } from '../common/SkillPill';

interface CandidateCardProps {
  user: PublicUser;
}

export function CandidateCard({ user }: CandidateCardProps) {
  return (
    <div className="flex flex-col justify-between p-6 rounded-2xl bg-[#111114] border border-[#2C2826] hover:border-[#4E4A48] hover:-translate-y-1 transition-all duration-300 shadow-lg">
      <div>
        <div className="flex items-start gap-3.5 mb-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#18181C] border border-[#2C2826] text-[#FF7A45] flex items-center justify-center shrink-0">
            <User className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-display text-base font-bold text-white truncate">{user.displayName}</h3>
            {user.handle && (
              <span className="font-mono text-xs text-[#FF7A45] block">@{user.handle}</span>
            )}
          </div>
        </div>

        {user.bio ? (
          <p className="text-xs text-zinc-400 line-clamp-3 mb-4 leading-relaxed">{user.bio}</p>
        ) : (
          <p className="text-xs text-zinc-500 italic mb-4">No bio provided.</p>
        )}

        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400 mb-4 font-mono">
          {user.timezone && (
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#FF7A45]" />
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
          <div className="flex flex-wrap gap-1.5">
            {user.skills.map((skill) => (
              <SkillPill key={skill} skill={skill} size="sm" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
