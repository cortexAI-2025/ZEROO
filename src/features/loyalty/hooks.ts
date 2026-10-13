import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { useRealtimeChanges } from '@/lib/realtime';
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

/** 9 menus formules payés et récupérés = 1 menu offert (règle appliquée en base). */
export const MENUS_PER_REWARD = 9;

export type LoyaltyCard = Tables<'loyalty_cards'> & {
  merchants: Pick<Tables<'merchants'>, 'name' | 'slug'> | null;
};

const loyaltyKey = (userId: string | undefined) => ['loyalty', userId] as const;

/** Cartes de fidélité du client, à jour en temps réel (RLS : seulement les siennes). */
export function useMyLoyaltyCards() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();
  useRealtimeChanges({
    table: 'loyalty_cards',
    filter: userId ? `user_id=eq.${userId}` : null,
    onChange: () => void queryClient.invalidateQueries({ queryKey: loyaltyKey(userId) }),
  });
  return useQuery({
    queryKey: loyaltyKey(userId),
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('loyalty_cards')
        .select('*, merchants(name, slug)')
        .eq('user_id', userId!)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data as LoyaltyCard[];
    },
  });
}

/** Carte du client chez un commerce (undefined : pas encore de carte). */
export function useLoyaltyCard(merchantId: string | undefined) {
  const cards = useMyLoyaltyCards();
  return cards.data?.find((c) => c.merchant_id === merchantId);
}
