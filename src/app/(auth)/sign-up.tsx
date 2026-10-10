import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { FormTextField } from '@/components/form/FormTextField';
import { AppText, Button, Screen } from '@/components/ui';
import { signUpWithEmail } from '@/features/auth/api';
import { authErrorKey } from '@/features/auth/errors';
import { signUpSchema, type SignUpValues } from '@/features/auth/schemas';
import { SocialButtons } from '@/features/auth/SocialButtons';

export default function SignUpScreen() {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { displayName: '', email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const needsConfirmation = await signUpWithEmail(values);
      if (needsConfirmation) setPendingEmail(values.email);
    } catch (e) {
      setError(t(authErrorKey(e)));
    }
  });

  if (pendingEmail) {
    return (
      <Screen centered>
        <AppText variant="title">{t('auth.checkEmailTitle')}</AppText>
        <AppText>{t('auth.checkEmailBody', { email: pendingEmail })}</AppText>
        <Link href="/sign-in">
          <AppText variant="link">{t('auth.backToSignIn')}</AppText>
        </Link>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <AppText variant="title">{t('auth.signUp')}</AppText>
      <FormTextField
        control={control}
        name="displayName"
        label={t('auth.displayName')}
        autoComplete="given-name"
        textContentType="givenName"
      />
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
        autoComplete="new-password"
        textContentType="newPassword"
      />
      {error ? <AppText variant="error">{error}</AppText> : null}
      <Button
        testID="sign-up-submit"
        title={t('auth.signUp')}
        loading={formState.isSubmitting}
        onPress={() => void onSubmit()}
      />
      <SocialButtons />
      <Link href="/sign-in">
        <AppText variant="link">{t('auth.hasAccount')}</AppText>
      </Link>
    </Screen>
  );
}
