import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { FormTextField } from '@/components/form/FormTextField';
import { AppText, Button, Screen } from '@/components/ui';
import { requestPasswordReset } from '@/features/auth/api';
import { authErrorKey } from '@/features/auth/errors';
import { resetRequestSchema, type ResetRequestValues } from '@/features/auth/schemas';

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<ResetRequestValues>({
    resolver: zodResolver(resetRequestSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await requestPasswordReset(values);
      setSentTo(values.email);
    } catch (e) {
      setError(t(authErrorKey(e)));
    }
  });

  return (
    <Screen scroll>
      <AppText variant="title">{t('auth.resetTitle')}</AppText>
      {sentTo ? (
        <AppText>{t('auth.resetSent', { email: sentTo })}</AppText>
      ) : (
        <>
          <AppText variant="muted">{t('auth.resetBody')}</AppText>
          <FormTextField
            control={control}
            name="email"
            label={t('auth.email')}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
          />
          {error ? <AppText variant="error">{error}</AppText> : null}
          <Button
            title={t('auth.sendResetLink')}
            loading={formState.isSubmitting}
            onPress={() => void onSubmit()}
          />
        </>
      )}
    </Screen>
  );
}
