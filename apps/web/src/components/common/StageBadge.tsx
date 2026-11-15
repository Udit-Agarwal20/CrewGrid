import { TeamStage } from '@crewgrid/contracts';

export function StageBadge({ stage }: { stage: TeamStage }) {
  if (stage === 'ready') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        Ready
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/25">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
      Forming
    </span>
  );
}
