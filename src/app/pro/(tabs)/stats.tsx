import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, BarChart, Card, ListRow, Screen, Stars } from '@/components/ui';
import { ProUpsell } from '@/features/billing/ProUpsell';
import { useMerchantPlan } from '@/features/billing/useMerchantPlan';
import {
  useAdvancedStats,
  useCurrentMerchant,
  useSalesByDay,
  useTodaySummary,
  useTopItems,
} from '@/features/merchant/hooks';
import { useMerchantRatings, useMerchantReviews } from '@/features/reviews/hooks';
import { ReviewList } from '@/features/reviews/ReviewList';
import { formatCents } from '@/lib/money';
import { useRefreshOnFocus } from '@/lib/useRefreshOnFocus';
import { spacing } from '@/theme';

const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');

/** Activité du restaurant : ventes du jour et de la semaine, meilleurs produits, note et avis. */
export default function MerchantStatsScreen() {
  const { t } = useTranslation();
  const merchant = useCurrentMerchant();
  const today = useTodaySummary(merchant.id);
  const sales = useSalesByDay(merchant.id);
  const top = useTopItems(merchant.id);
  const rating = useMerchantRatings([merchant.id]).data?.get(merchant.id);
  const reviews = useMerchantReviews(merchant.id);
  const plan = useMerchantPlan(merchant.id);
  const advanced = useAdvancedStats(merchant.id, plan.has('advanced_stats'));
  useRefreshOnFocus(today.refetch);
  useRefreshOnFocus(sales.refetch);
  useRefreshOnFocus(top.refetch);
  useRefreshOnFocus(reviews.refetch);

  const days = sales.data ?? [];
  const weekRevenue = days.reduce((sum, d) => sum + Number(d.revenue_cents), 0);
  const weekOrders = days.reduce((sum, d) => sum + d.orders_count, 0);
  const todayRow = today.data;

  return (
    <Screen scroll>
      <AppText variant="title">{t('merchant.stats.title')}</AppText>
      <View style={styles.tiles}>
        <Card style={styles.tile}>
          <AppText variant="muted">{t('merchant.stats.today')}</AppText>
          <AppText variant="subtitle" testID="stats-today">
            {formatCents(Number(todayRow?.revenue_cents ?? 0))}
          </AppText>
          <AppText variant="muted">
            {t('merchant.stats.orders', { count: todayRow?.orders_count ?? 0 })}
          </AppText>
        </Card>
        <Card style={styles.tile}>
          <AppText variant="muted">{t('merchant.stats.week')}</AppText>
          <AppText variant="subtitle">{formatCents(weekRevenue)}</AppText>
          <AppText variant="muted">{t('merchant.stats.orders', { count: weekOrders })}</AppText>
        </Card>
        <Card style={styles.tile}>
          <AppText variant="muted">{t('merchant.stats.basket')}</AppText>
          <AppText variant="subtitle">
            {weekOrders > 0 ? formatCents(Math.round(weekRevenue / weekOrders)) : '–'}
          </AppText>
          <AppText variant="muted">{t('merchant.stats.basketHint')}</AppText>
        </Card>
      </View>

      <Card>
        <AppText variant="subtitle">{t('merchant.stats.chart')}</AppText>
        {days.length > 0 ? (
          <BarChart
            bars={days.map((d) => ({ label: dayLabel(d.day), value: Number(d.revenue_cents) }))}
            format={(cents) => formatCents(cents)}
          />
        ) : null}
        <AppText variant="muted">{t('merchant.stats.noCommission')}</AppText>
      </Card>

      <Card>
        <AppText variant="subtitle">{t('merchant.stats.topItems')}</AppText>
        {(top.data ?? []).length === 0 ? (
          <AppText variant="muted">{t('merchant.stats.noSales')}</AppText>
        ) : (
          top.data?.map((item, i) => (
            <View key={item.name} style={styles.line}>
              <AppText style={styles.flex}>
                {i + 1}. {item.name}
              </AppText>
              <AppText variant="muted">× {Number(item.quantity)}</AppText>
              <AppText>{formatCents(Number(item.revenue_cents))}</AppText>
            </View>
          ))
        )}
      </Card>

      {plan.has('advanced_stats') ? (
        <Card testID="advanced-stats">
          <AppText variant="subtitle">{t('merchant.stats.advanced.title')}</AppText>
          {advanced.data && advanced.data.orders_count > 0 ? (
            <>
              <AppText>
                {t('merchant.stats.advanced.orders')} : {advanced.data.orders_count} ·{' '}
                {t('merchant.stats.advanced.revenue')} : {formatCents(advanced.data.revenue_cents)}{' '}
                · {t('merchant.stats.advanced.basket')} :{' '}
                {formatCents(advanced.data.average_basket_cents)}
              </AppText>
              <AppText>
                {t('merchant.stats.advanced.pickup')} : {advanced.data.pickup_orders} ·{' '}
                {t('merchant.stats.advanced.delivery')} : {advanced.data.delivery_orders} ·{' '}
                {t('merchant.stats.advanced.scheduled')} : {advanced.data.scheduled_orders} ·{' '}
                {t('merchant.stats.advanced.group')} : {advanced.data.group_orders}
              </AppText>
              <AppText>
                {t('merchant.stats.advanced.customers')} : {advanced.data.unique_customers} (
                {t('merchant.stats.advanced.returning')} : {advanced.data.returning_customers})
              </AppText>
              <AppText variant="muted">
                {t('merchant.stats.advanced.lost')} : {advanced.data.cancelled_or_refused_count} ·{' '}
                {t('merchant.stats.advanced.happyHour')} : {advanced.data.happy_hour_units}
              </AppText>
              <AppText variant="subtitle">{t('merchant.stats.advanced.peakHours')}</AppText>
              <BarChart
                bars={advanced.data.peak_hours.map((h) => ({
                  label: `${h.hour}h`,
                  value: h.orders,
                }))}
                format={(n) => String(n)}
              />
            </>
          ) : (
            <AppText variant="muted">{t('merchant.stats.advanced.none')}</AppText>
          )}
        </Card>
      ) : plan.isLoading ? null : (
        <ProUpsell feature={t('merchant.stats.advanced.proFeature')} />
      )}

      <Card testID="merchant-rating">
        <AppText variant="subtitle">{t('merchant.stats.rating')}</AppText>
        {rating ? (
          <View style={styles.line}>
            <Stars value={rating.average} size={20} />
            <AppText variant="subtitle">{rating.average.toFixed(1).replace('.', ',')}</AppText>
            <AppText variant="muted">{t('reviews.count', { count: rating.count })}</AppText>
          </View>
        ) : null}
        <ReviewList reviews={reviews.data ?? []} starsOf={(r) => r.merchant_stars} />
      </Card>

      <Card>
        <ListRow title={t('merchant.orders.history')} onPress={() => router.push('/pro/history')} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { flexGrow: 1, flexBasis: 100 },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
