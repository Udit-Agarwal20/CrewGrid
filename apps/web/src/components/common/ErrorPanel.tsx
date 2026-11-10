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
      className={`p-4 rounded-xl bg-[#F87171]/10 border border-[#F87171]/30 text-[#E9EDF5] flex items-start gap-3.5 ${className}`}
    >
      <AlertCircle className="w-5 h-5 text-[#F87171] shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-semibold text-[#F87171]">{title}</h4>
        <p className="text-xs text-[#B5C1D4] mt-1 leading-relaxed">{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#222A42] hover:bg-[#35405A] text-xs font-medium text-[#E9EDF5] border border-[#35405A] transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
