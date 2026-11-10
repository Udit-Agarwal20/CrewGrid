import { useQuery } from '@tanstack/react-query';
import { PublicUser, Suggestion } from '@crewgrid/contracts';
import { apiFetch } from '../api/client';

export interface TeammateFilters {
  skill?: string;
  timezone?: string;
  limit?: number;
  cursor?: string;
}

export function useTeammates(hackathonId: string | undefined, filters: TeammateFilters = {}) {
  const params = new URLSearchParams();
  if (filters.skill) params.set('skill', filters.skill);
  if (filters.timezone) params.set('timezone', filters.timezone);
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.cursor) params.set('cursor', filters.cursor);

  return useQuery({
    queryKey: ['teammates', hackathonId, filters.skill, filters.timezone, filters.cursor],
    queryFn: async () => {
      if (!hackathonId) return { data: [], meta: { requestId: 'none', nextCursor: null, hasMore: false } };
      return apiFetch<PublicUser[]>(`/api/v1/hackathons/${hackathonId}/teammates?${params.toString()}`);
    },
    enabled: !!hackathonId,
    staleTime: 15000
  });
}

export function useTeamSuggestions(teamId: string | undefined) {
  return useQuery({
    queryKey: ['team-suggestions', teamId],
    queryFn: async () => {
      if (!teamId) return [];
      const res = await apiFetch<Suggestion[]>(`/api/v1/teams/${teamId}/suggestions`);
      return res.data;
    },
    enabled: !!teamId,
    staleTime: 15000
  });
}

