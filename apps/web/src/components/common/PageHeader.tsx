import React from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  subtitle?: string;
  action?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}

export function PageHeader({ title, description, subtitle, action, actions, children }: PageHeaderProps) {
  const desc = description || subtitle;
  const acts = actions || action;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 mb-6 border-b border-[#35405A]">
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#E9EDF5] tracking-tight">{title}</h1>
        {desc && <p className="text-sm text-[#B5C1D4] mt-1">{desc}</p>}
        {children}
      </div>
      {acts && <div className="flex items-center gap-2.5 shrink-0">{acts}</div>}
    </div>
  );
}
