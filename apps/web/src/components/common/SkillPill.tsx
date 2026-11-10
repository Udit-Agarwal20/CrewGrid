import { X } from 'lucide-react';

interface SkillPillProps {
  skill: string;
  onRemove?: () => void;
  size?: 'sm' | 'md';
}

export function SkillPill({ skill, onRemove, size = 'md' }: SkillPillProps) {
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md bg-[#222A42] text-[#E9EDF5] border border-[#35405A] font-medium font-mono ${sizeClasses}`}
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
          className="text-[#B5C1D4] hover:text-[#F87171] focus:ring-1 focus:ring-[#F87171] rounded p-0.5 transition"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}
