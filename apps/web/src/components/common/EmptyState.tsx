import React from 'react';
import { Users } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({
  icon = <Users className="w-7 h-7 text-zinc-400" />,
  title,
  description,
  action
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-2xl bg-[#111114] border border-[#2C2826]">
      <div className="w-14 h-14 rounded-2xl bg-[#18181C] flex items-center justify-center mb-4 border border-[#2C2826]">
        {icon}
      </div>
      <h3 className="font-display text-base sm:text-lg font-bold text-white">{title}</h3>
      <p className="text-sm text-zinc-400 mt-1.5 max-w-sm leading-relaxed">{description}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-6 px-5 py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-black text-xs font-semibold transition-all duration-200 active:scale-95 focus-visible:ring-2 focus-visible:ring-white focus:outline-none shadow-sm"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
