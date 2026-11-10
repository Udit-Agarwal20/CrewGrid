import { useState } from 'react';
import { Check, X, Loader2, MessageSquare, Clock } from 'lucide-react';
import { JoinRequestResponse } from '@crewgrid/contracts';

interface RequestRowProps {
  request: JoinRequestResponse;
  onApprove: (requestId: string) => Promise<void>;
  onDecline: (requestId: string) => Promise<void>;
  isProcessing?: boolean;
}

export function RequestRow({ request, onApprove, onDecline, isProcessing }: RequestRowProps) {
  const [actionLoading, setActionLoading] = useState<'approve' | 'decline' | null>(null);

  const handleApprove = async () => {
    setActionLoading('approve');
    try {
      await onApprove(request.id);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDecline = async () => {
    setActionLoading('decline');
    try {
      await onDecline(request.id);
    } finally {
      setActionLoading(null);
    }
  };

  const isPending = request.status === 'pending';

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-[#171E31] border border-[#35405A]">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono text-xs font-bold text-[#E9EDF5]">
            Applicant: {request.applicantId}
          </span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
              isPending
                ? 'bg-[#FBBF24]/15 text-[#FBBF24] border border-[#FBBF24]/30'
                : request.status === 'approved'
                ? 'bg-[#9BF5CC]/15 text-[#9BF5CC] border border-[#9BF5CC]/30'
                : 'bg-[#F87171]/15 text-[#F87171] border border-[#F87171]/30'
            }`}
          >
            {request.status}
          </span>
        </div>

        {request.message ? (
          <div className="flex items-start gap-1.5 text-xs text-[#B5C1D4] mt-1.5 bg-[#0B1020]/40 p-2.5 rounded-lg border border-[#35405A]/40">
            <MessageSquare className="w-3.5 h-3.5 text-[#9BF5CC] shrink-0 mt-0.5" />
            <p className="italic">"{request.message}"</p>
          </div>
        ) : (
          <p className="text-xs text-[#B5C1D4]/70 italic mt-1">No note attached.</p>
        )}

        <div className="flex items-center gap-2 mt-2 text-[11px] font-mono text-[#B5C1D4]">
          <Clock className="w-3 h-3" />
          <span>Received: {new Date(request.createdAt).toLocaleString()}</span>
        </div>
      </div>

      {isPending && (
        <div className="flex items-center gap-2.5 self-end sm:self-center shrink-0">
          <button
            type="button"
            onClick={handleApprove}
            disabled={isProcessing || !!actionLoading}
            className="px-3 py-1.5 rounded-lg bg-[#9BF5CC] text-[#0B1020] text-xs font-bold hover:bg-[#86e0b7] flex items-center gap-1.5 transition disabled:opacity-50"
          >
            {actionLoading === 'approve' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            Approve
          </button>
          <button
            type="button"
            onClick={handleDecline}
            disabled={isProcessing || !!actionLoading}
            className="px-3 py-1.5 rounded-lg bg-[#222A42] hover:bg-[#F87171]/20 text-[#B5C1D4] hover:text-[#F87171] border border-[#35405A] text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
          >
            {actionLoading === 'decline' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <X className="w-3.5 h-3.5" />
            )}
            Decline
          </button>
        </div>
      )}
    </div>
  );
}

