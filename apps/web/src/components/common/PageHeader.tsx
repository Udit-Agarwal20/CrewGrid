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
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 mb-8 border-b border-[#2C2826]">
      <div className="min-w-0">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">{title}</h1>
        {desc && <p className="text-sm text-zinc-400 mt-1.5 leading-relaxed">{desc}</p>}
        {children}
      </div>
      {acts && <div className="flex items-center gap-3 shrink-0">{acts}</div>}
    </div>
  );
}
