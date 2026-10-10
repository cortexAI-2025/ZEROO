import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { FormTextField } from '@/components/form/FormTextField';
import { AppText, Button, Screen } from '@/components/ui';
import { updatePassword } from '@/features/auth/api';
import { authErrorKey } from '@/features/auth/errors';
import { newPasswordSchema, type NewPasswordValues } from '@/features/auth/schemas';
import { homeHref, useSpace } from '@/features/space/SpaceProvider';

export default function UpdatePasswordScreen() {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const { space } = useSpace();
  const { control, handleSubmit, formState } = useForm<NewPasswordValues>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await updatePassword(values);
      setDone(true);
    } catch (e) {
      setError(t(authErrorKey(e)));
    }
  });

  return (
    <Screen scroll>
      <AppText variant="title">{t('auth.newPasswordTitle')}</AppText>
      {done ? (
        <>
          <AppText>{t('auth.passwordUpdated')}</AppText>
          <Button title={t('common.continue')} onPress={() => router.replace(homeHref(space))} />
        </>
      ) : (
        <>
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
            title={t('auth.saveNewPassword')}
            loading={formState.isSubmitting}
            onPress={() => void onSubmit()}
          />
        </>
      )}
    </Screen>
  );
}
