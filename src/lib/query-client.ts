import { focusManager, QueryClient } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
    // Une action de l'utilisateur (commander, accepter, livrer) part tout de suite et échoue avec un message réseau si on est
    // hors ligne : elle ne reste pas en attente pour s'exécuter, sans qu'il le sache, au retour de la connexion.
    mutations: { networkMode: 'always' },
  },
});

// Sur mobile, « revenir dans l'app » vaut un retour sur l'onglet : on rafraîchit les données.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'));
}
