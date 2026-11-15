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
  useDeclineJoinRequest
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
import { JoinRequestModal } from '../components/requests/JoinRequestModal';
import { RequestRow } from '../components/requests/RequestRow';
import { SuggestionCard } from '../components/matching/SuggestionCard';

export function TeamDetail() {
  const { id: teamId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { success, error: toastError } = useToast();

  const [activeTab, setActiveTab] = useState<'roster' | 'audit' | 'requests' | 'suggestions'>('roster');
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);

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
              className="inline-flex items-center gap-2 text-sm text-[#FF7A45] hover:underline"
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

  return (
    <AppShell hackathonId={team.hackathonId}>
      <div className="space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
          <Link
            to={`/app/events/${team.hackathonId}/teams`}
            className="hover:text-white flex items-center gap-1 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Team Board
          </Link>
          <span>/</span>
          <span className="text-white font-bold">{team.name}</span>
        </div>

        {/* Team Banner / Header */}
        <div className="p-6 md:p-8 rounded-2xl bg-[#111114] border border-[#2C2826] shadow-xl relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div className="space-y-3 min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-display text-2xl md:text-3xl font-bold text-white tracking-tight truncate">
                  {team.name}
                </h1>
                <StageBadge stage={team.stage} />
                {isMember && (
                  <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-[#FF6B35]/15 text-[#FF7A45] border border-[#FF6B35]/30">
                    {isLeader ? 'You are Leader' : 'You are a Member'}
                  </span>
                )}
              </div>

              {team.description ? (
                <p className="text-sm text-zinc-400 leading-relaxed max-w-3xl">
                  {team.description}
                </p>
              ) : (
                <p className="text-sm text-zinc-500 italic">No description provided.</p>
              )}

              {/* Skills Tags */}
              {team.requiredSkills && team.requiredSkills.length > 0 && (
                <div className="pt-2">
                  <span className="text-xs font-mono uppercase text-zinc-400 block mb-2 font-semibold">
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
              <div className="w-full sm:w-56 p-4 rounded-xl bg-[#18181C] border border-[#2C2826]">
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
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#18181C] hover:bg-[#202026] border border-[#2C2826] flex items-center gap-1.5 transition-colors"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      Edit Team
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsInviteOpen(true)}
                      aria-label="Generate team invite link"
                      className="px-4 py-2 rounded-xl text-xs font-bold text-black bg-white hover:bg-zinc-200 flex items-center gap-1.5 transition-all duration-200 active:scale-95 shadow-sm"
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
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-[#F43F5E] bg-[#F43F5E]/10 hover:bg-[#F43F5E]/20 border border-[#F43F5E]/30 flex items-center gap-1.5 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Leave Team
                  </button>
                )}

                {!isMember && openSeats > 0 && team.stage === 'forming' && (
                  <button
                    type="button"
                    onClick={() => setIsJoinModalOpen(true)}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-black bg-white hover:bg-zinc-200 flex items-center gap-2 transition-all duration-200 active:scale-95 shadow-md"
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
            <div className="mt-5 p-3.5 rounded-xl bg-[#18181C] border border-[#2C2826] flex items-center gap-2.5 text-xs text-zinc-300">
              <Lock className="w-4 h-4 text-amber-400 shrink-0" />
              <span>This team is at maximum capacity ({team.maxSize}/{team.maxSize} seats filled). Join requests cannot be approved while full.</span>
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#2C2826] gap-4 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('roster')}
            className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'roster'
                ? 'border-[#FF6B35] text-white'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            Members ({members.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'audit'
                ? 'border-[#FF6B35] text-white'
                : 'border-transparent text-zinc-400 hover:text-white'
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
                className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${
                  activeTab === 'requests'
                    ? 'border-[#FF6B35] text-white'
                    : 'border-transparent text-zinc-400 hover:text-white'
                }`}
              >
                <Inbox className="w-4 h-4" />
                Join Requests
                {pendingRequests.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#FF6B35] text-white">
                    {pendingRequests.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('suggestions')}
                className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${
                  activeTab === 'suggestions'
                    ? 'border-[#FF6B35] text-white'
                    : 'border-transparent text-zinc-400 hover:text-white'
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
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 font-mono">
                Team Roster ({members.length} / {team.maxSize})
              </h2>
              {isLeader && members.length > 1 && (
                <span className="text-xs text-zinc-500 italic">
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
              <div className="p-8 text-center rounded-2xl bg-[#111114] border border-[#2C2826]">
                <p className="text-sm text-zinc-400">No members currently found for this team.</p>
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
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 font-mono">
              Immutable Audit Timeline
            </h2>
            <div className="p-6 rounded-2xl bg-[#111114] border border-[#2C2826]">
              <AuditTimeline teamId={team.id} />
            </div>
          </div>
        )}

        {activeTab === 'requests' && isLeader && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 font-mono">
                Incoming Join Requests ({requests.length})
              </h2>
              <span className="text-xs text-zinc-500">
                Accepting a member validates max capacity atomically with MongoDB transactions.
              </span>
            </div>

            {loadingRequests ? (
              <SkeletonCard className="h-24" />
            ) : requests.length === 0 ? (
              <div className="p-8 text-center rounded-2xl bg-[#111114] border border-[#2C2826]">
                <Inbox className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                <p className="text-sm text-zinc-400">No incoming join requests right now.</p>
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
                <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 font-mono flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#FF7A45]" />
                  Recommended Teammates
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Ranked deterministically using: 70% Complementary Skill Coverage + 30% Timezone Overlap.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsInviteOpen(true)}
                className="px-4 py-2 rounded-full text-xs font-bold text-black bg-white hover:bg-zinc-200 transition-all duration-200 active:scale-95 shadow-sm"
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
              <div className="p-8 text-center rounded-2xl bg-[#111114] border border-[#2C2826]">
                <p className="text-sm text-zinc-400">
                  No teammate suggestions found matching your needed skills. Ensure your team has specified required skills in team settings.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {suggestions.map((suggestion) => (
                  <SuggestionCard
                    key={suggestion.userId}
                    suggestion={suggestion}
                  />
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
          <JoinRequestModal
            isOpen={isJoinModalOpen}
            teamId={team.id}
            teamName={team.name}
            onClose={() => setIsJoinModalOpen(false)}
            onSuccess={() => {
              refetchTeam();
            }}
          />
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
