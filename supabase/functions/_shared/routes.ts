export type TravelMode = 'walk' | 'bike' | 'drive';
export type Coordinates = { latitude: number; longitude: number };

const GOOGLE_MODES: Record<TravelMode, string> = { walk: 'WALK', bike: 'BICYCLE', drive: 'DRIVE' };

/** Vitesses moyennes en ville (m/s) et détour par rapport au vol d'oiseau. */
const SPEEDS: Record<TravelMode, number> = { walk: 1.3, bike: 4.2, drive: 7 };
const DETOUR = 1.3;

export function distanceMeters(a: Coordinates, b: Coordinates) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** Estimation hors ligne, utilisée si Google Routes n'est pas configuré ou ne répond pas. */
export const estimateSeconds = (from: Coordinates, to: Coordinates, mode: TravelMode) =>
  Math.round((distanceMeters(from, to) * DETOUR) / SPEEDS[mode]);

/**
 * Durée du trajet jusqu'au commerce via Google Routes (computeRoutes), avec le trafic
 * en voiture. La clé GOOGLE_ROUTES_API_KEY ne quitte jamais le serveur.
 */
export async function travelSeconds(
  from: Coordinates,
  to: Coordinates,
  mode: TravelMode,
): Promise<{ seconds: number; source: 'google' | 'estimate' }> {
  const key = Deno.env.get('GOOGLE_ROUTES_API_KEY');
  if (key) {
    try {
      const response = await fetch(
        Deno.env.get('GOOGLE_ROUTES_URL') ??
          'https://routes.googleapis.com/directions/v2:computeRoutes',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': key,
            'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
          },
          body: JSON.stringify({
            origin: { location: { latLng: from } },
            destination: { location: { latLng: to } },
            travelMode: GOOGLE_MODES[mode],
            ...(mode === 'drive' ? { routingPreference: 'TRAFFIC_AWARE' } : {}),
            languageCode: 'fr-FR',
            units: 'METRIC',
          }),
          signal: AbortSignal.timeout(5_000),
        },
      );
      const body = (await response.json()) as { routes?: { duration?: string }[] };
      const duration = body.routes?.[0]?.duration; // ex. « 540s »
      if (response.ok && duration)
        return { seconds: Math.round(parseFloat(duration)), source: 'google' };
      console.warn('Google Routes : réponse inattendue', response.status);
    } catch (error) {
      console.warn('Google Routes indisponible', (error as Error).message);
    }
  }
  return { seconds: estimateSeconds(from, to, mode), source: 'estimate' };
}
