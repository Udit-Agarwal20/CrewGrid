import { useState } from 'react';
import { Link } from 'react-router';
import { X, Loader2, ArrowRight, Clock, MessageSquare, AlertCircle } from 'lucide-react';
import { JoinRequestResponse } from '@crewgrid/contracts';

interface SentRequestRowProps {
  request: JoinRequestResponse;
  onCancel: (requestId: string) => Promise<void>;
}

export function SentRequestRow({ request, onCancel }: SentRequestRowProps) {
  const [isCanceling, setIsCanceling] = useState(false);

  const handleCancel = async () => {
    setIsCanceling(true);
    try {
      await onCancel(request.id);
    } finally {
      setIsCanceling(false);
    }
  };

  const isPending = request.status === 'pending';

  const statusBadges = {
    pending: 'bg-[#FBBF24]/15 text-[#FBBF24] border-[#FBBF24]/30',
    approved: 'bg-[#9BF5CC]/15 text-[#9BF5CC] border-[#9BF5CC]/30',
    declined: 'bg-[#F87171]/15 text-[#F87171] border-[#F87171]/30',
    canceled: 'bg-[#222A42] text-[#B5C1D4] border-[#35405A]',
    invalidated: 'bg-[#222A42] text-[#B5C1D4] border-[#35405A]'
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-[#171E31] border border-[#35405A]">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5 mb-1.5">
          <Link
            to={`/app/teams/${request.teamId}`}
            className="text-sm font-bold text-[#E9EDF5] hover:text-[#9BF5CC] flex items-center gap-1 transition group"
          >
            <span>Team {request.teamId}</span>
            <ArrowRight className="w-3.5 h-3.5 opacity-60 group-hover:translate-x-0.5 transition" />
          </Link>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase border ${
              statusBadges[request.status] || statusBadges.pending
            }`}
          >
            {request.status}
          </span>
        </div>

        {request.message && (
          <div className="flex items-start gap-1.5 text-xs text-[#B5C1D4] bg-[#0B1020]/40 p-2 rounded-lg border border-[#35405A]/40 mb-2">
            <MessageSquare className="w-3.5 h-3.5 text-[#9BF5CC] shrink-0 mt-0.5" />
            <p className="italic">"{request.message}"</p>
          </div>
        )}

        <div className="flex items-center gap-2 text-[11px] font-mono text-[#B5C1D4]">
          <Clock className="w-3 h-3" />
          <span>Sent: {new Date(request.createdAt).toLocaleString()}</span>
        </div>

        {isPending && (
          <p className="flex items-center gap-1 text-[11px] text-[#B5C1D4]/80 mt-2 font-mono">
            <AlertCircle className="w-3 h-3 text-[#FBBF24]" />
            Note: Pending requests do not reserve a seat until leader approves.
          </p>
        )}
      </div>

      {isPending && (
        <div className="self-end sm:self-center shrink-0">
          <button
            type="button"
            onClick={handleCancel}
            disabled={isCanceling}
            className="px-3 py-1.5 rounded-lg bg-[#222A42] hover:bg-[#F87171]/20 text-xs font-semibold text-[#B5C1D4] hover:text-[#F87171] border border-[#35405A] hover:border-[#F87171]/40 flex items-center gap-1.5 transition disabled:opacity-50"
          >
            {isCanceling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
            Cancel Request
          </button>
        </div>
      )}
    </div>
  );
}

