import { Clock, History, Loader2 } from 'lucide-react';
import { AuditEventResponse } from '@crewgrid/contracts';
import { useTeamAudit } from '../../hooks/useTeams';

interface AuditTimelineProps {
  teamId?: string;
  events?: AuditEventResponse[];
  hasMore?: boolean;
  onLoadMore?: () => void;
  isLoading?: boolean;
}

export function AuditTimeline({
  teamId,
  events: propEvents,
  hasMore: propHasMore,
  onLoadMore: propOnLoadMore,
  isLoading: propIsLoading
}: AuditTimelineProps) {
  const { data: auditResponse, isLoading: auditLoading } = useTeamAudit(teamId);

  const events = propEvents || auditResponse?.data || [];
  const isLoading = propIsLoading !== undefined ? propIsLoading : auditLoading;
  const hasMore = propHasMore !== undefined ? propHasMore : Boolean(auditResponse?.meta?.hasMore);
  const onLoadMore = propOnLoadMore;

  if (isLoading && events.length === 0) {
    return (
      <div className="p-8 text-center rounded-xl bg-[#171E31] border border-[#35405A]">
        <Loader2 className="w-6 h-6 text-[#9BF5CC] animate-spin mx-auto mb-2" />
        <p className="text-xs text-[#B5C1D4]">Loading audit history...</p>
      </div>
    );
  }
  if (events.length === 0) {
    return (
      <div className="p-8 text-center rounded-xl bg-[#171E31] border border-[#35405A]">
        <History className="w-8 h-8 text-[#B5C1D4] mx-auto mb-2" />
        <h4 className="text-sm font-semibold text-[#E9EDF5]">No activity recorded yet</h4>
        <p className="text-xs text-[#B5C1D4] mt-1">Audit log will track all team admissions, leaves, and leadership changes.</p>
      </div>
    );
  }

  const formatAction = (action: string) => {
    switch (action) {
      case 'team.created':
        return 'Team created and leader assigned';
      case 'team.updated':
        return 'Team details or capacity modified';
      case 'team.deleted':
        return 'Team logically deleted';
      case 'member.joined':
        return 'New teammate joined the crew';
      case 'member.left':
        return 'Member departed team';
      case 'member.removed':
        return 'Member was removed by leader';
      case 'leader.transferred':
        return 'Team leadership transferred';
      case 'request.created':
        return 'Applicant submitted join request';
      case 'request.approved':
        return 'Join request approved';
      case 'request.declined':
        return 'Join request declined';
      case 'request.canceled':
        return 'Join request canceled by applicant';
      case 'invite.created':
        return 'Expiring invite generated';
      case 'invite.revoked':
        return 'Invite revoked by leader';
      case 'invite.redeemed':
        return 'Invite redeemed by applicant';
      default:
        return action;
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#35405A]">
        {events.map((event) => (
          <div key={event.id} className="relative">
            <div className="absolute -left-[27px] top-1 w-3 h-3 rounded-full bg-[#9BF5CC] border-2 border-[#171E31]" />
            <div className="p-3.5 rounded-xl bg-[#171E31] border border-[#35405A] text-xs">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-bold text-[#E9EDF5]">{formatAction(event.action)}</span>
                <span className="font-mono text-[11px] text-[#B5C1D4] flex items-center gap-1 shrink-0">
                  <Clock className="w-3 h-3" />
                  {new Date(event.occurredAt).toLocaleString()}
                </span>
              </div>
              <p className="font-mono text-[11px] text-[#B5C1D4]/80">
                Actor: {event.actorId} {event.subjectId ? `· Subject: ${event.subjectId}` : ''}
              </p>
              {event.changes && Object.keys(event.changes).length > 0 && (
                <div className="mt-2 p-2 rounded bg-[#0B1020]/60 border border-[#35405A]/50 font-mono text-[10px] text-[#B5C1D4] overflow-x-auto">
                  <pre>{JSON.stringify(event.changes, null, 2)}</pre>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {hasMore && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={isLoading}
          className="w-full py-2.5 rounded-lg bg-[#222A42] hover:bg-[#35405A] border border-[#35405A] text-xs font-semibold text-[#E9EDF5] transition"
        >
          {isLoading ? 'Loading older events...' : 'Load older activity'}
        </button>
      )}
    </div>
  );
}
