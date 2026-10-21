import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useRealtimeChanges } from '@/lib/realtime';
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

/** Prix de course proposés au restaurant (en centimes) et rayons de livraison (en mètres). */
export const DELIVERY_FEE_CHOICES = [200, 250, 300, 350, 400, 500, 600] as const;
export const DELIVERY_RADIUS_CHOICES = [1000, 2000, 3000, 5000, 8000] as const;

export type MerchantCourier = Tables<'merchant_couriers'> & {
  couriers: Pick<
    Tables<'couriers'>,
    'id' | 'display_name' | 'phone' | 'vehicle' | 'is_online'
  > | null;
};

export async function fetchMerchantCouriers(merchantId: string) {
  const { data, error } = await supabase
    .from('merchant_couriers')
    .select('*, couriers(id, display_name, phone, vehicle, is_online)')
    .eq('merchant_id', merchantId)
    .order('requested_at', { ascending: false });
  if (error) throw error;
  return data as unknown as MerchantCourier[];
}

const couriersKey = (merchantId: string) => ['merchant', merchantId, 'couriers'] as const;

/** Livreurs rattachés et demandes en attente, mis à jour en temps réel. */
export function useMerchantCouriers(merchantId: string) {
  const queryClient = useQueryClient();
  useRealtimeChanges({
    table: 'merchant_couriers',
    filter: `merchant_id=eq.${merchantId}`,
    onChange: () => void queryClient.invalidateQueries({ queryKey: couriersKey(merchantId) }),
  });
  return useQuery({
    queryKey: couriersKey(merchantId),
    queryFn: () => fetchMerchantCouriers(merchantId),
  });
}

export function useCourierDecisions(merchantId: string) {
  const queryClient = useQueryClient();
  const onSuccess = () => queryClient.invalidateQueries({ queryKey: couriersKey(merchantId) });
  return {
    decide: useMutation({
      mutationFn: async ({ courierId, approve }: { courierId: string; approve: boolean }) => {
        const { error } = await supabase.rpc('decide_courier_link', {
          p_courier_id: courierId,
          p_approve: approve,
        });
        if (error) throw error;
      },
      onSuccess,
    }),
    remove: useMutation({
      mutationFn: async (courierId: string) => {
        const { error } = await supabase.rpc('remove_courier', { p_courier_id: courierId });
        if (error) throw error;
      },
      onSuccess,
    }),
  };
}
