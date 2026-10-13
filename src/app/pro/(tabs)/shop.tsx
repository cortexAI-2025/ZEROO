import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Chip, ListRow, Screen, SwitchRow } from '@/components/ui';
import { useBilling } from '@/features/billing/billing';
import { BillingCards } from '@/features/billing/BillingCards';
import { formatDistance } from '@/features/discover/location';
import {
  useCurrentMerchant,
  useMyMerchant,
  useOpeningHours,
  useUpdateMerchant,
} from '@/features/merchant/hooks';
import { useMenu } from '@/features/menu/hooks';
import { PaymentLinkCard } from '@/features/payments/PaymentLinkCard';
import { formatTime } from '@/lib/dates';
import { errorKey } from '@/lib/errors';
import { formatCents } from '@/lib/money';
import { useRefreshOnFocus } from '@/lib/useRefreshOnFocus';
import { spacing } from '@/theme';

const PAUSE_CHOICES = [15, 30, 60];

/** Fin de pause : dans `minutes` minutes, ou null pour une pause sans limite. */
function pauseEnd(minutes: number | null) {
  return minutes ? new Date(Date.now() + minutes * 60_000).toISOString() : null;
}

export default function ShopScreen() {
  const { t } = useTranslation();
  const merchant = useCurrentMerchant();
  const update = useUpdateMerchant(merchant.id);
  const hours = useOpeningHours(merchant.id);
  const menu = useMenu(merchant.id);
  const { refetch: refetchMerchant } = useMyMerchant();
  const { refetch: refetchBilling } = useBilling({ role: 'merchant', id: merchant.id });
  useRefreshOnFocus(refetchMerchant);
  useRefreshOnFocus(refetchBilling);

  const hasAvailableItem = (menu.data ?? []).some(
    (c) => c.is_active && c.menu_items.some((i) => i.is_available),
  );
  const hasHours = (hours.data ?? []).length > 0;
  const canPublish = hasAvailableItem && hasHours;

  const pause = (minutes: number | null) =>
    update.mutate({
      is_paused: true,
      paused_until: pauseEnd(minutes),
    });

  return (
    <Screen scroll>
      <AppText variant="title">{t('merchant.shop.title')}</AppText>

      <PaymentLinkCard
        role="merchant"
        link={merchant.payment_link}
        onSave={(link) => update.mutateAsync({ payment_link: link })}
      />
      <BillingCards target={{ role: 'merchant', id: merchant.id }} />

      <Card>
        <SwitchRow
          testID="publish-switch"
          label={t('merchant.shop.visibility')}
          hint={t('merchant.shop.visibilityHint')}
          value={merchant.is_published}
          disabled={!merchant.is_published && !canPublish}
          onValueChange={(value) => update.mutate({ is_published: value })}
        />
        {!merchant.is_published && !canPublish && !menu.isPending && !hours.isPending ? (
          <AppText variant="muted">{t('merchant.shop.publishBlocked')}</AppText>
        ) : null}
      </Card>

      <Card>
        <AppText variant="subtitle">{t('merchant.shop.pause')}</AppText>
        {merchant.is_paused_now ? (
          <>
            <AppText testID="pause-status">
              {merchant.paused_until
                ? t('merchant.shop.pausedUntil', { time: formatTime(merchant.paused_until) })
                : t('merchant.shop.pausedIndefinitely')}
            </AppText>
            <Button
              title={t('merchant.shop.resume')}
              loading={update.isPending}
              onPress={() => update.mutate({ is_paused: false, paused_until: null })}
            />
          </>
        ) : (
          <>
            <AppText variant="muted">{t('merchant.shop.pauseHint')}</AppText>
            <View style={styles.chips}>
              {PAUSE_CHOICES.map((m) => (
                <Chip
                  key={m}
                  label={t('merchant.shop.pauseFor', { count: m })}
                  onPress={() => pause(m)}
                />
              ))}
              <Chip label={t('merchant.shop.pauseIndefinitely')} onPress={() => pause(null)} />
            </View>
          </>
        )}
      </Card>

      <Card>
        <SwitchRow
          testID="cash-pickup-switch"
          label={t('merchant.shop.cashPickup')}
          hint={t('merchant.shop.cashPickupHint')}
          value={merchant.accepts_cash_pickup}
          onValueChange={(value) => update.mutate({ accepts_cash_pickup: value })}
        />
      </Card>

      {update.error ? <AppText variant="error">{t(errorKey(update.error))}</AppText> : null}

      <View>
        <ListRow
          title={t('merchant.shop.info')}
          subtitle={merchant.name}
          onPress={() => router.push('/pro/info')}
        />
        <ListRow title={t('merchant.shop.hours')} onPress={() => router.push('/pro/hours')} />
        <ListRow
          testID="delivery-settings"
          title={t('merchant.shop.delivery')}
          subtitle={
            merchant.delivery_enabled
              ? t('merchant.delivery.shopRowOn', {
                  price: formatCents(merchant.delivery_fee_cents),
                  distance: formatDistance(merchant.delivery_radius_m),
                })
              : t('merchant.delivery.shopRowOff')
          }
          onPress={() => router.push('/pro/delivery')}
        />
        <ListRow title={t('merchant.shop.qr')} onPress={() => router.push('/pro/qr')} />
        <ListRow title={t('merchant.shop.history')} onPress={() => router.push('/pro/history')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
