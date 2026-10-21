import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';

import {
  type CampaignStatus,
  fetchMyCampaigns,
  isPlatformAdmin,
  listAdminCampaigns,
  recordPublication,
  requeueCampaign,
  reviewCampaign,
  updateCaption,
} from './api';

export function useMyCampaigns(merchantId: string, enabled = true) {
  return useQuery({
    queryKey: ['marketing', merchantId] as const,
    queryFn: () => fetchMyCampaigns(merchantId),
    enabled,
  });
}

export function useUpdateCaption(merchantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, caption }: { id: string; caption: string }) => updateCaption(id, caption),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['marketing', merchantId] }),
  });
}

/** L'utilisateur connecté fait-il partie de l'équipe ZeeRoo ? (la sécurité reste côté base). */
export function useIsPlatformAdmin() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['platform-admin', session?.user.id] as const,
    queryFn: isPlatformAdmin,
    enabled: !!session,
    staleTime: 5 * 60_000,
  });
}

export function useAdminCampaigns(status?: CampaignStatus) {
  return useQuery({
    queryKey: ['admin-campaigns', status ?? 'all'] as const,
    queryFn: () => listAdminCampaigns(status),
  });
}

export function useAdminCampaignActions() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-campaigns'] });
  return {
    review: useMutation({ mutationFn: reviewCampaign, onSuccess: refresh }),
    record: useMutation({ mutationFn: recordPublication, onSuccess: refresh }),
    requeue: useMutation({
      mutationFn: ({ id, scheduledFor }: { id: string; scheduledFor: string }) =>
        requeueCampaign(id, scheduledFor),
      onSuccess: refresh,
    }),
  };
}
