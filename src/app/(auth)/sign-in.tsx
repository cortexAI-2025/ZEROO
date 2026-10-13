import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { FormTextField } from '@/components/form/FormTextField';
import { Logo } from '@/components/Logo';
import { AppText, Button, Screen } from '@/components/ui';
import { signInWithEmail } from '@/features/auth/api';
import { authErrorKey } from '@/features/auth/errors';
import { signInSchema, type SignInValues } from '@/features/auth/schemas';
import { SocialButtons } from '@/features/auth/SocialButtons';

export default function SignInScreen() {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  // En cas de succès, le changement de session redirige automatiquement.
  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await signInWithEmail(values);
    } catch (e) {
      setError(t(authErrorKey(e)));
    }
  });

  return (
    <Screen scroll centered>
      <View style={styles.brand}>
        <Logo height={88} />
        <AppText variant="muted">{t('auth.tagline')}</AppText>
      </View>

      {/* Clients : Google ou Apple d'abord, l'e-mail reste possible en dessous. */}
      <SocialButtons intro={t('auth.signInIntro')} />

      <FormTextField
        control={control}
        name="email"
        label={t('auth.email')}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <FormTextField
        control={control}
        name="password"
        label={t('auth.password')}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={() => void onSubmit()}
      />
      {error ? <AppText variant="error">{error}</AppText> : null}
      <Button
        testID="sign-in-submit"
        title={t('auth.signIn')}
        loading={formState.isSubmitting}
        onPress={() => void onSubmit()}
      />

      <Link href="/forgot-password">
        <AppText variant="link">{t('auth.forgotPassword')}</AppText>
      </Link>

      <Link href="/sign-up">
        <AppText variant="link">{t('auth.noAccount')}</AppText>
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: 'center', gap: 8, marginBottom: 8 },
});
