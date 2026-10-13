import * as Linking from 'expo-linking';
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform } from 'react-native';

import { AppText, Button, Screen } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { homeHref, useSpace } from '@/features/space/SpaceProvider';
import { parseAuthCallback } from '@/features/auth/callback';
import { supabase } from '@/lib/supabase';

type Status =
  { kind: 'pending' } | { kind: 'failed' } | { kind: 'done'; target: 'recovery' | 'home' };

/**
 * Cible des liens envoyés par e-mail (confirmation, mot de passe oublié).
 * Sur mobile, on installe la session à partir des jetons de l'URL.
 * Sur le web, supabase-js le fait lui-même (detectSessionInUrl) avant d'émettre INITIAL_SESSION.
 */
export default function AuthCallbackScreen() {
  const { t } = useTranslation();
  const isWeb = Platform.OS === 'web';
  const nativeUrl = Linking.useLinkingURL();
  const { session, isLoading, isPasswordRecovery } = useAuth();
  const { space } = useSpace();
  const [sessionStatus, setSessionStatus] = useState<Status>({ kind: 'pending' });

  const parsed = parseAuthCallback(isWeb ? globalThis.location?.href : nativeUrl);

  // Mobile : installe la session contenue dans le lien (opération asynchrone).
  useEffect(() => {
    if (parsed.kind !== 'session' || isWeb) return;
    void supabase.auth
      .setSession({ access_token: parsed.accessToken, refresh_token: parsed.refreshToken })
      .then(({ error }) =>
        setSessionStatus(
          error
            ? { kind: 'failed' }
            : { kind: 'done', target: parsed.isRecovery ? 'recovery' : 'home' },
        ),
      );
    // Les jetons sont dérivés de l'URL : elle suffit comme dépendance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nativeUrl, isWeb]);

  let status: Status;
  if (parsed.kind === 'error') status = { kind: 'failed' };
  else if (isWeb) {
    status = isLoading
      ? { kind: 'pending' }
      : { kind: 'done', target: isPasswordRecovery ? 'recovery' : 'home' };
  } else if (!nativeUrl) status = { kind: 'pending' };
  else if (parsed.kind === 'none') status = { kind: 'done', target: 'home' };
  else status = sessionStatus;

  if (status.kind === 'done') {
    // Rediriger vers une route protégée inaccessible laisserait un écran vide :
    // on vise directement l'écran autorisé pour l'état courant.
    const target =
      status.target === 'recovery' ? '/update-password' : session ? homeHref(space) : '/sign-in';
    return <Redirect href={target} />;
  }

  if (status.kind === 'failed') {
    return (
      <Screen centered>
        <AppText>{t('auth.callbackFailed')}</AppText>
        <Button
          title={t('auth.backToSignIn')}
          onPress={() => router.replace(session ? homeHref(space) : '/sign-in')}
        />
      </Screen>
    );
  }

  return (
    <Screen centered>
      <ActivityIndicator size="large" />
    </Screen>
  );
}
