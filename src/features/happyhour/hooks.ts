import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  deleteHappyHour,
  fetchActiveOffers,
  fetchHappyHours,
  type HappyHourInput,
  saveHappyHour,
  setHappyHourActive,
} from './api';
import { indexOffers } from './pricing';
import type { OfferMode, OffersByItem } from './types';

const offersKey = (merchantId: string | undefined, mode: OfferMode) =>
  ['happy-hours', 'active', merchantId, mode] as const;
const manageKey = (merchantId: string) => ['happy-hours', 'manage', merchantId] as const;

const EMPTY: OffersByItem = new Map();

/**
 * Offres en vigueur pour un commerce et un mode de commande, relues chaque 30 s : une offre peut
 * se terminer, ou son stock s'épuiser, pendant que le client prépare son panier.
 */
export function useActiveOffers(merchantId: string | undefined, mode: OfferMode) {
  const query = useQuery({
    queryKey: offersKey(merchantId, mode),
    queryFn: () => fetchActiveOffers(merchantId!, mode),
    enabled: !!merchantId,
    refetchInterval: 30_000,
    select: indexOffers,
  });
  return { offers: query.data ?? EMPTY, isPending: query.isPending, refetch: query.refetch };
}

export function useHappyHours(merchantId: string) {
  return useQuery({ queryKey: manageKey(merchantId), queryFn: () => fetchHappyHours(merchantId) });
}

export function useHappyHourActions(merchantId: string) {
  const queryClient = useQueryClient();
  const onSettled = () => {
    void queryClient.invalidateQueries({ queryKey: manageKey(merchantId) });
    void queryClient.invalidateQueries({ queryKey: ['happy-hours', 'active', merchantId] });
  };
  return {
    save: useMutation({
      mutationFn: (v: { id: string | null; input: HappyHourInput }) =>
        saveHappyHour(merchantId, v.id, v.input),
      onSettled,
    }),
    setActive: useMutation({
      mutationFn: (v: { id: string; active: boolean }) => setHappyHourActive(v.id, v.active),
      onSettled,
    }),
    remove: useMutation({ mutationFn: deleteHappyHour, onSettled }),
  };
}
