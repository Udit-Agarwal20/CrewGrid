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
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5 rounded-2xl bg-[#111114] border border-[#2C2826] hover:border-[#4E4A48] transition-colors">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="font-mono text-xs font-bold text-white">
            Applicant: {request.applicantId}
          </span>
          <span
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
              isPending
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/25'
                : request.status === 'approved'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25'
                : 'bg-[#F43F5E]/10 text-[#F43F5E] border border-[#F43F5E]/25'
            }`}
          >
            {request.status}
          </span>
        </div>

        {request.message ? (
          <div className="flex items-start gap-2 text-xs text-zinc-300 mt-2 bg-[#08080A] p-3 rounded-xl border border-[#2C2826]">
            <MessageSquare className="w-3.5 h-3.5 text-[#FF7A45] shrink-0 mt-0.5" />
            <p className="italic">"{request.message}"</p>
          </div>
        ) : (
          <p className="text-xs text-zinc-500 italic mt-1">No note attached.</p>
        )}

        <div className="flex items-center gap-2 mt-2 text-[11px] font-mono text-zinc-500">
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
            className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-zinc-200 text-black text-xs font-bold flex items-center gap-1.5 transition-all duration-200 active:scale-95 disabled:opacity-50 shadow-sm"
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
            className="px-3.5 py-1.5 rounded-xl bg-[#18181C] hover:bg-[#241417] text-zinc-400 hover:text-[#F43F5E] border border-[#2C2826] text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
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
