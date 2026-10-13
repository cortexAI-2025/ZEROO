import { useEffect, useId, useRef } from 'react';

import { supabase } from '@/lib/supabase';

type Options = {
  /** Table publiée dans supabase_realtime. */
  table: 'orders' | 'loyalty_cards' | 'merchant_couriers';
  /** Filtre Realtime, ex. `merchant_id=eq.<uuid>` ; null = pas d'abonnement. */
  filter: string | null;
  onChange: () => void;
};

/**
 * Abonnement aux changements d'une table, filtrés par la RLS côté serveur.
 * Chaque appel ouvre son propre canal : supabase-js réutilise un canal de même nom,
 * et la fermeture d'un écran couperait alors l'abonnement d'un autre.
 */
export function useRealtimeChanges({ table, filter, onChange }: Options) {
  const instanceId = useId();
  const callback = useRef(onChange);
  useEffect(() => {
    callback.current = onChange;
  });

  useEffect(() => {
    if (!filter) return;
    const channel = supabase
      .channel(`${table}:${filter}:${instanceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table, filter }, () =>
        callback.current(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [table, filter, instanceId]);
}
