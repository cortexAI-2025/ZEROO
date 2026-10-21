import type { MerchantSummary } from './api';

/**
 * Carte de l'annuaire. Disponible sur le web (Leaflet, voir DirectoryMap.web.tsx). Sur iOS et
 * Android, la carte intégrée demande `expo-maps`, un build de développement et une clé Google Maps
 * (configuration externe, voir docs/DEPLOIEMENT.md) : l'annuaire reste en liste, chaque fiche
 * propose l'itinéraire vers l'application de plans du téléphone.
 */
export const MAP_SUPPORTED = false;

export type DirectoryMapProps = {
  merchants: (MerchantSummary & { latitude: number; longitude: number })[];
  center: { latitude: number; longitude: number } | null;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
};

export function DirectoryMap(_props: DirectoryMapProps) {
  return null;
}
