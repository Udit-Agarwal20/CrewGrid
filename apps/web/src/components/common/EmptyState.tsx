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
  icon = <Users className="w-8 h-8 text-[#B5C1D4]" />,
  title,
  description,
  action
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-2xl bg-[#171E31] border border-[#35405A]">
      <div className="w-16 h-16 rounded-2xl bg-[#222A42] flex items-center justify-center mb-4 border border-[#35405A]">
        {icon}
      </div>
      <h3 className="text-base font-bold text-[#E9EDF5]">{title}</h3>
      <p className="text-sm text-[#B5C1D4] mt-1.5 max-w-sm leading-relaxed">{description}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-5 px-4 py-2 rounded-lg bg-[#9BF5CC] text-[#0B1020] text-sm font-semibold hover:bg-[#86e0b7] transition focus:ring-2 focus:ring-[#9BF5CC] focus:outline-none"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

