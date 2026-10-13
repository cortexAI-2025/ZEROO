import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { useRealtimeChanges } from '@/lib/realtime';

import {
  acceptMission,
  type CourierProfilePatch,
  declineRun,
  fetchActiveRuns,
  fetchDeliveredRuns,
  fetchEarnings,
  fetchEarningsByDay,
  fetchMissions,
  fetchMyCourier,
  fetchMyLinks,
  leaveMerchant,
  markDelivered,
  requestLink,
  setAvailability,
  updateCourierProfile,
} from './api';

export const courierKeys = {
  all: ['courier'] as const,
  mine: (userId: string | undefined) => ['courier', 'mine', userId] as const,
  missions: (courierId: string) => ['courier', courierId, 'missions'] as const,
  runs: (courierId: string) => ['courier', courierId, 'runs'] as const,
  delivered: (courierId: string) => ['courier', courierId, 'delivered'] as const,
  earnings: (courierId: string) => ['courier', courierId, 'earnings'] as const,
  earningsByDay: (courierId: string) => ['courier', courierId, 'earnings-by-day'] as const,
  links: (courierId: string) => ['courier', courierId, 'links'] as const,
};

/** Profil livreur de l'utilisateur connecté (null s'il n'en a pas encore). */
export function useMyCourier() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: courierKeys.mine(userId),
    queryFn: () => fetchMyCourier(userId!),
    enabled: !!userId,
  });
}

/** Variante pour les écrans où le profil existe forcément (garde dans livreur/_layout). */
export function useCurrentCourier() {
  const query = useMyCourier();
  if (!query.data) throw new Error('useCurrentCourier appelé sans profil livreur');
  return query.data;
}

/** Tout ce qui concerne le livreur est relu à chaque changement de ses courses ou rattachements. */
function useCourierRealtime(courierId: string) {
  const queryClient = useQueryClient();
  const onChange = () => void queryClient.invalidateQueries({ queryKey: courierKeys.all });
  useRealtimeChanges({ table: 'orders', filter: `courier_id=eq.${courierId}`, onChange });
  useRealtimeChanges({
    table: 'merchant_couriers',
    filter: `courier_id=eq.${courierId}`,
    onChange,
  });
}

export function useActiveRuns(courierId: string) {
  useCourierRealtime(courierId);
  return useQuery({
    queryKey: courierKeys.runs(courierId),
    queryFn: () => fetchActiveRuns(courierId),
    // Filet de sécurité si le temps réel décroche.
    refetchInterval: 20_000,
  });
}

/** Missions à prendre : relues souvent, la première acceptation l'emporte. */
export function useMissions(courierId: string) {
  return useQuery({
    queryKey: courierKeys.missions(courierId),
    queryFn: fetchMissions,
    refetchInterval: 10_000,
  });
}

export function useDeliveredRuns(courierId: string) {
  return useQuery({
    queryKey: courierKeys.delivered(courierId),
    queryFn: () => fetchDeliveredRuns(courierId),
  });
}

export function useEarnings(courierId: string) {
  return useQuery({ queryKey: courierKeys.earnings(courierId), queryFn: fetchEarnings });
}

export function useMyLinks(courierId: string) {
  useCourierRealtime(courierId);
  return useQuery({
    queryKey: courierKeys.links(courierId),
    queryFn: () => fetchMyLinks(courierId),
  });
}

/** Mutations du livreur : chacune relit ensuite son profil, ses courses et ses rattachements. */
export function useCourierActions() {
  const queryClient = useQueryClient();
  const onSuccess = () => queryClient.invalidateQueries({ queryKey: courierKeys.all });
  return {
    setAvailability: useMutation({ mutationFn: setAvailability, onSuccess }),
    accept: useMutation({ mutationFn: acceptMission, onSuccess }),
    decline: useMutation({ mutationFn: declineRun, onSuccess }),
    deliver: useMutation({
      mutationFn: ({ orderId, code }: { orderId: string; code: string }) =>
        markDelivered(orderId, code),
      onSuccess,
    }),
    requestLink: useMutation({ mutationFn: requestLink, onSuccess }),
    leave: useMutation({ mutationFn: leaveMerchant, onSuccess }),
  };
}

export function useEarningsByDay(courierId: string) {
  return useQuery({
    queryKey: courierKeys.earningsByDay(courierId),
    queryFn: () => fetchEarningsByDay(),
  });
}

export function useUpdateCourierProfile(courierId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: CourierProfilePatch) => updateCourierProfile(courierId, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: courierKeys.all }),
  });
}
