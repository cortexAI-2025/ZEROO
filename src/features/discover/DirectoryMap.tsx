import type { MerchantSummary } from './api';

/**
 * Carte de l'annuaire. Disponible sur le web (Leaflet, voir DirectoryMap.web.tsx). Sur iOS et
 * Android, la carte intégrée demande `expo-maps`, un build de développement et une clé Google Maps
 * (configuration externe, voir docs/DEPLOIEMENT.md) : l'annuaire reste en liste, chaque fiche
 * propose l'itinéraire vers l'application de plans du téléphone.
 */
export const MAP_SUPPORTED = false;

/** Repère de carte : un établissement qui accueille le public (position publique). */
export type MapMerchant = Pick<MerchantSummary, 'slug' | 'name' | 'is_accepting_orders'> & {
  latitude: number;
  longitude: number;
};

export type DirectoryMapProps = {
  merchants: MapMerchant[];
  center: { latitude: number; longitude: number } | null;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
};

export function DirectoryMap(_props: DirectoryMapProps) {
  return null;
}
