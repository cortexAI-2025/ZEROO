import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View, useColorScheme } from 'react-native';

import { AppText, Button } from '@/components/ui';
import { radius, spacing } from '@/theme';

import { SOCIAL_SIGN_IN_ENABLED } from './config';
import { authErrorKey } from './errors';
import {
  isAppleSignInAvailable,
  isGoogleSignInAvailable,
  signInWithApple,
  signInWithGoogle,
} from './social';

type Provider = 'apple' | 'google';

/**
 * Connexion / inscription en un geste avec Apple ou Google : c'est la voie mise en avant pour
 * les clients. Le compte est créé automatiquement à la première connexion. Rien n'est affiché
 * quand aucun fournisseur n'est disponible (le formulaire e-mail reste seul).
 */
/** `intro` : phrase d'accroche affichée au-dessus des boutons quand ils sont disponibles. */
export function SocialButtons({ intro }: { intro?: string }) {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const googleAvailable = isGoogleSignInAvailable();

  useEffect(() => {
    void isAppleSignInAvailable().then(setAppleAvailable);
  }, []);

  if (!SOCIAL_SIGN_IN_ENABLED || (!appleAvailable && !googleAvailable)) return null;

  const run = async (provider: Provider) => {
    setError(null);
    setBusy(provider);
    try {
      await (provider === 'apple' ? signInWithApple() : signInWithGoogle());
    } catch (e) {
      setError(t(authErrorKey(e)));
    } finally {
      setBusy(null);
    }
  };

  // Bouton natif Apple sur iOS (exigé par Apple), bouton standard sur le web.
  const appleButton =
    Platform.OS === 'ios' ? (
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={
          scheme === 'dark'
            ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
            : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
        }
        cornerRadius={radius.md}
        style={styles.apple}
        onPress={() => void run('apple')}
      />
    ) : (
      <Button
        testID="sign-in-apple"
        variant="secondary"
        title={t('auth.continueWithApple')}
        loading={busy === 'apple'}
        disabled={busy !== null}
        onPress={() => void run('apple')}
      />
    );

  return (
    <View style={styles.container}>
      {intro ? <AppText style={styles.intro}>{intro}</AppText> : null}
      {googleAvailable ? (
        <Button
          testID="sign-in-google"
          variant="secondary"
          title={t('auth.continueWithGoogle')}
          loading={busy === 'google'}
          disabled={busy !== null}
          onPress={() => void run('google')}
        />
      ) : null}
      {appleAvailable ? appleButton : null}
      {error ? <AppText variant="error">{error}</AppText> : null}
      {/* Placés au-dessus du formulaire : on annonce l'alternative par e-mail. */}
      <AppText variant="muted" style={styles.or}>
        {t('auth.orWithEmail')}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  intro: { textAlign: 'center' },
  or: { textAlign: 'center', marginVertical: spacing.xs },
  apple: { height: 50, width: '100%' },
});
