import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';

import {
  fetchMerchantPage,
  fetchMerchantPhotos,
  fetchNearbyMerchants,
  searchMerchants,
} from './api';
import type { Coordinates } from './location';

// Client connecté : annuaire limité aux établissements affiliés. Attend la fin du chargement de la
// session pour ne pas afficher d'abord la liste publique.
export function useNearbyMerchants(coords: Coordinates | null) {
  const { session, isLoading } = useAuth();
  const affiliatedOnly = !!session;
  return useQuery({
    queryKey: [
      'discover',
      'nearby',
      coords?.latitude.toFixed(3),
      coords?.longitude.toFixed(3),
      affiliatedOnly,
    ],
    queryFn: () => fetchNearbyMerchants(coords!.latitude, coords!.longitude, affiliatedOnly),
    enabled: !!coords && !isLoading,
  });
}

export function useMerchantSearch(query: string) {
  const { session, isLoading } = useAuth();
  const affiliatedOnly = !!session;
  const term = query.trim();
  return useQuery({
    queryKey: ['discover', 'search', term.toLowerCase(), affiliatedOnly],
    queryFn: () => searchMerchants(term, affiliatedOnly),
    enabled: term.length >= 2 && !isLoading,
  });
}

export function useMerchantPage(slug: string) {
  return useQuery({
    queryKey: ['merchant-page', slug],
    queryFn: () => fetchMerchantPage(slug),
    // Ouverture, pause et ruptures évoluent pendant le service.
    refetchInterval: 60_000,
  });
}

export function useMerchantPhotos(merchantIds: string[]) {
  return useQuery({
    queryKey: ['discover', 'photos', [...merchantIds].sort().join(',')],
    queryFn: () => fetchMerchantPhotos(merchantIds),
    enabled: merchantIds.length > 0,
    staleTime: 5 * 60_000,
  });
}
