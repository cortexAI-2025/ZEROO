import { useQuery } from '@tanstack/react-query';

import { fetchMerchantPage, fetchNearbyMerchants, searchMerchants } from './api';
import type { Coordinates } from './location';

export function useNearbyMerchants(coords: Coordinates | null) {
  return useQuery({
    queryKey: ['discover', 'nearby', coords?.latitude.toFixed(3), coords?.longitude.toFixed(3)],
    queryFn: () => fetchNearbyMerchants(coords!.latitude, coords!.longitude),
    enabled: !!coords,
  });
}

export function useMerchantSearch(query: string) {
  const term = query.trim();
  return useQuery({
    queryKey: ['discover', 'search', term.toLowerCase()],
    queryFn: () => searchMerchants(term),
    enabled: term.length >= 2,
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
