import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Badge, Button, Card, QueryState, Screen, SwitchRow } from '@/components/ui';
import { ProUpsell } from '@/features/billing/ProUpsell';
import { useMerchantPlan } from '@/features/billing/useMerchantPlan';
import type { HappyHour } from '@/features/happyhour/api';
import { useHappyHourActions, useHappyHours } from '@/features/happyhour/hooks';
import { groupSlots, describeWeekdays } from '@/features/menu/slots';
import { useCurrentMerchant } from '@/features/merchant/hooks';
import { formatFrenchDate } from '@/features/merchant/dates';
import { confirmAsync } from '@/lib/confirm';
import { errorKey } from '@/lib/errors';
import { spacing } from '@/theme';

/** Offres Happy Hour du commerçant : activation, modification, suppression. */
export default function HappyHoursScreen() {
  const { t } = useTranslation();
  const merchant = useCurrentMerchant();
  const offers = useHappyHours(merchant.id);
  const actions = useHappyHourActions(merchant.id);
  const plan = useMerchantPlan(merchant.id);

  if (!plan.isLoading && !plan.has('happy_hours')) {
    return (
      <Screen scroll>
        <ProUpsell feature={t('merchant.happyHours.proFeature')} />
        {offers.data && offers.data.length > 0 ? (
          <AppText variant="muted">{t('merchant.happyHours.keptWhenNotPro')}</AppText>
        ) : null}
      </Screen>
    );
  }

  if (!offers.data)
    return <QueryState error={offers.error} onRetry={() => void offers.refetch()} />;

  const dayNames = [1, 2, 3, 4, 5, 6, 7].map((d) =>
    t(`merchant.hours.days.${d as 1}`)
      .slice(0, 3)
      .toLowerCase(),
  );

  const remove = async (offer: HappyHour) => {
    const ok = await confirmAsync({
      title: t('common.delete'),
      message: t('merchant.happyHours.deleteConfirm', { name: offer.name }),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (ok) actions.remove.mutate(offer.id);
  };

  return (
    <Screen scroll>
      <AppText variant="muted">{t('merchant.happyHours.hint')}</AppText>
      <Button
        testID="happy-hour-new"
        title={t('merchant.happyHours.new')}
        onPress={() => router.push({ pathname: '/pro/happy-hour/[id]', params: { id: 'new' } })}
      />

      {offers.data.length === 0 ? (
        <AppText variant="muted">{t('merchant.happyHours.empty')}</AppText>
      ) : null}

      {offers.data.map((offer) => (
        <Card key={offer.id} testID={`happy-hour-${offer.name}`}>
          <View style={styles.header}>
            <AppText variant="subtitle" style={styles.flex}>
              {offer.name}
            </AppText>
            <Badge
              label={
                offer.discount_type === 'percent'
                  ? `−${offer.percent_off} %`
                  : t('merchant.happyHours.fixedPrice')
              }
              tone="warning"
            />
          </View>
          <AppText variant="muted">
            {groupSlots(offer.happy_hour_slots)
              .map(
                (g) =>
                  `${describeWeekdays(g.weekdays, dayNames, t('client.merchant.everyDay'))} ${g.starts_at}–${g.ends_at}`,
              )
              .join(' · ')}
          </AppText>
          <AppText variant="muted">
            {t('merchant.happyHours.products', { count: offer.happy_hour_items.length })}
            {' · '}
            {offer.applies_to_pickup && offer.applies_to_delivery
              ? t('merchant.happyHours.modeBoth')
              : offer.applies_to_pickup
                ? t('merchant.happyHours.modePickup')
                : t('merchant.happyHours.modeDelivery')}
          </AppText>
          {offer.starts_on || offer.ends_on ? (
            <AppText variant="muted">
              {t('merchant.happyHours.validity', {
                from: offer.starts_on ? formatFrenchDate(offer.starts_on) : '…',
                to: offer.ends_on ? formatFrenchDate(offer.ends_on) : '…',
              })}
            </AppText>
          ) : null}
          {offer.quantity_limit ? (
            <AppText variant="muted">
              {t('merchant.happyHours.stock', {
                used: offer.quantity_used,
                limit: offer.quantity_limit,
              })}
            </AppText>
          ) : null}
          <SwitchRow
            label={t('merchant.happyHours.active')}
            value={offer.is_active}
            onValueChange={(active) => actions.setActive.mutate({ id: offer.id, active })}
          />
          <View style={styles.actions}>
            <Button
              variant="secondary"
              title={t('common.edit')}
              onPress={() =>
                router.push({ pathname: '/pro/happy-hour/[id]', params: { id: offer.id } })
              }
            />
            <Button variant="ghost" title={t('common.delete')} onPress={() => void remove(offer)} />
          </View>
        </Card>
      ))}
      {actions.setActive.error || actions.remove.error ? (
        <AppText variant="error">
          {t(errorKey(actions.setActive.error ?? actions.remove.error))}
        </AppText>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  actions: { flexDirection: 'row', gap: spacing.sm },
});
