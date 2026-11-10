import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router';
import {
  Users,
  Sparkles,
  History,
  UserPlus,
  Edit,
  LogOut,
  Inbox,
  ArrowLeft,
  Lock
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  useTeamDetails,
  useTeamMembers,
  useLeaveTeam,
  useRemoveMember,
  useTransferLeadership
} from '../hooks/useTeams';
import {
  useTeamRequests,
  useApproveJoinRequest,
  useDeclineJoinRequest,
  useCreateJoinRequest
} from '../hooks/useRequests';
import { useTeamSuggestions } from '../hooks/useTeammates';
import { TeamMember } from '@crewgrid/contracts';
import { AppShell } from '../components/common/AppShell';
import { StageBadge } from '../components/common/StageBadge';
import { SeatProgress } from '../components/common/SeatProgress';
import { SkillPill } from '../components/common/SkillPill';
import { SkeletonCard } from '../components/common/SkeletonCard';
import { ErrorPanel } from '../components/common/ErrorPanel';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { TeamMemberRow } from '../components/teams/TeamMemberRow';
import { AuditTimeline } from '../components/teams/AuditTimeline';
import { EditTeamModal } from '../components/teams/EditTeamModal';
import { InviteModal } from '../components/invites/InviteModal';
import { RequestRow } from '../components/requests/RequestRow';
import { ScoreBreakdown } from '../components/matching/ScoreBreakdown';

