import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PublicUser, ProfileUpdateInput } from '@crewgrid/contracts';
import { apiFetch } from '../api/client';
import { useAuth } from '../context/AuthContext';

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const res = await apiFetch<PublicUser>('/api/v1/profile');
      return res.data;
    },
    staleTime: 30000
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const { refreshUser } = useAuth();

  return useMutation({
    mutationFn: async (input: ProfileUpdateInput) => {
      const res = await apiFetch<PublicUser>('/api/v1/profile', {
        method: 'PATCH',
        body: JSON.stringify(input)
      });
      return res.data;
    },
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(['profile'], updatedUser);
      queryClient.invalidateQueries({ queryKey: ['teammates'] });
      refreshUser();
    }
  });
}
