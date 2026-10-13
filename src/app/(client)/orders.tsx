import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Badge, Card, QueryState, Screen } from '@/components/ui';
import { ACTIVE_STATUSES } from '@/features/merchant-orders/types';
import type { CustomerOrder } from '@/features/orders/api';
import { useMyOrders } from '@/features/orders/hooks';
import { formatDay, formatTime } from '@/lib/dates';
import { formatCents } from '@/lib/money';
import { spacing } from '@/theme';

function OrderRow({ order }: { order: CustomerOrder }) {
  const { t } = useTranslation();
  const tone =
    order.status === 'ready' || order.status === 'collected' || order.status === 'delivered'
      ? 'success'
      : order.status === 'refused' || order.status === 'expired' || order.status === 'cancelled'
        ? 'danger'
        : 'warning';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/order/[id]', params: { id: order.id } })}>
      <Card>
        <View style={styles.row}>
          <AppText variant="subtitle" style={styles.flex}>
            {order.merchants?.name}
          </AppText>
          <Badge label={t(`merchant.orders.statuses.${order.status}`)} tone={tone} />
        </View>
        <AppText variant="muted">
          {formatDay(order.created_at)} · {formatTime(order.created_at)} ·{' '}
          {formatCents(order.total_cents + order.delivery_fee_cents)}
          {order.fulfillment === 'delivery' ? ' · 🛵' : ''}
        </AppText>
      </Card>
    </Pressable>
  );
}

export default function OrdersScreen() {
  const { t } = useTranslation();
  const orders = useMyOrders();
  if (!orders.data)
    return <QueryState error={orders.error} onRetry={() => void orders.refetch()} />;

  // Une commande en route vers le client est encore « en cours » pour lui.
  const isActive = (o: CustomerOrder) =>
    o.status === 'out_for_delivery' || (ACTIVE_STATUSES as readonly string[]).includes(o.status);
  const active = orders.data.filter(isActive);
  const past = orders.data.filter((o) => !isActive(o));

  return (
    <Screen scroll>
      <AppText variant="title">{t('client.orders.title')}</AppText>
      {orders.data.length === 0 ? (
        <AppText variant="muted">{t('client.orders.empty')}</AppText>
      ) : null}
      {active.length > 0 ? <AppText variant="subtitle">{t('client.orders.active')}</AppText> : null}
      {active.map((o) => (
        <OrderRow key={o.id} order={o} />
      ))}
      {past.length > 0 ? <AppText variant="subtitle">{t('client.orders.past')}</AppText> : null}
      {past.map((o) => (
        <OrderRow key={o.id} order={o} />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
