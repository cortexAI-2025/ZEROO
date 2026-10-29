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
    defaultValues: {
      firstName: '',
      lastName: '',
      addressLine: '',
      postalCode: '',
      city: '',
      phone: '',
      email: '',
      password: '',
    },
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
      <SocialButtons intro={t('auth.signUpIntro')} />
      <AppText variant="muted">{t('auth.requiredFields')}</AppText>
      <FormTextField
        control={control}
        name="firstName"
        label={t('auth.firstName')}
        maxLength={80}
        autoComplete="given-name"
        textContentType="givenName"
      />
      <FormTextField
        control={control}
        name="lastName"
        label={t('auth.lastName')}
        maxLength={80}
        autoComplete="family-name"
        textContentType="familyName"
      />
      <FormTextField
        control={control}
        name="addressLine"
        label={t('auth.addressLine')}
        maxLength={240}
        autoComplete="street-address"
        textContentType="streetAddressLine1"
      />
      <FormTextField
        control={control}
        name="postalCode"
        label={t('auth.postalCode')}
        maxLength={5}
        keyboardType="number-pad"
        autoComplete="postal-code"
        textContentType="postalCode"
      />
      <FormTextField
        control={control}
        name="city"
        label={t('auth.city')}
        maxLength={100}
        textContentType="addressCity"
      />
      <FormTextField
        control={control}
        name="phone"
        label={t('auth.phone')}
        maxLength={30}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
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
      <AppText variant="muted">{t('auth.proHint')}</AppText>
      <AppText variant="muted">{t('auth.proAvatarHint')}</AppText>
      <Link href="/sign-in">
        <AppText variant="link">{t('auth.hasAccount')}</AppText>
      </Link>
    </Screen>
  );
}
