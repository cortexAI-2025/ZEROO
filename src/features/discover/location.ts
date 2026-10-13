import * as Location from 'expo-location';

export type Coordinates = { latitude: number; longitude: number };

/**
 * Position actuelle, demandée uniquement après une action explicite du client
 * (bouton « Utiliser ma position »). Elle reste en mémoire et n'est jamais stockée.
 */
export async function getCurrentCoordinates(): Promise<Coordinates | 'denied'> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return 'denied';
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { latitude: position.coords.latitude, longitude: position.coords.longitude };
}

/** 187 → « 190 m » ; 2450 → « 2,5 km » */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}

/** Ouvre l'itinéraire vers le commerce dans l'application de cartes. */
export function directionsUrl(platform: string, latitude: number, longitude: number) {
  return platform === 'ios'
    ? `https://maps.apple.com/?daddr=${latitude},${longitude}`
    : `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
}
