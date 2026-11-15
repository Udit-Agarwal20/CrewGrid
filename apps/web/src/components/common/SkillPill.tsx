import { X } from 'lucide-react';

interface SkillPillProps {
  skill: string;
  onRemove?: () => void;
  size?: 'sm' | 'md';
}

export function SkillPill({ skill, onRemove, size = 'md' }: SkillPillProps) {
  const sizeClasses = size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-[#18181C] text-zinc-200 border border-[#2C2826] hover:border-[#4E4A48] font-mono font-medium transition-colors ${sizeClasses}`}
    >
      <span>{skill}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove skill ${skill}`}
          className="text-zinc-400 hover:text-[#F43F5E] focus-visible:ring-1 focus-visible:ring-[#F43F5E] rounded-full p-0.5 transition"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}
