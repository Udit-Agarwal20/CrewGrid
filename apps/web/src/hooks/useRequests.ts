import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { JoinRequestResponse } from '@crewgrid/contracts';
import { apiFetch, generateIdempotencyKey } from '../api/client';
import { isValidObjectId } from '../utils/validation';

export function useMyRequests() {
  return useQuery({
    queryKey: ['my-requests'],
    queryFn: async () => {
      const res = await apiFetch<JoinRequestResponse[]>('/api/v1/requests/mine');
      return res.data;
    },
    staleTime: 10000
  });
}

export function useTeamRequests(teamId: string | undefined) {
  return useQuery({
    queryKey: ['team-requests', teamId],
    queryFn: async () => {
      if (!isValidObjectId(teamId)) return [];
      const res = await apiFetch<JoinRequestResponse[]>(`/api/v1/teams/${teamId}/requests`);
      return res.data;
    },
    enabled: isValidObjectId(teamId),
    staleTime: 10000
  });
}

export function useCreateJoinRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      teamId,
      message,
      idempotencyKey = generateIdempotencyKey()
    }: {
      teamId: string;
      message?: string;
      idempotencyKey?: string;
    }) => {
      const res = await apiFetch<JoinRequestResponse>(`/api/v1/teams/${teamId}/requests`, {
        method: 'POST',
        body: JSON.stringify({ message: message || '' }),
        idempotencyKey
      });
      return res.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['my-requests'] });
      queryClient.invalidateQueries({ queryKey: ['team-requests', variables.teamId] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    }
  });
}

export function useApproveJoinRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      requestId,
      idempotencyKey = generateIdempotencyKey()
    }: {
      requestId: string;
      teamId?: string;
      idempotencyKey?: string;
    }) => {
      const res = await apiFetch<JoinRequestResponse>(`/api/v1/requests/${requestId}/approve`, {
        method: 'POST',
        idempotencyKey
      });
      return res.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['team-requests'] });
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      queryClient.invalidateQueries({ queryKey: ['team', variables.teamId] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    }
  });
}

export function useDeclineJoinRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      requestId,
      idempotencyKey = generateIdempotencyKey()
    }: {
      requestId: string;
      teamId?: string;
      idempotencyKey?: string;
    }) => {
      const res = await apiFetch<JoinRequestResponse>(`/api/v1/requests/${requestId}/decline`, {
        method: 'POST',
        idempotencyKey
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-requests'] });
    }
  });
}

export function useCancelJoinRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      requestId,
      idempotencyKey = generateIdempotencyKey()
    }: {
      requestId: string;
      idempotencyKey?: string;
    }) => {
      const res = await apiFetch<JoinRequestResponse>(`/api/v1/requests/${requestId}/cancel`, {
        method: 'POST',
        idempotencyKey
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-requests'] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    }
  });
}
