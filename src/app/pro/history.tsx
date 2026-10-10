import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';

import { AppText, Badge, Card, QueryState } from '@/components/ui';
import { useCurrentMerchant } from '@/features/merchant/hooks';
import { useOrderHistory } from '@/features/merchant-orders/hooks';
import { formatDay, formatTime } from '@/lib/dates';
import { formatCents } from '@/lib/money';
import { spacing, useThemeColors } from '@/theme';

export default function HistoryScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const merchant = useCurrentMerchant();
  const history = useOrderHistory(merchant.id);

  if (!history.data)
    return <QueryState error={history.error} onRetry={() => void history.refetch()} />;

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.list}
      data={history.data}
      keyExtractor={(o) => o.id}
      onRefresh={() => void history.refetch()}
      refreshing={history.isRefetching}
      ListEmptyComponent={<AppText variant="muted">{t('merchant.orders.historyEmpty')}</AppText>}
      renderItem={({ item: order }) => (
        <Card>
          <View style={styles.row}>
            <AppText variant="subtitle">
              {order.customer_name ?? t('merchant.orders.anonymousCustomer')} ·{' '}
              {formatCents(order.total_cents)}
            </AppText>
            <Badge
              label={t(`merchant.orders.statuses.${order.status}`)}
              tone={
                order.status === 'collected' || order.status === 'delivered'
                  ? 'success'
                  : order.status === 'out_for_delivery'
                    ? 'neutral'
                    : 'danger'
              }
            />
          </View>
          <AppText variant="muted">
            {formatDay(order.created_at)} · {formatTime(order.created_at)}
          </AppText>
          <AppText variant="muted">
            {order.order_items.map((i) => `${i.quantity} × ${i.name}`).join(', ')}
          </AppText>
          {order.refusal_reason ? <AppText variant="muted">{order.refusal_reason}</AppText> : null}
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, gap: spacing.sm, width: '100%', maxWidth: 720, alignSelf: 'center' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
