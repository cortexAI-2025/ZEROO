import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Chip, Screen, TextField } from '@/components/ui';
import { useCurrentCourier, useUpdateCourierProfile } from '@/features/courier/hooks';
import { VEHICLES } from '@/features/courier/types';
import { errorKey } from '@/lib/errors';
import { spacing } from '@/theme';

const PHONE = /^\+?\d[\d .-]{8,18}\d$/;

/** Modification du profil livreur. Le SIRET et le statut, vérifiés par Stripe, restent figés. */
export default function CourierProfileScreen() {
  const { t } = useTranslation();
  const courier = useCurrentCourier();
  const update = useUpdateCourierProfile(courier.id);
  const [name, setName] = useState(courier.display_name);
  const [phone, setPhone] = useState(courier.phone);
  const [vehicle, setVehicle] = useState(courier.vehicle);
  const [zone, setZone] = useState(courier.work_zone ?? '');
  const [error, setError] = useState<string | null>(null);

  const nameValid = name.trim().length >= 2;
  const phoneValid = PHONE.test(phone.trim());

  const save = async () => {
    setError(null);
    try {
      await update.mutateAsync({
        display_name: name.trim(),
        phone: phone.trim(),
        vehicle,
        work_zone: zone.trim() || null,
      });
      router.back();
    } catch (e) {
      setError(t(errorKey(e)));
    }
  };

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: t('courier.profile.editTitle') }} />
      <TextField
        label={t('courier.onboarding.name')}
        value={name}
        onChangeText={setName}
        maxLength={80}
        error={nameValid ? undefined : t('courier.validation.nameRequired')}
      />
      <TextField
        label={t('courier.onboarding.phone')}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        autoComplete="tel"
        error={phoneValid ? undefined : t('courier.validation.phoneInvalid')}
      />
      <AppText variant="muted">{t('courier.onboarding.vehicle')}</AppText>
      <View style={styles.chips}>
        {VEHICLES.map((v) => (
          <Chip
            key={v}
            label={t(`courier.onboarding.vehicles.${v}`)}
            selected={vehicle === v}
            onPress={() => setVehicle(v)}
          />
        ))}
      </View>
      <TextField
        label={t('courier.profile.zone')}
        placeholder={t('courier.profile.zonePlaceholder')}
        value={zone}
        onChangeText={setZone}
        maxLength={80}
      />
      <AppText variant="muted">
        {t('courier.profile.locked', {
          status: t(`courier.onboarding.statuses.${courier.legal_status}`),
          siret: courier.siret,
        })}
      </AppText>
      {error ? <AppText variant="error">{error}</AppText> : null}
      <Button
        testID="courier-profile-save"
        title={t('common.save')}
        disabled={!nameValid || !phoneValid}
        loading={update.isPending}
        onPress={() => void save()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
