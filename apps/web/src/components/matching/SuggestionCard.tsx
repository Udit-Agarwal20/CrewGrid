import { Suggestion } from '@crewgrid/contracts';
import { ScoreBreakdown } from './ScoreBreakdown';

export interface SuggestionCardProps {
  suggestion: Suggestion;
  className?: string;
}

export function SuggestionCard({ suggestion, className = '' }: SuggestionCardProps) {
  return (
    <div
      data-testid="suggestion-card"
      className={`p-5 rounded-2xl bg-[#171E31] border border-[#35405A] space-y-4 hover:border-[#9BF5CC]/30 transition ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-base text-[#E9EDF5]">
            {suggestion.displayName}
          </h3>
          <span
            data-testid="match-score-badge"
            className="text-xs font-mono text-[#9BF5CC]"
          >
            Match Score: {Math.round(suggestion.score)}%
          </span>
        </div>
      </div>

      <ScoreBreakdown suggestion={suggestion} />
    </div>
  );
}
