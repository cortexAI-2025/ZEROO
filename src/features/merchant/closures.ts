import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

export type Closure = Tables<'merchant_closures'>;

const closuresKey = (merchantId: string) => ['merchant', merchantId, 'closures'] as const;

/** Fermetures en cours ou à venir (les passées n'ont plus d'effet). */
export async function fetchClosures(merchantId: string) {
  const { data, error } = await supabase
    .from('merchant_closures')
    .select('*')
    .eq('merchant_id', merchantId)
    .gt('ends_at', new Date().toISOString())
    .order('starts_at');
  if (error) throw error;
  return data;
}

/** Jours entiers, heure de l'établissement (calculée côté serveur). `to` est inclus. */
export async function addClosure(merchantId: string, from: string, to: string, reason: string) {
  const { error } = await supabase.rpc('add_closure', {
    p_merchant_id: merchantId,
    p_from: from,
    p_to: to,
    p_reason: reason,
  });
  if (error) throw error;
}

export async function deleteClosure(id: string) {
  const { error } = await supabase.from('merchant_closures').delete().eq('id', id);
  if (error) throw error;
}

export function useClosures(merchantId: string) {
  return useQuery({
    queryKey: closuresKey(merchantId),
    queryFn: () => fetchClosures(merchantId),
  });
}

export function useClosureActions(merchantId: string) {
  const queryClient = useQueryClient();
  const onSettled = () => {
    void queryClient.invalidateQueries({ queryKey: closuresKey(merchantId) });
    // « Ouvert maintenant » dépend des fermetures.
    void queryClient.invalidateQueries({ queryKey: ['merchant', 'mine'] });
  };
  return {
    add: useMutation({
      mutationFn: (v: { from: string; to: string; reason: string }) =>
        addClosure(merchantId, v.from, v.to, v.reason),
      onSettled,
    }),
    remove: useMutation({ mutationFn: deleteClosure, onSettled }),
  };
}
