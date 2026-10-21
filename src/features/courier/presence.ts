import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useNow } from '@/lib/useNow';

import { sendHeartbeat } from './api';
import { courierKeys } from './hooks';
import { HEARTBEAT_MS, isOnlineAt } from './onlineRules';
import type { Courier } from './types';

/**
 * Maintient la présence du livreur tant que l'app est ouverte : un signal toutes les 5 minutes
 * et à chaque retour au premier plan. App fermée, déconnexion ou plus de réseau : la fenêtre
 * expire et le livreur n'est plus proposé aux clients. Renvoie l'état « en ligne » affiché.
 */
export function useCourierPresence(courier: Courier): boolean {
  const queryClient = useQueryClient();
  const now = useNow(15_000);
  const online = isOnlineAt(courier, now);

  useEffect(() => {
    if (!online) return;
    let active = true;
    const beat = async () => {
      try {
        await sendHeartbeat();
      } catch {
        return; // réseau coupé : la fenêtre expirera d'elle-même
      }
      if (active) void queryClient.invalidateQueries({ queryKey: courierKeys.all });
    };
    const timer = setInterval(() => void beat(), HEARTBEAT_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void beat();
    });
    return () => {
      active = false;
      clearInterval(timer);
      subscription.remove();
    };
  }, [online, queryClient]);

  return online;
}
