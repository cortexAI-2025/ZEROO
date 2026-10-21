import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Badge, Button, Card, Chip, TextField } from '@/components/ui';
import { formatDistance } from '@/features/discover/location';
import { cancelUnclaimedDelivery, isDeliveryUnclaimed } from '@/features/orders/api';
import { confirmMealPayment } from '@/features/payments/pay';
import { confirmAsync } from '@/lib/confirm';
import { formatTime } from '@/lib/dates';
import { errorKey } from '@/lib/errors';
import { formatCents } from '@/lib/money';
import { prepAdvice } from '@/lib/prepTiming';
import { useNow } from '@/lib/useNow';
import { spacing } from '@/theme';

import type { StatusChange } from './api';
import { type Order, PREP_TIME_CHOICES } from './types';

const REFUSAL_REASONS = ['outOfStock', 'tooBusy', 'closingSoon', 'other'] as const;

type Props = {
  order: Order;
  defaultPrepMinutes: number;
  onChange: (change: StatusChange) => Promise<void>;
};

export function OrderCard({ order, defaultPrepMinutes, onChange }: Props) {
  const { t } = useTranslation();
  const [prepMinutes, setPrepMinutes] = useState(defaultPrepMinutes);
  const [refusing, setRefusing] = useState(false);
  const [pickupCode, setPickupCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = useNow();
  const travelIcon = { walk: '🚶', bike: '🚲', drive: '🚗' }[order.customer_travel_mode ?? 'walk'];
  // Conseil de préparation : une fois la commande acceptée et le client en route.
  const advice =
    order.customer_eta_at && order.status === 'accepted'
      ? prepAdvice(order.customer_eta_at, order.prep_minutes ?? defaultPrepMinutes, now)
      : null;

  const isDelivery = order.fulfillment === 'delivery';
  const courierName = order.courier_name ?? '';
  // Une livraison ne peut être acceptée qu'après la confirmation du livreur.
  const waitingCourier = isDelivery && order.status === 'placed' && !order.courier_accepted_at;

  const prepChoices = [...new Set<number>([...PREP_TIME_CHOICES, defaultPrepMinutes])].sort(
    (a, b) => a - b,
  );

  const run = async (change: Omit<StatusChange, 'orderId'>) => {
    setError(null);
    setBusy(true);
    try {
      await onChange({ orderId: order.id, ...change });
    } catch (e) {
      setError(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card testID={`order-${order.pickup_code}`}>
      <View style={styles.header}>
        <AppText variant="subtitle">
          {t('merchant.orders.orderOf', {
            name: order.customer_name ?? t('merchant.orders.anonymousCustomer'),
          })}
        </AppText>
        <Badge
          label={t(`merchant.orders.statuses.${order.status}`)}
          tone={
            order.status === 'placed' ? 'warning' : order.status === 'ready' ? 'success' : 'neutral'
          }
        />
      </View>
      <AppText variant="muted">
        {order.status === 'placed' || !order.estimated_ready_at
          ? t('merchant.orders.receivedAt', {
              time: formatTime(order.placed_at ?? order.created_at),
            })
          : t('merchant.orders.readyAt', { time: formatTime(order.estimated_ready_at) })}
      </AppText>

      {isDelivery ? (
        <>
          <AppText testID={`delivery-${order.pickup_code}`}>
            {t('merchant.orders.delivery', {
              city: order.delivery_city ?? '',
              distance: formatDistance(order.delivery_distance_m ?? 0),
            })}
          </AppText>
          {order.status === 'placed' ? (
            <AppText variant={waitingCourier ? 'muted' : 'link'}>
              {waitingCourier
                ? t('merchant.orders.courierWaiting', { name: courierName })
                : t('merchant.orders.courierConfirmed', { name: courierName })}
            </AppText>
          ) : null}
        </>
      ) : null}

      {isDeliveryUnclaimed(order) ? <UnclaimedDelivery order={order} /> : null}

      <MealPayment order={order} />

      {order.customer_eta_at &&
      ['placed', 'accepted', 'preparing', 'ready'].includes(order.status) ? (
        <AppText testID={`eta-${order.pickup_code}`}>
          {t('merchant.orders.eta', {
            icon: travelIcon,
            time: formatTime(order.customer_eta_at),
            count: Math.max(0, Math.round((Date.parse(order.customer_eta_at) - now) / 60_000)),
          })}
        </AppText>
      ) : null}
      {advice ? (
        <AppText
          variant={advice.kind === 'start_now' ? 'link' : 'muted'}
          testID={`advice-${order.pickup_code}`}>
          {advice.kind === 'start_now'
            ? t('merchant.orders.startNow')
            : t('merchant.orders.startLater', { count: advice.startInMinutes })}
        </AppText>
      ) : null}

      {order.order_items.map((item) => (
        <View key={item.id}>
          <AppText>
            {item.quantity} × {item.name}
          </AppText>
          {item.options.length > 0 ? (
            <AppText variant="muted">{item.options.map((o) => o.name).join(', ')}</AppText>
          ) : null}
          {item.is_loyalty_reward ? (
            <AppText variant="link">{t('merchant.orders.rewardLine')}</AppText>
          ) : null}
          {item.happy_hour_name && item.regular_unit_cents !== null ? (
            <AppText variant="link">
              {t('happyHour.applied', {
                name: item.happy_hour_name,
                price: formatCents(item.unit_price_cents),
                regular: formatCents(item.regular_unit_cents),
              })}
            </AppText>
          ) : null}
        </View>
      ))}
      {order.customer_note ? (
        <AppText variant="link">{t('merchant.orders.note', { note: order.customer_note })}</AppText>
      ) : null}
      {order.discount_cents > 0 ? (
        <AppText variant="muted">
          {t('merchant.orders.discount')} : − {formatCents(order.discount_cents)}
        </AppText>
      ) : null}
      <AppText variant="subtitle">
        {t('merchant.orders.total')} : {formatCents(order.total_cents)}
      </AppText>

      {order.status === 'placed' && !refusing ? (
        <>
          <AppText variant="muted">{t('merchant.orders.prepTime')}</AppText>
          <View style={styles.chips}>
            {prepChoices.map((m) => (
              <Chip
                key={m}
                label={t('common.minutes', { count: m })}
                selected={prepMinutes === m}
                onPress={() => setPrepMinutes(m)}
              />
            ))}
          </View>
          <Button
            testID={`accept-${order.pickup_code}`}
            title={t('merchant.orders.accept', { count: prepMinutes })}
            loading={busy}
            disabled={waitingCourier}
            onPress={() => void run({ status: 'accepted', prepMinutes })}
          />
          {waitingCourier ? (
            <AppText variant="muted">{t('merchant.orders.acceptBlocked')}</AppText>
          ) : null}
          <Button
            variant="ghost"
            title={t('merchant.orders.refuse')}
            onPress={() => setRefusing(true)}
          />
        </>
      ) : null}

      {order.status === 'placed' && refusing ? (
        <>
          <AppText variant="muted">{t('merchant.orders.refuseTitle')}</AppText>
          <View style={styles.chips}>
            {REFUSAL_REASONS.map((reason) => (
              <Chip
                key={reason}
                label={t(`merchant.orders.refuseReasons.${reason}`)}
                onPress={() =>
                  void run({
                    status: 'refused',
                    refusalReason: t(`merchant.orders.refuseReasons.${reason}`),
                  })
                }
              />
            ))}
          </View>
          <Button variant="ghost" title={t('common.cancel')} onPress={() => setRefusing(false)} />
        </>
      ) : null}

      {order.status === 'accepted' ? (
        <Button
          variant="secondary"
          title={t('merchant.orders.startPreparing')}
          loading={busy}
          onPress={() => void run({ status: 'preparing' })}
        />
      ) : null}

      {order.status === 'accepted' || order.status === 'preparing' ? (
        <Button
          testID={`ready-${order.pickup_code}`}
          title={t('merchant.orders.markReady')}
          loading={busy}
          onPress={() => void run({ status: 'ready' })}
        />
      ) : null}

      {order.status === 'ready' ? (
        <>
          <TextField
            label={isDelivery ? t('merchant.orders.courierCode') : t('merchant.orders.pickupCode')}
            value={pickupCode}
            onChangeText={(v) => setPickupCode(v.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={4}
          />
          <Button
            testID={`handover-${order.pickup_code}`}
            title={
              isDelivery ? t('merchant.orders.handOverCourier') : t('merchant.orders.handOver')
            }
            loading={busy}
            disabled={pickupCode.trim().length !== 4}
            onPress={() =>
              void run({ status: isDelivery ? 'out_for_delivery' : 'collected', pickupCode })
            }
          />
        </>
      ) : null}

      {error ? <AppText variant="error">{error}</AppText> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  payment: { gap: spacing.xs },
  unclaimed: { gap: spacing.sm },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});

/** Aucun livreur n'a pris cette livraison dans le délai : le restaurant peut l'annuler. */
function UnclaimedDelivery({ order }: { order: Order }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancel = async () => {
    const ok = await confirmAsync({
      title: t('merchant.orders.unclaimed.confirmTitle'),
      message: t('merchant.orders.unclaimed.confirmBody'),
      confirmLabel: t('merchant.orders.unclaimed.cancel'),
      cancelLabel: t('client.order.keep'),
      destructive: true,
    });
    if (!ok) return;
    setError(null);
    setBusy(true);
    try {
      await cancelUnclaimedDelivery(order.id);
      await queryClient.invalidateQueries({ queryKey: ['merchant-orders', order.merchant_id] });
    } catch (e) {
      setError(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View testID={`unclaimed-${order.pickup_code}`} style={styles.unclaimed}>
      <AppText variant="error">{t('merchant.orders.unclaimed.body')}</AppText>
      <Button
        variant="secondary"
        title={t('merchant.orders.unclaimed.cancel')}
        loading={busy}
        onPress={() => void cancel()}
      />
      {error ? <AppText variant="error">{error}</AppText> : null}
    </View>
  );
}

/**
 * Paiement du repas, payé directement au restaurant : espèces au comptoir, ou carte via le
 * lien de paiement du restaurant (le client indique l'avoir fait, le restaurant confirme).
 */
function MealPayment({ order }: { order: Order }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amount = formatCents(order.total_cents);
  if (order.total_cents === 0) return null;

  const confirm = async () => {
    setError(null);
    setBusy(true);
    try {
      await confirmMealPayment(order.id);
      await queryClient.invalidateQueries({ queryKey: ['merchant-orders', order.merchant_id] });
    } catch (e) {
      setError(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  if (order.paid_at) {
    return (
      <Badge label={t('merchant.orders.payment.received', { price: amount })} tone="success" />
    );
  }
  if (order.meal_payment_method === 'cash') {
    return <AppText variant="link">{t('merchant.orders.payment.cash', { price: amount })}</AppText>;
  }
  if (order.status === 'placed') {
    return (
      <AppText variant="muted">
        {t('merchant.orders.payment.afterAccept', { price: amount })}
      </AppText>
    );
  }
  return (
    <View style={styles.payment} testID={`meal-payment-${order.pickup_code}`}>
      <AppText variant={order.meal_payment_declared_at ? 'link' : 'muted'}>
        {order.meal_payment_declared_at
          ? t('merchant.orders.payment.declared', { price: amount })
          : t('merchant.orders.payment.waiting', { price: amount })}
      </AppText>
      <Button
        testID={`confirm-payment-${order.pickup_code}`}
        variant="secondary"
        title={t('merchant.orders.payment.confirm')}
        loading={busy}
        onPress={() => void confirm()}
      />
      {error ? <AppText variant="error">{error}</AppText> : null}
    </View>
  );
}
