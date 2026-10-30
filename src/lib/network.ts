import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

/**
 * Erreur de réseau (hors ligne, serveur injoignable, délai dépassé) : la requête n'a pas abouti, rien n'a été
 * enregistré côté serveur ou on ne peut pas le savoir. Reconnu par le texte, car les navigateurs et supabase-js
 * ne partagent pas de classe d'erreur commune.
 */
export function isNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const {
    name = '',
    message = '',
    status,
  } = error as { name?: string; message?: string; status?: number };
  if (name === 'AbortError' || name === 'TimeoutError' || name === 'AuthRetryableFetchError')
    return true;
  if (status === 0 && name.startsWith('Auth')) return true;
  return /failed to fetch|network request failed|networkerror|load failed|network_error|fetch failed|timed out|timeout/i.test(
    message,
  );
}

const subscribe = (listener: () => void) => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return () => {};
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
};

const getSnapshot = () =>
  Platform.OS === 'web' && typeof navigator !== 'undefined' ? navigator.onLine : true;

/** Vrai tant que le navigateur se déclare connecté (toujours vrai hors web : la détection native n'est pas utilisée). */
export function useIsOnline(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
