import type { Session } from '@supabase/supabase-js';
import { createContext, type ReactNode, use, useEffect, useRef, useState } from 'react';

import { Platform } from 'react-native';

import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';

import { parseAuthCallback } from './callback';

// Web : supabase-js consomme puis efface les jetons de l'URL, et peut émettre
// INITIAL_SESSION avant PASSWORD_RECOVERY. On lit donc l'URL dès le chargement.
const openedFromRecoveryLink = (() => {
  if (Platform.OS !== 'web') return false;
  const result = parseAuthCallback(globalThis.location?.href);
  return result.kind === 'session' && result.isRecovery;
})();

type AuthState = {
  session: Session | null;
  /** `true` tant que la session stockée sur l'appareil n'a pas été relue. */
  isLoading: boolean;
  /** `true` après ouverture d'un lien « mot de passe oublié » (détecté par supabase-js sur le web). */
  isPasswordRecovery: boolean;
};

const AuthContext = createContext<AuthState>({
  session: null,
  isLoading: true,
  isPasswordRecovery: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    isLoading: true,
    isPasswordRecovery: openedFromRecoveryLink,
  });

  const previousUserId = useRef<string | null>(null);
  useEffect(() => {
    // onAuthStateChange émet INITIAL_SESSION au démarrage, puis chaque changement.
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (previousUserId.current !== (session?.user.id ?? null)) {
        queryClient.clear();
        previousUserId.current = session?.user.id ?? null;
      }
      setState((previous) => ({
        session,
        isLoading: false,
        isPasswordRecovery:
          event === 'PASSWORD_RECOVERY' || (previous.isPasswordRecovery && event !== 'SIGNED_OUT'),
      }));
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return <AuthContext value={state}>{children}</AuthContext>;
}

export function useAuth() {
  return use(AuthContext);
}
