import { useState } from 'react';
import { Link } from 'react-router';
import { X, Loader2, ArrowRight, Clock, MessageSquare } from 'lucide-react';
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
    pending: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
    approved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
    declined: 'bg-[#F43F5E]/10 text-[#F43F5E] border-[#F43F5E]/25',
    canceled: 'bg-zinc-800 text-zinc-400 border-zinc-700',
    invalidated: 'bg-zinc-800 text-zinc-400 border-zinc-700'
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5 rounded-2xl bg-[#111114] border border-[#2C2826] hover:border-[#4E4A48] transition-colors">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5 mb-1.5">
          <Link
            to={`/app/teams/${request.teamId}`}
            className="text-sm font-bold text-white hover:text-[#FF7A45] flex items-center gap-1 transition-colors group"
          >
            <span>Team {request.teamId}</span>
            <ArrowRight className="w-3.5 h-3.5 opacity-60 group-hover:translate-x-0.5 transition-transform" />
          </Link>
          <span
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase border ${
              statusBadges[request.status] || statusBadges.pending
            }`}
          >
            {request.status}
          </span>
        </div>

        {request.message && (
          <div className="flex items-start gap-2 text-xs text-zinc-300 bg-[#08080A] p-3 rounded-xl border border-[#2C2826] mb-2">
            <MessageSquare className="w-3.5 h-3.5 text-[#FF7A45] shrink-0 mt-0.5" />
            <p className="italic">"{request.message}"</p>
          </div>
        )}

        <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-500">
          <Clock className="w-3 h-3" />
          <span>Sent: {new Date(request.createdAt).toLocaleString()}</span>
        </div>
      </div>

      {isPending && (
        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          <button
            type="button"
            onClick={handleCancel}
            disabled={isCanceling}
            className="px-3.5 py-1.5 rounded-xl bg-[#18181C] hover:bg-[#241417] text-zinc-400 hover:text-[#F43F5E] border border-[#2C2826] text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            {isCanceling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
            Cancel Request
          </button>
        </div>
      )}
    </div>
  );
}
