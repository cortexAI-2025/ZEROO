import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { callFunction } from '@/lib/functions';
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

import type { Interval, PlanId } from './plans';

/**
 * Professionnel abonné à ZeeRoo : un restaurant ou un livreur. Stripe ne sert qu'à ces
 * abonnements (encaissés par AiWorkPay) ; les clients paient les pros via leur propre lien.
 * Abonnements HT (restaurant Start ou Pro, livreur : voir plans.ts), 30 jours d'essai.
 */
export type BillingTarget = { role: 'merchant' | 'courier'; id: string };

export type BillingState = {
  subscription: Pick<
    Tables<'subscriptions'>,
    'status' | 'trial_end' | 'current_period_end' | 'cancel_at_period_end' | 'trial_used'
  > | null;
};

export async function fetchBilling({ role, id }: BillingTarget): Promise<BillingState> {
  const subscription =
    role === 'merchant'
      ? await supabase.from('subscriptions').select('*').eq('merchant_id', id).maybeSingle()
      : await supabase.from('courier_subscriptions').select('*').eq('courier_id', id).maybeSingle();
  if (subscription.error) throw subscription.error;
  return { subscription: subscription.data };
}

export const billingKey = ({ role, id }: BillingTarget) => [role, id, 'billing'] as const;

export function useBilling(target: BillingTarget) {
  return useQuery({ queryKey: billingKey(target), queryFn: () => fetchBilling(target) });
}

/** Ouvre une page Stripe : même onglet sur le web, navigateur intégré sur mobile. */
async function openStripePage(url: string) {
  if (Platform.OS === 'web') {
    globalThis.location.assign(url);
    return;
  }
  await WebBrowser.openBrowserAsync(url);
}

/** Actions de la carte « Abonnement ». Rafraîchit l'état au retour de Stripe. */
export function useBillingActions(target: BillingTarget) {
  const queryClient = useQueryClient();
  const { role } = target;
  /** Relit l'état en base (mis à jour par les webhooks Stripe), et le profil du professionnel. */
  const reload = async () => {
    await queryClient.invalidateQueries({ queryKey: billingKey(target) });
    await queryClient.invalidateQueries({ queryKey: [role] });
  };
  return {
    /** Retour de Stripe : relit l'abonnement (mis à jour par le webhook). */
    refresh: reload,
    reload,
    /** Abonnement : page Stripe Checkout (web uniquement, voir docs/ARCHITECTURE.md). */
    subscribe: async (plan: PlanId = 'start', interval: Interval = 'month') => {
      const { url } = await callFunction<{ url: string }>('billing', {
        action: 'checkout',
        role,
        // Le livreur n'a qu'une formule : le serveur attend « start » pour lui.
        plan: plan === 'courier' ? 'start' : plan,
        interval,
      });
      await openStripePage(url);
    },
    manageSubscription: async () => {
      const { url } = await callFunction<{ url: string }>('billing', { action: 'portal', role });
      await openStripePage(url);
    },
  };
}
