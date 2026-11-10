import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  TeamResponse,
  TeamMember,
  CreateTeamInput,
  EditTeamInput,
  AuditEventResponse
} from '@crewgrid/contracts';
import { apiFetch, generateIdempotencyKey } from '../api/client';

export interface TeamBoardFilters {
  search?: string;
  skill?: string;
  onlyOpen?: boolean;
  limit?: number;
  cursor?: string;
}

export function useTeamBoard(hackathonId: string | undefined, filters: TeamBoardFilters = {}) {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.skill) params.set('skill', filters.skill);
  if (filters.onlyOpen) params.set('onlyOpen', 'true');
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.cursor) params.set('cursor', filters.cursor);

  const queryKey = ['teams', hackathonId, filters.search, filters.skill, filters.onlyOpen, filters.cursor];

  return useQuery({
    queryKey,
    queryFn: async () => {
      if (!hackathonId) return { data: [], meta: { requestId: 'none', nextCursor: null, hasMore: false } };
      return apiFetch<TeamResponse[]>(`/api/v1/hackathons/${hackathonId}/teams?${params.toString()}`);
    },
    enabled: !!hackathonId,
    staleTime: 10000
  });
}

export function useMyTeam(hackathonId: string | undefined) {
  return useQuery({
    queryKey: ['my-team', hackathonId],
    queryFn: async () => {
      if (!hackathonId) return null;
      const res = await apiFetch<TeamResponse | null>(`/api/v1/hackathons/${hackathonId}/teams/my-team`);
      return res.data;
    },
    enabled: !!hackathonId,
    staleTime: 15000
  });
}

export function useTeamDetails(teamId: string | undefined) {
  return useQuery({
    queryKey: ['team', teamId],
    queryFn: async () => {
      if (!teamId) return null;
      const res = await apiFetch<TeamResponse>(`/api/v1/teams/${teamId}`);
      return res.data;
    },
    enabled: !!teamId,
    staleTime: 15000
  });
}

export function useTeamMembers(teamId: string | undefined) {
  return useQuery({
    queryKey: ['team-members', teamId],
    queryFn: async () => {
      if (!teamId) return [];
      const res = await apiFetch<TeamMember[]>(`/api/v1/teams/${teamId}/members`);
      return res.data;
    },
    enabled: !!teamId,
    staleTime: 15000
  });
}

export function useTeamAudit(teamId: string | undefined, cursor?: string) {
  return useQuery({
    queryKey: ['team-audit', teamId, cursor],
    queryFn: async () => {
      if (!teamId) return { data: [], meta: { requestId: 'none', nextCursor: null, hasMore: false } };
      const url = cursor ? `/api/v1/teams/${teamId}/audit?cursor=${cursor}` : `/api/v1/teams/${teamId}/audit`;
      return apiFetch<AuditEventResponse[]>(url);
    },
    enabled: !!teamId,
    staleTime: 10000
  });
}

export function useCreateTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      hackathonId,
      input,
      idempotencyKey = generateIdempotencyKey()
    }: {
      hackathonId: string;
      input: CreateTeamInput;
      idempotencyKey?: string;
    }) => {
      const res = await apiFetch<TeamResponse>(`/api/v1/hackathons/${hackathonId}/teams`, {
        method: 'POST',
        body: JSON.stringify(input),
        idempotencyKey
      });
      return res.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['teams', variables.hackathonId] });
      queryClient.invalidateQueries({ queryKey: ['my-team', variables.hackathonId] });
    }
  });
}

export function useEditTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      teamId,
      input,
      idempotencyKey = generateIdempotencyKey()
    }: {
      teamId: string;
      input: EditTeamInput;
      idempotencyKey?: string;
    }) => {
      const res = await apiFetch<TeamResponse>(`/api/v1/teams/${teamId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
        idempotencyKey
      });
      return res.data;
    },
    onSuccess: (updatedTeam) => {
      queryClient.invalidateQueries({ queryKey: ['team', updatedTeam.id] });
      queryClient.invalidateQueries({ queryKey: ['teams', updatedTeam.hackathonId] });
      queryClient.invalidateQueries({ queryKey: ['my-team', updatedTeam.hackathonId] });
    }
  });
}

export function useLeaveTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      teamId,
      idempotencyKey = generateIdempotencyKey()
    }: {
      teamId: string;
      idempotencyKey?: string;
    }) => {
      const res = await apiFetch<{ teamDeleted: boolean; successorId?: string | null }>(
        `/api/v1/teams/${teamId}/leave`,
        {
          method: 'POST',
          idempotencyKey
        }
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['my-team'] });
    }
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      teamId,
      userId,
      idempotencyKey = generateIdempotencyKey()
    }: {
      teamId: string;
      userId: string;
      idempotencyKey?: string;
    }) => {
      await apiFetch(`/api/v1/teams/${teamId}/members/${userId}`, {
        method: 'DELETE',
        idempotencyKey
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['team', variables.teamId] });
      queryClient.invalidateQueries({ queryKey: ['team-members', variables.teamId] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    }
  });
}

export function useTransferLeadership() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      teamId,
      newLeaderId,
      idempotencyKey = generateIdempotencyKey()
    }: {
      teamId: string;
      newLeaderId: string;
      idempotencyKey?: string;
    }) => {
      const res = await apiFetch<TeamResponse>(`/api/v1/teams/${teamId}/transfer-leadership`, {
        method: 'POST',
        body: JSON.stringify({ newLeaderId }),
        idempotencyKey
      });
      return res.data;
    },
    onSuccess: (updatedTeam) => {
      queryClient.invalidateQueries({ queryKey: ['team', updatedTeam.id] });
      queryClient.invalidateQueries({ queryKey: ['team-members', updatedTeam.id] });
      queryClient.invalidateQueries({ queryKey: ['my-team', updatedTeam.hackathonId] });
    }
  });
}
