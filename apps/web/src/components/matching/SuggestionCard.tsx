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
      className={`p-6 rounded-2xl bg-[#111114] border border-[#2C2826] hover:border-[#4E4A48] space-y-4 transition-all duration-300 shadow-lg ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display font-bold text-base text-white">
            {suggestion.displayName}
          </h3>
          <span
            data-testid="match-score-badge"
            className="inline-block mt-1 text-xs font-mono font-semibold text-[#FF7A45] px-2.5 py-0.5 rounded-full bg-[#FF6B35]/10 border border-[#FF6B35]/25"
          >
            Match Score: {Math.round(suggestion.score)}%
          </span>
        </div>
      </div>

      <ScoreBreakdown suggestion={suggestion} />
    </div>
  );
}
