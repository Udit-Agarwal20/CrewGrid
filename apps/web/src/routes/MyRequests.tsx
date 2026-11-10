import { Link, useParams } from 'react-router';
import { Inbox, ArrowLeft, Compass } from 'lucide-react';
import { useMyRequests, useCancelJoinRequest } from '../hooks/useRequests';
import { useToast } from '../context/ToastContext';
import { AppShell } from '../components/common/AppShell';
import { PageHeader } from '../components/common/PageHeader';
import { SentRequestRow } from '../components/requests/SentRequestRow';
import { SkeletonCard } from '../components/common/SkeletonCard';
import { ErrorPanel } from '../components/common/ErrorPanel';

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

  return (
    <AppShell hackathonId={hackathonId}>
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2 text-xs font-mono text-[#B5C1D4]">
          <Link
            to={hackathonId ? `/app/events/${hackathonId}/teams` : '/app'}
            className="hover:text-[#9BF5CC] flex items-center gap-1 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Team Board
          </Link>
          <span>/</span>
          <span className="text-[#E9EDF5] font-bold">My Requests</span>
        </div>

        <PageHeader
          title="My Join Requests"
          subtitle="Review and manage applications you have sent to teams. When an application is approved, any other pending requests are automatically invalidated."
        />

        {error && (
          <ErrorPanel
            title="Failed to Load Requests"
            message={(error as Error).message}
            onRetry={() => refetch()}
          />
        )}

        {isLoading ? (
          <div className="space-y-3">
            <SkeletonCard className="h-24" />
            <SkeletonCard className="h-24" />
          </div>
        ) : requests.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-[#171E31] border border-[#35405A] space-y-4">
            <Inbox className="w-12 h-12 text-[#B5C1D4]/40 mx-auto" />
            <div>
              <h3 className="text-base font-bold text-[#E9EDF5]">No Join Requests Sent</h3>
              <p className="text-xs text-[#B5C1D4] mt-1 max-w-sm mx-auto">
                You haven't applied to any teams yet. Browse the team discovery board to find forming teams looking for your skills.
              </p>
            </div>
            {hackathonId && (
              <Link
                to={`/app/events/${hackathonId}/teams`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-[#0B1020] bg-[#9BF5CC] hover:bg-[#86E4BA] transition"
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
                  <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-[#FBBF24]">
                    Pending Review ({pendingRequests.length})
                  </h2>
                  <span className="text-[11px] text-[#B5C1D4]">
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

            {/* Resolved / Past Section */}
            {pastRequests.length > 0 && (
              <div className="space-y-3 pt-4 border-t border-[#35405A]">
                <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-[#B5C1D4]">
                  Resolved Requests ({pastRequests.length})
                </h2>
                <div className="space-y-2.5">
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
