import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorPanelProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorPanel({
  title = 'Something went wrong',
  message,
  onRetry,
  className = ''
}: ErrorPanelProps) {
  return (
    <div
      role="alert"
      className={`p-4 rounded-xl bg-[#181113] border border-[#4A2027] text-zinc-200 flex items-start gap-3.5 ${className}`}
    >
      <AlertCircle className="w-5 h-5 text-[#F43F5E] shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-semibold text-[#F43F5E]">{title}</h4>
        <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#241417] hover:bg-[#341A20] text-xs font-medium text-rose-300 border border-[#52242D] transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
