import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { useRealtimeChanges } from '@/lib/realtime';

import { fetchMyOrders, fetchOrder } from './api';

export const customerOrderKeys = {
  all: ['customer-orders'] as const,
  list: (customerId: string | undefined) => ['customer-orders', 'list', customerId] as const,
  one: (orderId: string) => ['customer-orders', 'one', orderId] as const,
};

/** Rafraîchit les commandes du client à chaque changement (RLS : seulement les siennes). */
function useCustomerOrdersRealtime(customerId: string | undefined) {
  const queryClient = useQueryClient();
  useRealtimeChanges({
    table: 'orders',
    filter: customerId ? `customer_id=eq.${customerId}` : null,
    onChange: () => void queryClient.invalidateQueries({ queryKey: customerOrderKeys.all }),
  });
}

export function useMyOrders() {
  const { session } = useAuth();
  const customerId = session?.user.id;
  useCustomerOrdersRealtime(customerId);
  return useQuery({
    queryKey: customerOrderKeys.list(customerId),
    queryFn: () => fetchMyOrders(customerId!),
    enabled: !!customerId,
  });
}

export function useOrder(orderId: string) {
  const { session } = useAuth();
  useCustomerOrdersRealtime(session?.user.id);
  return useQuery({
    queryKey: customerOrderKeys.one(orderId),
    queryFn: () => fetchOrder(orderId),
    // Filet de sécurité si le temps réel décroche : 15 s tant que la commande avance,
    // plus rien une fois terminée.
    refetchInterval: (query) =>
      ['pending_payment', 'placed', 'accepted', 'preparing', 'ready', 'out_for_delivery'].includes(
        query.state.data?.status ?? '',
      )
        ? 15_000
        : false,
  });
}
