import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Card, Screen } from '@/components/ui';
import { useCurrentCourier, useDeliveredRuns, useEarnings } from '@/features/courier/hooks';
import { formatDay, formatTime } from '@/lib/dates';
import { formatCents } from '@/lib/money';
import { useRefreshOnFocus } from '@/lib/useRefreshOnFocus';
import { spacing } from '@/theme';

/** Revenus du livreur : courses livrées, payées directement par les clients. */
export default function CourierEarningsScreen() {
  const { t } = useTranslation();
  const courier = useCurrentCourier();
  const earnings = useEarnings(courier.id);
  const delivered = useDeliveredRuns(courier.id);
  useRefreshOnFocus(earnings.refetch);
  useRefreshOnFocus(delivered.refetch);
  const e = earnings.data;

  const tiles = [
    { label: t('courier.earnings.today'), cents: e?.today_cents, count: e?.today_count },
    { label: t('courier.earnings.week'), cents: e?.week_cents },
    { label: t('courier.earnings.month'), cents: e?.month_cents, count: e?.month_count },
  ];

  return (
    <Screen scroll>
      <AppText variant="title">{t('courier.earnings.title')}</AppText>
      <View style={styles.tiles}>
        {tiles.map((tile) => (
          <Card key={tile.label} style={styles.tile}>
            <AppText variant="muted">{tile.label}</AppText>
            <AppText variant="subtitle" testID={`earnings-${tile.label}`}>
              {formatCents(tile.cents ?? 0)}
            </AppText>
            {tile.count !== undefined ? (
              <AppText variant="muted">{t('courier.earnings.runs', { count: tile.count })}</AppText>
            ) : null}
          </Card>
        ))}
      </View>
      <AppText variant="muted">{t('courier.earnings.info')}</AppText>

      <AppText variant="subtitle">{t('courier.earnings.history')}</AppText>
      {(delivered.data ?? []).length === 0 && !delivered.isPending ? (
        <AppText variant="muted">{t('courier.earnings.empty')}</AppText>
      ) : null}
      {(delivered.data ?? []).map((run) => (
        <View key={run.id} style={styles.line}>
          <View style={styles.flex}>
            <AppText>{run.merchants?.name}</AppText>
            <AppText variant="muted">
              {run.delivered_at
                ? `${formatDay(run.delivered_at)} · ${formatTime(run.delivered_at)}`
                : ''}
              {run.delivery_city ? ` · ${run.delivery_city}` : ''}
            </AppText>
          </View>
          <AppText>{formatCents(run.delivery_fee_cents)}</AppText>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { flexGrow: 1, flexBasis: 100 },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