export function TeamDetail() {
  const { id: teamId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { success, error: toastError } = useToast();

  const [activeTab, setActiveTab] = useState<'roster' | 'audit' | 'requests' | 'suggestions'>('roster');
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [joinMessage, setJoinMessage] = useState('');

  // Dialog states for member management
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);
  const [memberToTransfer, setMemberToTransfer] = useState<TeamMember | null>(null);
  const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false);

  const { data: team, isLoading: loadingTeam, error: teamError, refetch: refetchTeam } = useTeamDetails(teamId);
  const { data: members = [], isLoading: loadingMembers, refetch: refetchMembers } = useTeamMembers(teamId);
  const { data: requests = [], isLoading: loadingRequests, refetch: refetchRequests } = useTeamRequests(
    team?.leaderId === user?.id ? teamId : undefined
  );
  const { data: suggestions = [], isLoading: loadingSuggestions } = useTeamSuggestions(
    team?.leaderId === user?.id ? teamId : undefined
  );

  const leaveMutation = useLeaveTeam();
  const removeMemberMutation = useRemoveMember();
  const transferLeadershipMutation = useTransferLeadership();
  const approveRequestMutation = useApproveJoinRequest();
  const declineRequestMutation = useDeclineJoinRequest();
  const createRequestMutation = useCreateJoinRequest();

  if (loadingTeam) {
    return (
      <AppShell>
        <div className="space-y-6">
          <SkeletonCard className="h-48" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <SkeletonCard className="h-64 md:col-span-2" />
            <SkeletonCard className="h-64" />
          </div>
        </div>
      </AppShell>
    );
  }

  if (teamError || !team) {
    return (
      <AppShell>
        <div className="max-w-xl mx-auto py-12">
          <ErrorPanel
            title="Team Not Found"
            message="This team does not exist or you do not have permission to view its full details."
            onRetry={() => refetchTeam()}
          />
          <div className="mt-4 text-center">
            <Link
              to="/app"
              className="inline-flex items-center gap-2 text-sm text-[#9BF5CC] hover:underline"
            >
              <ArrowLeft className="w-4 h-4" />
              Return to dashboard
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const isLeader = team.leaderId === user?.id;
  const isMember = team.viewerPermissions?.includes('leave:team') || members.some((m) => m.userId === user?.id);
  const openSeats = team.openSeats !== undefined ? team.openSeats : Math.max(0, team.maxSize - team.memberCount);
  const pendingRequests = requests.filter((r) => r.status === 'pending');

  const handleApprove = async (requestId: string) => {
    try {
      await approveRequestMutation.mutateAsync({ teamId: team.id, requestId });
      success('Request approved', 'The applicant has been added to your team roster.');
      refetchTeam();
      refetchMembers();
      refetchRequests();
    } catch (err: any) {
      toastError('Approval failed', err.message || 'Could not approve applicant');
    }
  };

  const handleDecline = async (requestId: string) => {
    try {
      await declineRequestMutation.mutateAsync({ teamId: team.id, requestId });
      success('Request declined');
      refetchRequests();
    } catch (err: any) {
      toastError('Decline failed', err.message);
    }
  };

  const handleRemoveMember = async () => {
    if (!memberToRemove) return;
    try {
      await removeMemberMutation.mutateAsync({ teamId: team.id, userId: memberToRemove.userId });
      success('Member removed', `${memberToRemove.displayName} was removed from the team.`);
      setMemberToRemove(null);
      refetchTeam();
      refetchMembers();
    } catch (err: any) {
      toastError('Removal failed', err.message);
    }
  };

  const handleTransferLeadership = async () => {
    if (!memberToTransfer) return;
    try {
      await transferLeadershipMutation.mutateAsync({
        teamId: team.id,
        newLeaderId: memberToTransfer.userId
      });
      success('Leadership transferred', `${memberToTransfer.displayName} is now team leader.`);
      setMemberToTransfer(null);
      refetchTeam();
      refetchMembers();
    } catch (err: any) {
      toastError('Transfer failed', err.message);
    }
  };

  const handleLeaveTeam = async () => {
    try {
      const res = await leaveMutation.mutateAsync({ teamId: team.id });
      if (res.teamDeleted) {
        success('Team disbanded', 'You were the last member. The team was automatically disbanded.');
      } else {
        success('Left team successfully');
      }
      setIsLeaveConfirmOpen(false);
      navigate(`/app/events/${team.hackathonId}/teams`);
    } catch (err: any) {
      toastError('Cannot leave team', err.message);
    }
  };

  const handleSendJoinRequest = async () => {
    try {
      await createRequestMutation.mutateAsync({
        teamId: team.id,
        message: joinMessage
      });
      success('Join request sent!', 'The team leader has been notified of your request.');
      setIsJoinModalOpen(false);
      setJoinMessage('');
    } catch (err: any) {
      toastError('Could not send join request', err.message);
    }
  };

  return (
    <AppShell hackathonId={team.hackathonId}>
      <div className="space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2 text-xs font-mono text-[#B5C1D4]">
          <Link
            to={`/app/events/${team.hackathonId}/teams`}
            className="hover:text-[#9BF5CC] flex items-center gap-1 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Team Board
          </Link>
          <span>/</span>
          <span className="text-[#E9EDF5] font-bold">{team.name}</span>
        </div>

        {/* Team Banner / Header */}
        <div className="p-6 md:p-8 rounded-2xl bg-[#171E31] border border-[#35405A] shadow-xl relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div className="space-y-3 min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl md:text-3xl font-black text-[#E9EDF5] tracking-tight truncate">
                  {team.name}
                </h1>
                <StageBadge stage={team.stage} />
                {isMember && (
                  <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-[#9BF5CC]/15 text-[#9BF5CC] border border-[#9BF5CC]/30">
                    {isLeader ? 'You are Leader' : 'You are a Member'}
                  </span>
                )}
              </div>

              {team.description ? (
                <p className="text-sm text-[#B5C1D4] leading-relaxed max-w-3xl">
                  {team.description}
                </p>
              ) : (
                <p className="text-sm text-[#B5C1D4]/60 italic">No description provided.</p>
              )}

              {/* Skills Tags */}
              {team.requiredSkills && team.requiredSkills.length > 0 && (
                <div className="pt-2">
                  <span className="text-xs font-mono uppercase text-[#B5C1D4] block mb-2 font-semibold">
                    Skills Needed:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {team.requiredSkills.map((skill) => (
                      <SkillPill key={skill} skill={skill} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Capacity & Action Controls */}
            <div className="flex flex-col sm:items-end gap-4 shrink-0">
              <div className="w-full sm:w-56 p-4 rounded-xl bg-[#222A42]/60 border border-[#35405A]">
                <SeatProgress
                  memberCount={team.memberCount}
                  maxSize={team.maxSize}
                  minSize={team.minSize}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {isLeader && (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsEditOpen(true)}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold text-[#E9EDF5] bg-[#222A42] hover:bg-[#35405A] border border-[#35405A] flex items-center gap-1.5 transition"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      Edit Team
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsInviteOpen(true)}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold text-[#0B1020] bg-[#9BF5CC] hover:bg-[#86E4BA] flex items-center gap-1.5 transition shadow-sm"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      Invite Link
                    </button>
                  </>
                )}

                {isMember && !isLeader && (
                  <button
                    type="button"
                    onClick={() => setIsLeaveConfirmOpen(true)}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold text-[#F87171] bg-[#F87171]/10 hover:bg-[#F87171]/20 border border-[#F87171]/30 flex items-center gap-1.5 transition"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Leave Team
                  </button>
                )}

                {!isMember && openSeats > 0 && team.stage === 'forming' && (
                  <button
                    type="button"
                    onClick={() => setIsJoinModalOpen(true)}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-[#0B1020] bg-[#9BF5CC] hover:bg-[#86E4BA] flex items-center gap-2 transition shadow-md"
                  >
                    <UserPlus className="w-4 h-4" />
                    Request to Join
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Full capacity notice */}
          {openSeats === 0 && (
            <div className="mt-4 p-3 rounded-xl bg-[#222A42]/60 border border-[#35405A] flex items-center gap-2 text-xs text-[#B5C1D4]">
              <Lock className="w-4 h-4 text-[#FBBF24] shrink-0" />
              <span>This team is at maximum capacity ({team.maxSize}/{team.maxSize} seats filled). Join requests cannot be approved while full.</span>
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#35405A] gap-4 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('roster')}
            className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition ${
              activeTab === 'roster'
                ? 'border-[#9BF5CC] text-[#9BF5CC]'
                : 'border-transparent text-[#B5C1D4] hover:text-[#E9EDF5]'
            }`}
          >
            <Users className="w-4 h-4" />
            Members ({members.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition ${
              activeTab === 'audit'
                ? 'border-[#9BF5CC] text-[#9BF5CC]'
                : 'border-transparent text-[#B5C1D4] hover:text-[#E9EDF5]'
            }`}
          >
            <History className="w-4 h-4" />
            Activity Log
          </button>

          {isLeader && (
            <>
              <button
                type="button"
                onClick={() => setActiveTab('requests')}
                className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition ${
                  activeTab === 'requests'
                    ? 'border-[#9BF5CC] text-[#9BF5CC]'
                    : 'border-transparent text-[#B5C1D4] hover:text-[#E9EDF5]'
                }`}
              >
                <Inbox className="w-4 h-4" />
                Join Requests
                {pendingRequests.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#9BF5CC] text-[#0B1020]">
                    {pendingRequests.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('suggestions')}
                className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition ${
                  activeTab === 'suggestions'
                    ? 'border-[#9BF5CC] text-[#9BF5CC]'
                    : 'border-transparent text-[#B5C1D4] hover:text-[#E9EDF5]'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                Suggestions ({suggestions.length})
              </button>
            </>
          )}
        </div>

        {/* Tab Content */}
        {activeTab === 'roster' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-[#B5C1D4] font-mono">
                Team Roster ({members.length} / {team.maxSize})
              </h2>
              {isLeader && members.length > 1 && (
                <span className="text-xs text-[#B5C1D4] italic">
                  As leader, you can transfer leadership or manage teammates.
                </span>
              )}
            </div>

            {loadingMembers ? (
              <div className="space-y-3">
                <SkeletonCard className="h-20" />
                <SkeletonCard className="h-20" />
              </div>
            ) : members.length === 0 ? (
              <div className="p-8 text-center rounded-2xl bg-[#171E31] border border-[#35405A]">
                <p className="text-sm text-[#B5C1D4]">No members currently found for this team.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {members.map((member) => (
                  <TeamMemberRow
                    key={member.userId}
                    member={member}
                    isLeaderViewer={isLeader}
                    currentUserId={user?.id}
                    onRemove={(m) => setMemberToRemove(m)}
                    onTransferLeader={(m) => setMemberToTransfer(m)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#B5C1D4] font-mono">
              Immutable Audit Timeline
            </h2>
            <div className="p-6 rounded-2xl bg-[#171E31] border border-[#35405A]">
              <AuditTimeline teamId={team.id} />
            </div>
          </div>
        )}

        {activeTab === 'requests' && isLeader && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-[#B5C1D4] font-mono">
                Incoming Join Requests ({requests.length})
              </h2>
              <span className="text-xs text-[#B5C1D4]">
                Accepting a member validates max capacity atomically with MongoDB transactions.
              </span>
            </div>

            {loadingRequests ? (
              <SkeletonCard className="h-24" />
            ) : requests.length === 0 ? (
              <div className="p-8 text-center rounded-2xl bg-[#171E31] border border-[#35405A]">
                <Inbox className="w-8 h-8 text-[#B5C1D4]/40 mx-auto mb-2" />
                <p className="text-sm text-[#B5C1D4]">No incoming join requests right now.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {requests.map((req) => (
                  <RequestRow
                    key={req.id}
                    request={req}
                    onApprove={handleApprove}
                    onDecline={handleDecline}
                    isProcessing={approveRequestMutation.isPending || declineRequestMutation.isPending}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'suggestions' && isLeader && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-[#B5C1D4] font-mono flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#9BF5CC]" />
                  Recommended Teammates
                </h2>
                <p className="text-xs text-[#B5C1D4] mt-0.5">
                  Ranked deterministically using: 70% Complementary Skill Coverage + 30% Timezone Overlap.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsInviteOpen(true)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-[#0B1020] bg-[#9BF5CC] hover:bg-[#86E4BA] transition"
              >
                Create Invite Link
              </button>
            </div>

            {loadingSuggestions ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SkeletonCard className="h-44" />
                <SkeletonCard className="h-44" />
              </div>
            ) : suggestions.length === 0 ? (
              <div className="p-8 text-center rounded-2xl bg-[#171E31] border border-[#35405A]">
                <p className="text-sm text-[#B5C1D4]">
                  No teammate suggestions found matching your needed skills. Ensure your team has specified required skills in team settings.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {suggestions.map((suggestion) => (
                  <div
                    key={suggestion.userId}
                    className="p-5 rounded-2xl bg-[#171E31] border border-[#35405A] space-y-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-base text-[#E9EDF5]">
                          {suggestion.displayName}
                        </h3>
                      </div>
                    </div>

                    <ScoreBreakdown suggestion={suggestion} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Modals & Dialogs */}
        {isEditOpen && (
          <EditTeamModal
            isOpen={isEditOpen}
            team={team}
            onClose={() => setIsEditOpen(false)}
            onUpdated={() => {
              refetchTeam();
              refetchMembers();
            }}
          />
        )}

        {isInviteOpen && (
          <InviteModal
            isOpen={isInviteOpen}
            teamId={team.id}
            onClose={() => setIsInviteOpen(false)}
          />
        )}

        {/* Join Request Dialog */}
        {isJoinModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-md p-6 rounded-2xl bg-[#171E31] border border-[#35405A] shadow-2xl space-y-4">
              <h3 className="text-lg font-bold text-[#E9EDF5]">Request to Join {team.name}</h3>
              <p className="text-xs text-[#B5C1D4]">
                Introduce yourself to the team leader. Mention your relevant experience and how you can contribute.
              </p>
              <div>
                <label className="block text-xs font-mono font-bold text-[#B5C1D4] uppercase mb-1.5">
                  Message (Optional)
                </label>
                <textarea
                  value={joinMessage}
                  onChange={(e) => setJoinMessage(e.target.value)}
                  maxLength={500}
                  rows={3}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B1020] border border-[#35405A] text-[#E9EDF5] text-xs focus:outline-none focus:border-[#9BF5CC] transition resize-none"
                  placeholder="Hey, I specialize in full-stack TypeScript and would love to build Problem Statement 1 together!"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsJoinModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-[#B5C1D4] hover:bg-[#222A42] transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={createRequestMutation.isPending}
                  onClick={handleSendJoinRequest}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-[#0B1020] bg-[#9BF5CC] hover:bg-[#86E4BA] transition disabled:opacity-50"
                >
                  {createRequestMutation.isPending ? 'Sending...' : 'Send Request'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Remove Member Dialog */}
        <ConfirmDialog
          isOpen={!!memberToRemove}
          title={`Remove ${memberToRemove?.displayName}?`}
          message="Are you sure you want to remove this member from the team? They will be free to join another team in this event."
          confirmLabel="Remove Member"
          isDestructive
          isLoading={removeMemberMutation.isPending}
          onConfirm={handleRemoveMember}
          onCancel={() => setMemberToRemove(null)}
        />

        {/* Transfer Leadership Dialog */}
        <ConfirmDialog
          isOpen={!!memberToTransfer}
          title={`Transfer Leadership to ${memberToTransfer?.displayName}?`}
          message="You will become a regular team member and the selected teammate will receive full team management permissions."
          confirmLabel="Transfer Leadership"
          isLoading={transferLeadershipMutation.isPending}
          onConfirm={handleTransferLeadership}
          onCancel={() => setMemberToTransfer(null)}
        />

        {/* Leave Team Dialog */}
        <ConfirmDialog
          isOpen={isLeaveConfirmOpen}
          title="Leave Team?"
          message={
            members.length === 1
              ? 'You are the only member. Leaving will automatically disband and delete the team.'
              : 'Are you sure you want to leave this team? You can apply to another team afterward.'
          }
          confirmLabel="Leave Team"
          isDestructive
          isLoading={leaveMutation.isPending}
          onConfirm={handleLeaveTeam}
          onCancel={() => setIsLeaveConfirmOpen(false)}
        />
      </div>
    </AppShell>
  );
}
