import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { merchantKeys } from '@/features/merchant/hooks';
import { useRealtimeChanges } from '@/lib/realtime';

import { fetchActiveOrders, fetchOrderHistory, setOrderStatus, type StatusChange } from './api';

export const orderKeys = {
  active: (merchantId: string) => ['merchant-orders', merchantId, 'active'] as const,
  history: (merchantId: string) => ['merchant-orders', merchantId, 'history'] as const,
};

/**
 * Commandes en cours, tenues à jour en temps réel.
 * Supabase Realtime applique la RLS : seules les commandes du commerce arrivent ici.
 */
export function useActiveOrders(merchantId: string) {
  const queryClient = useQueryClient();

  useRealtimeChanges({
    table: 'orders',
    filter: `merchant_id=eq.${merchantId}`,
    onChange: () => {
      void queryClient.invalidateQueries({ queryKey: ['merchant-orders', merchantId] });
      void queryClient.invalidateQueries({ queryKey: merchantKeys.today(merchantId) });
    },
  });

  return useQuery({
    queryKey: orderKeys.active(merchantId),
    queryFn: () => fetchActiveOrders(merchantId),
    // Filet de sécurité si la connexion temps réel décroche.
    refetchInterval: 30_000,
  });
}

export function useOrderHistory(merchantId: string) {
  return useQuery({
    queryKey: orderKeys.history(merchantId),
    queryFn: () => fetchOrderHistory(merchantId),
  });
}

export function useSetOrderStatus(merchantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (change: StatusChange) => setOrderStatus(change),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['merchant-orders', merchantId] });
      await queryClient.invalidateQueries({ queryKey: merchantKeys.today(merchantId) });
    },
  });
}

const REMINDER_MS = 30_000;

/**
 * Sonnerie « nouvelle commande » : joue dès qu'une commande en attente apparaît,
 * puis rappelle toutes les 30 s tant qu'il reste des commandes sans réponse.
 */
export function useNewOrderAlert(pendingOrderIds: string[], enabled: boolean) {
  const player = useAudioPlayer(require('@/assets/sounds/new-order.wav'));
  const known = useRef<Set<string> | null>(null);
  const key = pendingOrderIds.join(',');

  useEffect(() => {
    if (Platform.OS !== 'web') {
      void setAudioModeAsync({ playsInSilentMode: true });
    }
  }, []);

  useEffect(() => {
    const ring = () => {
      if (!enabled) return;
      void player.seekTo(0).then(() => player.play());
    };
    const ids = key ? key.split(',') : [];
    const previous = known.current;
    known.current = new Set(ids);
    // Au premier chargement, on ne sonne que s'il y a déjà des commandes en attente.
    if (ids.some((id) => !previous?.has(id))) ring();

    if (ids.length === 0) return;
    const timer = setInterval(ring, REMINDER_MS);
    return () => clearInterval(timer);
  }, [key, enabled, player]);
}
