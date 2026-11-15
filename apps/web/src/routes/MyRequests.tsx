import { Link, useParams } from 'react-router';
import { Inbox, ArrowLeft, Compass, Loader2 } from 'lucide-react';
import { useMyRequests, useCancelJoinRequest } from '../hooks/useRequests';
import { useToast } from '../context/ToastContext';
import { AppShell } from '../components/common/AppShell';
import { PageHeader } from '../components/common/PageHeader';
import { SentRequestRow } from '../components/requests/SentRequestRow';
import { SkeletonCard } from '../components/common/SkeletonCard';
import { ErrorPanel } from '../components/common/ErrorPanel';
import { isValidObjectId } from '../utils/validation';

export function MyRequests() {
  const { id: hackathonId } = useParams<{ id: string }>();
  const { data: requests = [], isLoading, error, refetch } = useMyRequests();
  const cancelMutation = useCancelJoinRequest();
  const { success, error: toastError } = useToast();

  const handleCancel = async (requestId: string) => {
    try {
      await cancelMutation.mutateAsync({ requestId });
      success('Request canceled', 'Your join request was withdrawn.');
      refetch();
    } catch (err: any) {
      toastError('Cancellation failed', err.message);
    }
  };

  const pendingRequests = requests.filter((r) => r.status === 'pending');
  const pastRequests = requests.filter((r) => r.status !== 'pending');

  if (hackathonId === 'default') {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center min-h-[350px] gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#FF7A45]" />
          <p className="text-sm font-medium text-zinc-400">Redirecting to active hackathon...</p>
        </div>
      </AppShell>
    );
  }

  if (hackathonId && !isValidObjectId(hackathonId)) {
    return (
      <AppShell>
        <div className="max-w-xl mx-auto py-12">
          <ErrorPanel
            title="Invalid Event Identifier"
            message="The requested hackathon ID is invalid or malformed. Please select an active event from the navigation menu."
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell hackathonId={hackathonId}>
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
          <Link
            to={hackathonId ? `/app/events/${hackathonId}/teams` : '/app'}
            className="hover:text-white flex items-center gap-1 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Team Board
          </Link>
          <span>/</span>
          <span className="text-white font-bold">My Requests</span>
        </div>

        <PageHeader
          title="My Join Requests"
          subtitle="Review and manage applications you have sent to teams. When an application is approved, any other pending requests are automatically invalidated."
        />

        {error ? (
          <ErrorPanel
            title="Failed to Load Requests"
            message={(error as Error).message}
            onRetry={() => refetch()}
          />
        ) : isLoading ? (
          <div className="space-y-3">
            <SkeletonCard className="h-24" />
            <SkeletonCard className="h-24" />
          </div>
        ) : requests.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-[#111114] border border-[#2C2826] space-y-4">
            <Inbox className="w-12 h-12 text-zinc-600 mx-auto" />
            <div>
              <h3 className="font-display text-base font-bold text-white">No Join Requests Sent</h3>
              <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto leading-relaxed">
                You haven't applied to any teams yet. Browse the team discovery board to find forming teams looking for your skills.
              </p>
            </div>
            {hackathonId && (
              <Link
                to={`/app/events/${hackathonId}/teams`}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold text-black bg-white hover:bg-zinc-200 transition-all duration-200 active:scale-95 shadow-sm"
              >
                <Compass className="w-4 h-4" />
                Explore Open Teams
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Active / Pending Section */}
            {pendingRequests.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-amber-400">
                    Pending Review ({pendingRequests.length})
                  </h2>
                  <span className="text-[11px] text-zinc-500">
                    Awaiting decision from team leaders
                  </span>
                </div>
                <div className="space-y-2.5">
                  {pendingRequests.map((req) => (
                    <SentRequestRow key={req.id} request={req} onCancel={handleCancel} />
                  ))}
                </div>
              </div>
            )}

            {/* Resolved / Historical Section */}
            {pastRequests.length > 0 && (
              <div className="space-y-3 pt-6 border-t border-[#2C2826]">
                <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400">
                  Request History ({pastRequests.length})
                </h2>
                <div className="space-y-2.5 opacity-80">
                  {pastRequests.map((req) => (
                    <SentRequestRow key={req.id} request={req} onCancel={handleCancel} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
