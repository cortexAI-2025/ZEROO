import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Badge, Button, Card, Chip, Screen, SwitchRow } from '@/components/ui';
import { formatDistance } from '@/features/discover/location';
import {
  DELIVERY_FEE_CHOICES,
  DELIVERY_RADIUS_CHOICES,
  useCourierDecisions,
  useMerchantCouriers,
} from '@/features/merchant/delivery';
import { useCurrentMerchant, useUpdateMerchant } from '@/features/merchant/hooks';
import { confirmAsync } from '@/lib/confirm';
import { errorKey } from '@/lib/errors';
import { formatCents } from '@/lib/money';
import { spacing } from '@/theme';

/** Réglages de livraison du restaurant : activation, prix de la course, zone, livreurs. */
export default function DeliverySettingsScreen() {
  const { t } = useTranslation();
  const merchant = useCurrentMerchant();
  const update = useUpdateMerchant(merchant.id);
  const couriers = useMerchantCouriers(merchant.id);
  const decisions = useCourierDecisions(merchant.id);

  const links = couriers.data ?? [];
  const requests = links.filter((l) => l.status === 'pending');
  const approved = links.filter((l) => l.status === 'approved');
  const feeChoices = [
    ...new Set<number>([...DELIVERY_FEE_CHOICES, merchant.delivery_fee_cents]),
  ].sort((a, b) => a - b);
  const radiusChoices = [
    ...new Set<number>([...DELIVERY_RADIUS_CHOICES, merchant.delivery_radius_m]),
  ].sort((a, b) => a - b);

  const remove = async (courierId: string) => {
    const ok = await confirmAsync({
      title: t('merchant.delivery.removeConfirmTitle'),
      message: t('merchant.delivery.removeConfirmBody'),
      confirmLabel: t('merchant.delivery.remove'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (ok) decisions.remove.mutate(courierId);
  };

  const mutationError = update.error ?? decisions.decide.error ?? decisions.remove.error;

  return (
    <Screen scroll>
      {!merchant.has_delivery_option && !merchant.delivery_enabled ? (
        <Card testID="delivery-requires-pro">
          <AppText variant="subtitle">{t('merchant.delivery.proTitle')}</AppText>
          <AppText variant="muted">{t('merchant.delivery.proBody')}</AppText>
          <Button
            variant="secondary"
            title={t('merchant.delivery.proAction')}
            onPress={() => router.push('/pro/account')}
          />
        </Card>
      ) : null}
      <Card>
        <SwitchRow
          testID="delivery-switch"
          label={t('merchant.delivery.enabled')}
          hint={t('merchant.delivery.enabledHint')}
          value={merchant.delivery_enabled}
          disabled={
            (!merchant.has_delivery_option && !merchant.delivery_enabled) ||
            (merchant.delivery_enabled && !merchant.offers_pickup)
          }
          onValueChange={(value) => update.mutate({ delivery_enabled: value })}
        />
        {merchant.delivery_enabled && !merchant.offers_pickup ? (
          <AppText variant="muted">{t('merchant.delivery.onlyModeHint')}</AppText>
        ) : null}
        {merchant.delivery_enabled && approved.length === 0 && !couriers.isPending ? (
          <AppText variant="error">{t('merchant.delivery.noCourierWarning')}</AppText>
        ) : null}
      </Card>

      <Card>
        <AppText variant="subtitle">{t('merchant.delivery.fee')}</AppText>
        <AppText variant="muted">{t('merchant.delivery.feeHint')}</AppText>
        <View style={styles.chips}>
          {feeChoices.map((cents) => (
            <Chip
              key={cents}
              label={formatCents(cents)}
              selected={merchant.delivery_fee_cents === cents}
              onPress={() => update.mutate({ delivery_fee_cents: cents })}
            />
          ))}
        </View>
        <AppText variant="subtitle">{t('merchant.delivery.radius')}</AppText>
        <AppText variant="muted">{t('merchant.delivery.radiusHint')}</AppText>
        <View style={styles.chips}>
          {radiusChoices.map((meters) => (
            <Chip
              key={meters}
              label={formatDistance(meters)}
              selected={merchant.delivery_radius_m === meters}
              onPress={() => update.mutate({ delivery_radius_m: meters })}
            />
          ))}
        </View>
      </Card>

      {requests.length > 0 ? (
        <>
          <AppText variant="subtitle">{t('merchant.delivery.requests')}</AppText>
          {requests.map((link) => (
            <Card key={link.courier_id} testID={`courier-request-${link.courier_id}`}>
              <AppText variant="subtitle">{link.couriers?.display_name}</AppText>
              {link.couriers ? (
                <AppText variant="muted">
                  {t('merchant.delivery.courierLine', {
                    vehicle: t(`courier.onboarding.vehicles.${link.couriers.vehicle}`),
                    phone: link.couriers.phone,
                  })}
                </AppText>
              ) : null}
              <View style={styles.row}>
                <Button
                  testID={`approve-courier-${link.courier_id}`}
                  title={t('merchant.delivery.approve')}
                  onPress={() =>
                    decisions.decide.mutate({ courierId: link.courier_id, approve: true })
                  }
                />
                <Button
                  variant="ghost"
                  title={t('merchant.delivery.reject')}
                  onPress={() =>
                    decisions.decide.mutate({ courierId: link.courier_id, approve: false })
                  }
                />
              </View>
            </Card>
          ))}
        </>
      ) : null}

      <AppText variant="subtitle">{t('merchant.delivery.couriers')}</AppText>
      {approved.length === 0 && !couriers.isPending ? (
        <AppText variant="muted">{t('merchant.delivery.couriersEmpty')}</AppText>
      ) : null}
      {approved.map((link) => (
        <Card key={link.courier_id}>
          <View style={styles.row}>
            <AppText variant="subtitle" style={styles.flex}>
              {link.couriers?.display_name}
            </AppText>
            <Badge
              label={
                link.couriers?.is_available
                  ? t('merchant.delivery.available')
                  : t('merchant.delivery.unavailable')
              }
              tone={link.couriers?.is_available ? 'success' : 'neutral'}
            />
          </View>
          {link.couriers ? (
            <AppText variant="muted">
              {t('merchant.delivery.courierLine', {
                vehicle: t(`courier.onboarding.vehicles.${link.couriers.vehicle}`),
                phone: link.couriers.phone,
              })}
            </AppText>
          ) : null}
          <Button
            variant="ghost"
            title={t('merchant.delivery.remove')}
            onPress={() => void remove(link.courier_id)}
          />
        </Card>
      ))}

      {mutationError ? <AppText variant="error">{t(errorKey(mutationError))}</AppText> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
