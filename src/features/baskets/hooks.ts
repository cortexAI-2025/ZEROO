import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';

import {
  cancelReservation,
  collectReservation,
  fetchMerchantBaskets,
  fetchMyReservations,
  fetchPublicBaskets,
  reserveBasket,
  saveBasket,
  setBasketActive,
} from './api';
import type { BasketInput } from './form';

const publicKey = (merchantId: string | undefined) => ['baskets', 'public', merchantId] as const;
const merchantKey = (merchantId: string) => ['baskets', 'merchant', merchantId] as const;
const mineKey = (userId: string | undefined) => ['baskets', 'mine', userId] as const;

/** Paniers proposés par un commerce, relus chaque minute (stock et fin de créneau évoluent). */
export function usePublicBaskets(merchantId: string | undefined) {
  return useQuery({
    queryKey: publicKey(merchantId),
    queryFn: () => fetchPublicBaskets(merchantId!),
    enabled: !!merchantId,
    refetchInterval: 60_000,
  });
}

export function useMerchantBaskets(merchantId: string) {
  return useQuery({
    queryKey: merchantKey(merchantId),
    queryFn: () => fetchMerchantBaskets(merchantId),
    refetchInterval: 30_000,
  });
}

export function useMyReservations() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: mineKey(userId),
    queryFn: () => fetchMyReservations(userId!),
    enabled: !!userId,
  });
}

/** Actions du commerçant et du client ; toutes relisent ensuite les listes concernées. */
export function useBasketActions(merchantId?: string) {
  const queryClient = useQueryClient();
  const onSettled = () => void queryClient.invalidateQueries({ queryKey: ['baskets'] });
  return {
    save: useMutation({
      mutationFn: (v: { id: string | null; input: BasketInput }) =>
        saveBasket(merchantId!, v.id, v.input),
      onSettled,
    }),
    setActive: useMutation({
      mutationFn: (v: { id: string; active: boolean }) => setBasketActive(v.id, v.active),
      onSettled,
    }),
    reserve: useMutation({
      mutationFn: (v: { basketId: string; quantity: number }) =>
        reserveBasket(v.basketId, v.quantity),
      onSettled,
    }),
    cancel: useMutation({ mutationFn: cancelReservation, onSettled }),
    collect: useMutation({
      mutationFn: (v: { id: string; code: string }) => collectReservation(v.id, v.code),
      onSettled,
    }),
  };
}
