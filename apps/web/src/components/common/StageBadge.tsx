import { TeamStage } from '@crewgrid/contracts';

export function StageBadge({ stage }: { stage: TeamStage }) {
  if (stage === 'ready') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#9BF5CC]/15 text-[#9BF5CC] border border-[#9BF5CC]/30">
        <span className="w-1.5 h-1.5 rounded-full bg-[#9BF5CC]" />
        Ready
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FBBF24]/15 text-[#FBBF24] border border-[#FBBF24]/30">
      <span className="w-1.5 h-1.5 rounded-full bg-[#FBBF24]" />
      Forming
    </span>
  );
}
