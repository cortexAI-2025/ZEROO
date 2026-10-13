import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

/**
 * Relance les requêtes chaque fois que l'écran devient visible (y compris le premier
 * affichage : après une redirection, l'écran peut être recréé avec un cache encore
 * considéré comme frais). React Query fusionne les requêtes identiques en cours.
 */
export function useRefreshOnFocus(refetch: () => unknown) {
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
}
