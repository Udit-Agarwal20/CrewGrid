import { Sparkles, CheckCircle2, Clock } from 'lucide-react';
import { Suggestion } from '@crewgrid/contracts';

interface ScoreBreakdownProps {
  suggestion: Suggestion;
  className?: string;
}

export function ScoreBreakdown({ suggestion, className = '' }: ScoreBreakdownProps) {
  const { score, components, reasons } = suggestion;

  return (
    <div className={`p-4 rounded-xl bg-[#222A42]/60 border border-[#35405A] text-xs ${className}`}>
      {/* Overall Score */}
      <div className="flex items-center justify-between mb-2">
        <span className="font-bold text-[#E9EDF5] flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-[#9BF5CC]" />
          Match Compatibility
        </span>
        <span className="font-mono font-black text-base text-[#9BF5CC]">{score}%</span>
      </div>

      {/* Progress Bars for Complementary Skills & Timezone Fit */}
      <div className="space-y-2 mt-3 pt-3 border-t border-[#35405A]/50">
        <div>
          <div className="flex justify-between text-[11px] text-[#B5C1D4] mb-1 font-mono">
            <span>Complementary Skills (70% weight)</span>
            <span>{components.complementarySkills}%</span>
          </div>
          <div className="w-full h-1.5 bg-[#0B1020] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#9BF5CC] rounded-full"
              style={{ width: `${components.complementarySkills}%` }}
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between text-[11px] text-[#B5C1D4] mb-1 font-mono">
            <span>Timezone Compatibility (30% weight)</span>
            <span>{components.timezoneFit}%</span>
          </div>
          <div className="w-full h-1.5 bg-[#0B1020] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#FBBF24] rounded-full"
              style={{ width: `${components.timezoneFit}%` }}
            />
          </div>
        </div>
      </div>

      {/* Deterministic Explanation Reasons */}
      {reasons && reasons.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[#35405A]/50 space-y-1">
          <span className="block text-[10px] font-mono uppercase tracking-wider text-[#B5C1D4] font-semibold">
            Why this match:
          </span>
          {reasons.map((r, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[11px] text-[#E9EDF5]">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#9BF5CC] shrink-0 mt-0.5" />
              <span>{r}</span>
            </div>
          ))}
        </div>
      )}

      {/* Formula Note */}
      <div className="mt-3 pt-2 text-[10px] font-mono text-[#B5C1D4]/70 border-t border-[#35405A]/40 flex items-center gap-1">
        <Clock className="w-3 h-3" />
        <span>Formula: round(0.7 × skills + 0.3 × timezone)</span>
      </div>
    </div>
  );
}

