/**
 * Autocomplétion d'adresses françaises via le service public de géocodage
 * de l'IGN (Géoplateforme, ex-« API Adresse »). Gratuit et sans clé.
 */
const ENDPOINT = 'https://data.geopf.fr/geocodage/search';

export type AddressSuggestion = {
  label: string;
  addressLine: string;
  postalCode: string;
  city: string;
  latitude: number;
  longitude: number;
};

type Feature = {
  geometry: { coordinates: [number, number] };
  properties: { label: string; name: string; postcode?: string; city?: string };
};

export function parseAddressResponse(body: unknown): AddressSuggestion[] {
  const features = (body as { features?: Feature[] })?.features ?? [];
  return features
    .filter((f) => f.properties?.postcode && f.properties?.city && f.geometry?.coordinates)
    .map((f) => ({
      label: f.properties.label,
      addressLine: f.properties.name,
      postalCode: f.properties.postcode!,
      city: f.properties.city!,
      longitude: f.geometry.coordinates[0],
      latitude: f.geometry.coordinates[1],
    }));
}

export async function searchAddresses(query: string, signal?: AbortSignal) {
  const q = query.trim();
  if (q.length < 4) return [];
  const url = `${ENDPOINT}?${new URLSearchParams({ q, limit: '5', index: 'address' })}`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Géocodage indisponible (${response.status})`);
  return parseAddressResponse(await response.json());
}
