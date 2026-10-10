import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View, useColorScheme } from 'react-native';

import { AppText, Button } from '@/components/ui';
import { radius, spacing } from '@/theme';

import { authErrorKey } from './errors';
import {
  isAppleSignInAvailable,
  isGoogleSignInAvailable,
  signInWithApple,
  signInWithGoogle,
} from './social';

export function SocialButtons() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const googleAvailable = isGoogleSignInAvailable();

  useEffect(() => {
    void isAppleSignInAvailable().then(setAppleAvailable);
  }, []);

  if (!appleAvailable && !googleAvailable) return null;

  const run = async (signIn: () => Promise<unknown>) => {
    setError(null);
    setBusy(true);
    try {
      await signIn();
    } catch (e) {
      setError(t(authErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <AppText variant="muted" style={styles.or}>
        {t('common.or')}
      </AppText>
      {appleAvailable ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={
            scheme === 'dark'
              ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
              : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
          }
          cornerRadius={radius.md}
          style={styles.apple}
          onPress={() => void run(signInWithApple)}
        />
      ) : null}
      {googleAvailable ? (
        <Button
          variant="secondary"
          title={t('auth.continueWithGoogle')}
          loading={busy}
          onPress={() => void run(signInWithGoogle)}
        />
      ) : null}
      {error ? <AppText variant="error">{error}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  or: { textAlign: 'center' },
  apple: { height: 50, width: '100%' },
});
