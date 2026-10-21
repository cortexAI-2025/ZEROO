import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

import type { DeliveryAddress } from './store';

/** Le restaurant livre-t-il, et à quel prix (fixé par lui) ? */
export function useMerchantDeliverySettings(merchantId: string | undefined) {
  return useQuery({
    queryKey: ['merchant-delivery', merchantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('merchants')
        .select(
          'delivery_enabled, delivery_fee_cents, accepts_cash_pickup, payment_link, offers_pickup, offers_delivery, has_order_mode',
        )
        .eq('id', merchantId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!merchantId,
  });
}

export type DeliveryQuote = {
  available: boolean;
  reason: 'delivery_unavailable' | 'delivery_out_of_range' | 'no_courier_available' | null;
  fee_cents: number | null;
  distance_m: number | null;
};

/** Devis avant commande : adresse dans la zone et livreur disponible maintenant. */
export function useDeliveryQuote(merchantId: string | undefined, address: DeliveryAddress | null) {
  return useQuery({
    queryKey: ['delivery-quote', merchantId, address?.latitude, address?.longitude],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('merchant_delivery_quote', {
        p_merchant_id: merchantId!,
        p_latitude: address!.latitude,
        p_longitude: address!.longitude,
      });
      if (error) throw error;
      return (data as DeliveryQuote[])[0];
    },
    enabled: !!merchantId && !!address,
    // Un livreur peut se libérer ou partir : on revérifie régulièrement.
    refetchInterval: 30_000,
  });
}
