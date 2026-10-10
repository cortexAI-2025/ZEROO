import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';

import {
  fetchMyMerchant,
  fetchOpeningHours,
  fetchTodaySummary,
  type MerchantPatch,
  saveOpeningHours,
  updateMerchant,
} from './api';
import type { Slot } from './hours';

export const merchantKeys = {
  mine: (ownerId: string | undefined) => ['merchant', 'mine', ownerId] as const,
  hours: (merchantId: string) => ['merchant', merchantId, 'hours'] as const,
  today: (merchantId: string) => ['merchant', merchantId, 'today'] as const,
};

/** Le commerce de l'utilisateur connecté (null s'il n'en a pas encore). */
export function useMyMerchant() {
  const { session } = useAuth();
  const ownerId = session?.user.id;
  return useQuery({
    queryKey: merchantKeys.mine(ownerId),
    queryFn: () => fetchMyMerchant(ownerId!),
    enabled: !!ownerId,
    // « Ouvert / fermé » et la fin de pause dépendent de l'heure.
    refetchInterval: 60_000,
  });
}

/** Variante pour les écrans où le commerce existe forcément (garde dans pro/_layout). */
export function useCurrentMerchant() {
  const query = useMyMerchant();
  if (!query.data) throw new Error('useCurrentMerchant appelé sans commerce');
  return query.data;
}

export function useUpdateMerchant(merchantId: string) {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: (patch: MerchantPatch) => updateMerchant(merchantId, patch),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: merchantKeys.mine(session?.user.id) }),
  });
}

export function useOpeningHours(merchantId: string) {
  return useQuery({
    queryKey: merchantKeys.hours(merchantId),
    queryFn: () => fetchOpeningHours(merchantId),
  });
}

export function useSaveOpeningHours(merchantId: string) {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: (slots: Slot[]) => saveOpeningHours(merchantId, slots),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: merchantKeys.hours(merchantId) });
      await queryClient.invalidateQueries({ queryKey: merchantKeys.mine(session?.user.id) });
    },
  });
}

export function useTodaySummary(merchantId: string) {
  return useQuery({
    queryKey: merchantKeys.today(merchantId),
    queryFn: () => fetchTodaySummary(merchantId),
  });
}
