import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { FormTextField } from '@/components/form/FormTextField';
import { AppText, Button, Chip, Screen } from '@/components/ui';
import { signOut } from '@/features/auth/api';
import { createCourier } from '@/features/courier/api';
import { courierKeys } from '@/features/courier/hooks';
import {
  type CourierFormInput,
  type CourierFormValues,
  courierSchema,
} from '@/features/courier/schemas';
import { LEGAL_STATUSES, VEHICLES } from '@/features/courier/types';
import { useSpace } from '@/features/space/SpaceProvider';
import { errorKey } from '@/lib/errors';
import { spacing } from '@/theme';

/** Inscription du livreur : nom, téléphone, statut, SIRET et véhicule. */
export default function CourierOnboardingScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { setSpace } = useSpace();
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<
    CourierFormInput,
    unknown,
    CourierFormValues
  >({
    resolver: zodResolver(courierSchema),
    defaultValues: {
      displayName: '',
      phone: '',
      legalStatus: 'auto_entrepreneur',
      siret: '',
      vehicle: 'bike',
    },
  });

  const submit = handleSubmit(async (values) => {
    setError(null);
    try {
      await createCourier(values);
      // La garde de livreur/_layout bascule alors vers les onglets.
      await queryClient.invalidateQueries({ queryKey: courierKeys.all });
    } catch (e) {
      setError(t(errorKey(e)));
    }
  });

  return (
    <Screen scroll>
      <AppText variant="title">{t('courier.onboarding.title')}</AppText>
      <AppText variant="muted">{t('courier.onboarding.intro')}</AppText>

      <FormTextField
        control={control}
        name="displayName"
        label={t('courier.onboarding.name')}
        autoComplete="name"
        testID="courier-name"
      />
      <AppText variant="muted">{t('courier.onboarding.nameHint')}</AppText>
      <FormTextField
        control={control}
        name="phone"
        label={t('courier.onboarding.phone')}
        keyboardType="phone-pad"
        autoComplete="tel"
        testID="courier-phone"
      />

      <AppText>{t('courier.onboarding.legalStatus')}</AppText>
      <Controller
        control={control}
        name="legalStatus"
        render={({ field }) => (
          <View style={styles.chips}>
            {LEGAL_STATUSES.map((status) => (
              <Chip
                key={status}
                label={t(`courier.onboarding.statuses.${status}`)}
                selected={field.value === status}
                onPress={() => field.onChange(status)}
              />
            ))}
          </View>
        )}
      />
      <FormTextField
        control={control}
        name="siret"
        label={t('courier.onboarding.siret')}
        keyboardType="number-pad"
        testID="courier-siret"
      />
      <AppText variant="muted">{t('courier.onboarding.siretHint')}</AppText>

      <AppText>{t('courier.onboarding.vehicle')}</AppText>
      <Controller
        control={control}
        name="vehicle"
        render={({ field }) => (
          <View style={styles.chips}>
            {VEHICLES.map((vehicle) => (
              <Chip
                key={vehicle}
                label={t(`courier.onboarding.vehicles.${vehicle}`)}
                selected={field.value === vehicle}
                onPress={() => field.onChange(vehicle)}
              />
            ))}
          </View>
        )}
      />

      <AppText variant="muted">{t('courier.onboarding.verification')}</AppText>
      {error ? <AppText variant="error">{error}</AppText> : null}
      <Button
        testID="courier-submit"
        title={t('courier.onboarding.submit')}
        loading={formState.isSubmitting}
        onPress={() => void submit()}
      />
      {/* Pas d'onglets tant que le profil n'existe pas : on garde une sortie. */}
      <Button
        variant="ghost"
        title={t('space.switchToClient')}
        onPress={() => setSpace('client')}
      />
      <Button variant="ghost" title={t('account.signOut')} onPress={() => void signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
