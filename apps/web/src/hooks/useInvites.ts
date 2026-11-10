import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { InviteResponse, TeamResponse } from '@crewgrid/contracts';
import { apiFetch, generateIdempotencyKey } from '../api/client';

export function useTeamInvites(teamId: string | undefined) {
  return useQuery({
    queryKey: ['team-invites', teamId],
    queryFn: async () => {
      if (!teamId) return [];
      const res = await apiFetch<InviteResponse[]>(`/api/v1/teams/${teamId}/invites`);
      return res.data;
    },
    enabled: !!teamId,
    staleTime: 10000
  });
}

export function useCreateInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      teamId,
      expiresInHours = 24
    }: {
      teamId: string;
      expiresInHours?: number;
    }) => {
      const res = await apiFetch<InviteResponse>(`/api/v1/teams/${teamId}/invites`, {
        method: 'POST',
        body: JSON.stringify({ expiresInHours })
      });
      return res.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['team-invites', variables.teamId] });
    }
  });
}

export function useRevokeInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      teamId,
      inviteId
    }: {
      teamId: string;
      inviteId: string;
    }) => {
      await apiFetch(`/api/v1/teams/${teamId}/invites/${inviteId}`, {
        method: 'DELETE'
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['team-invites', variables.teamId] });
    }
  });
}

export function useRedeemInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      token,
      idempotencyKey = generateIdempotencyKey()
    }: {
      token: string;
      idempotencyKey?: string;
    }) => {
      const res = await apiFetch<TeamResponse>('/api/v1/invites/redeem', {
        method: 'POST',
        body: JSON.stringify({ token }),
        idempotencyKey
      });
      return res.data;
    },
    onSuccess: (team) => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['my-team', team.hackathonId] });
      queryClient.invalidateQueries({ queryKey: ['team', team.id] });
      queryClient.invalidateQueries({ queryKey: ['team-members', team.id] });
    }
  });
}

