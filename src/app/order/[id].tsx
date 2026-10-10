import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, QueryState, Screen } from '@/components/ui';
import { useCart } from '@/features/cart/store';
import { directionsUrl } from '@/features/discover/location';
import { NotificationsPrompt } from '@/features/notifications/NotificationsPrompt';
import { cancelMyOrder } from '@/features/orders/api';
import { DepartureCard } from '@/features/orders/DepartureCard';
import { useOrder } from '@/features/orders/hooks';
import { confirmAsync } from '@/lib/confirm';
import { formatDay, formatTime } from '@/lib/dates';
import { errorKey } from '@/lib/errors';
import { formatCents } from '@/lib/money';
import { radius, spacing, useThemeColors } from '@/theme';

const PICKUP_STEPS = ['placed', 'accepted', 'preparing', 'ready', 'collected'] as const;
const DELIVERY_STEPS = [
  'placed',
  'accepted',
  'preparing',
  'ready',
  'out_for_delivery',
  'delivered',
] as const;

export default function OrderScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { id, paid } = useLocalSearchParams<{ id: string; paid?: string }>();
  const query = useOrder(id);
  const order = query.data;
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Retour de Stripe Checkout (web) après paiement : le panier a été commandé.
  const merchantId = order?.merchant_id;
  useEffect(() => {
    if (paid && merchantId && useCart.getState().merchant?.id === merchantId)
      useCart.getState().clear();
  }, [paid, merchantId]);

  const cancel = async () => {
    const ok = await confirmAsync({
      title: t('client.order.cancelConfirmTitle'),
      message: t('client.order.cancelConfirmBody'),
      confirmLabel: t('client.order.cancelConfirmAction'),
      cancelLabel: t('client.order.keep'),
      destructive: true,
    });
    if (!ok) return;
    setCancelError(null);
    setCancelling(true);
    try {
      await cancelMyOrder(id);
      await query.refetch();
    } catch (e) {
      setCancelError(t(errorKey(e)));
    } finally {
      setCancelling(false);
    }
  };

  if (!order) return <QueryState error={query.error} onRetry={() => void query.refetch()} />;

  const isDelivery = order.fulfillment === 'delivery';
  const steps: readonly string[] = isDelivery ? DELIVERY_STEPS : PICKUP_STEPS;
  const stepIndex = order.status === 'pending_payment' ? -1 : steps.indexOf(order.status);
  const failed = stepIndex === -1 && order.status !== 'pending_payment';
  const done = order.status === 'collected' || order.status === 'delivered';
  const canCancel = order.status === 'pending_payment' || order.status === 'placed';
  // « Je pars maintenant » : seulement quand le client vient chercher sa commande.
  const canDepart =
    !isDelivery && ['placed', 'accepted', 'preparing', 'ready'].includes(order.status);
  const courier = order.courier_name ?? '';
  const statusText =
    isDelivery && order.status === 'placed'
      ? t('client.order.status.placedDelivery')
      : isDelivery && order.status === 'accepted'
        ? t('client.order.status.acceptedDelivery', { courier })
        : t(`client.order.status.${order.status}`, {
            time: formatTime(order.estimated_ready_at),
            courier,
          });
  const deliveryAddress = [
    order.delivery_address_line,
    [order.delivery_postal_code, order.delivery_city].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ');
  // Menus formules payés de cette commande, ajoutés à la carte à la remise.
  const earnedMenus = order.order_items
    .filter((i) => i.is_loyalty_menu && !i.is_loyalty_reward)
    .reduce((sum, i) => sum + i.quantity, 0);
  const merchant = order.merchants;

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: t('client.order.title'), headerShown: true }} />
      <AppText variant="title">{merchant?.name}</AppText>
      <AppText variant="muted">
        {t('client.order.placedAt', {
          date: formatDay(order.created_at),
          time: formatTime(order.created_at),
        })}
      </AppText>

      <Card testID="order-status">
        <AppText variant={failed ? 'error' : 'subtitle'}>{statusText}</AppText>
        {order.refusal_reason ? (
          <AppText variant="muted">
            {t('client.order.reason', { reason: order.refusal_reason })}
          </AppText>
        ) : null}
        {!failed ? (
          <View style={styles.steps}>
            {steps.map((step, index) => {
              // « En préparation » est facultatif : le commerçant peut passer directement à « prête ».
              const reached = index <= stepIndex;
              return (
                <View key={step} style={styles.step}>
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: reached ? colors.brand : colors.border },
                    ]}
                  />
                  <AppText variant={reached ? 'body' : 'muted'}>
                    {t(
                      `client.order.steps.${step as (typeof DELIVERY_STEPS | typeof PICKUP_STEPS)[number]}`,
                    )}
                  </AppText>
                </View>
              );
            })}
          </View>
        ) : null}
      </Card>

      {!failed && !done && !isDelivery ? (
        <Card style={styles.codeCard}>
          <AppText variant="muted">{t('client.order.pickupCode')}</AppText>
          <AppText testID="pickup-code" style={[styles.code, { color: colors.text }]} selectable>
            {order.pickup_code}
          </AppText>
          <AppText variant="muted" style={styles.center}>
            {t('client.order.pickupCodeHint')}
          </AppText>
        </Card>
      ) : null}

      {!failed && !done && isDelivery && order.delivery_code ? (
        <Card style={styles.codeCard}>
          <AppText variant="muted">{t('client.order.deliveryCode')}</AppText>
          <AppText testID="delivery-code" style={[styles.code, { color: colors.text }]} selectable>
            {order.delivery_code}
          </AppText>
          <AppText variant="muted" style={styles.center}>
            {t('client.order.deliveryCodeHint')}
          </AppText>
        </Card>
      ) : null}

      {isDelivery ? (
        <Card testID="delivery-info">
          {deliveryAddress ? (
            <AppText>{t('client.order.deliveryTo', { address: deliveryAddress })}</AppText>
          ) : null}
          {courier ? (
            <AppText variant="muted">{t('client.order.courier', { name: courier })}</AppText>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <AppText variant="subtitle">{t('client.order.items')}</AppText>
        {order.order_items.map((item) => (
          <View key={item.id} style={styles.line}>
            <View style={styles.flex}>
              <AppText>
                {item.quantity} × {item.name}
              </AppText>
              {item.options.length ? (
                <AppText variant="muted">{item.options.map((o) => o.name).join(', ')}</AppText>
              ) : null}
              {item.is_loyalty_reward ? (
                <AppText variant="link">🎁 {t('client.loyalty.rewardApplied')}</AppText>
              ) : null}
            </View>
            <AppText>{formatCents(item.line_total_cents)}</AppText>
          </View>
        ))}
        {order.customer_note ? <AppText variant="muted">« {order.customer_note} »</AppText> : null}
        {order.discount_cents > 0 ? (
          <View style={styles.line}>
            <AppText style={styles.flex}>{t('client.loyalty.rewardApplied')}</AppText>
            <AppText testID="order-discount">− {formatCents(order.discount_cents)}</AppText>
          </View>
        ) : null}
        {isDelivery ? (
          <View style={styles.line}>
            <AppText style={styles.flex}>{t('client.order.deliveryFee')}</AppText>
            <AppText>{formatCents(order.delivery_fee_cents)}</AppText>
          </View>
        ) : null}
        <View style={styles.line}>
          <AppText variant="subtitle" style={styles.flex}>
            {isDelivery ? t('client.order.totalPaid') : t('client.cart.total')}
          </AppText>
          <AppText variant="subtitle" testID="order-total">
            {formatCents(order.total_cents + order.delivery_fee_cents)}
          </AppText>
        </View>
      </Card>

      {canDepart ? (
        <DepartureCard
          orderId={order.id}
          etaAt={order.customer_eta_at}
          onAnnounced={() => void query.refetch()}
        />
      ) : null}
      {canDepart ? <NotificationsPrompt audience="client" /> : null}

      {isDelivery &&
      ['placed', 'accepted', 'preparing', 'ready', 'out_for_delivery'].includes(order.status) ? (
        <NotificationsPrompt audience="client" />
      ) : null}

      {done && earnedMenus > 0 ? (
        <Card testID="loyalty-earned">
          <AppText variant="link">{t('client.loyalty.earned', { count: earnedMenus })}</AppText>
          <Button
            variant="ghost"
            title={t('client.loyalty.title')}
            onPress={() => router.push('/loyalty')}
          />
        </Card>
      ) : null}

      {canCancel ? (
        <Button
          testID="cancel-order"
          variant="ghost"
          title={t('client.order.cancel')}
          loading={cancelling}
          onPress={() => void cancel()}
        />
      ) : null}
      {cancelError ? <AppText variant="error">{cancelError}</AppText> : null}

      {merchant ? (
        <>
          <AppText variant="muted">
            {merchant.address_line}, {merchant.city}
          </AppText>
          {!isDelivery ? (
            <Button
              variant="secondary"
              title={t('client.merchant.directions')}
              onPress={() =>
                void Linking.openURL(
                  directionsUrl(Platform.OS, merchant.latitude, merchant.longitude),
                )
              }
            />
          ) : null}
          <Button
            variant="ghost"
            title={t('client.order.orderAgain')}
            onPress={() => router.push({ pathname: '/m/[slug]', params: { slug: merchant.slug } })}
          />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  steps: { gap: spacing.sm, marginTop: spacing.sm },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 12, height: 12, borderRadius: 6 },
  codeCard: { alignItems: 'center' },
  code: { fontSize: 44, fontWeight: '800', letterSpacing: 8, borderRadius: radius.md },
  center: { textAlign: 'center' },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
