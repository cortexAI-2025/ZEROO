import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, StyleSheet, View } from 'react-native';

import { AppText, Badge, Button, Card, TextField } from '@/components/ui';
import { directionsUrl, formatDistance } from '@/features/discover/location';
import { confirmAsync } from '@/lib/confirm';
import { formatTime } from '@/lib/dates';
import { errorKey } from '@/lib/errors';
import { formatCents } from '@/lib/money';
import { radius, spacing, useThemeColors } from '@/theme';

import { useCourierActions } from './hooks';
import type { CourierRun } from './types';

/**
 * Une mission acceptée, de la prise en charge à la livraison :
 *   course par carte → attendre le règlement du client (sinon la mission repart dans le pool) ;
 *   prête → retrait au restaurant avec le code de retrait (course payée, ou espèces) ;
 *   en livraison → itinéraire, appel du client, encaissement éventuel en espèces et
 *   validation avec son code de livraison.
 */
export function RunCard({ run }: { run: CourierRun }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const actions = useCourierActions();
  const [deliveryCode, setDeliveryCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const merchant = run.merchants;
  const early = ['accepted', 'preparing', 'ready'].includes(run.status);
  const paidByCard = run.delivery_payment_method === 'card' && !!run.delivery_authorized_at;
  const awaitingPayment =
    early && run.delivery_payment_method === 'card' && !run.delivery_authorized_at;
  const cash = run.delivery_payment_method === 'cash';
  const itemsCount = run.order_items.reduce((sum, item) => sum + item.quantity, 0);
  const deliveryAddress = [
    run.delivery_address_line,
    [run.delivery_postal_code, run.delivery_city].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ');

  const perform = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(t(errorKey(e)));
    }
  };

  const decline = async () => {
    const ok = await confirmAsync({
      title: t('courier.runs.releaseConfirmTitle'),
      message: t('courier.runs.releaseConfirmBody'),
      confirmLabel: t('courier.runs.release'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (ok) await perform(() => actions.decline.mutateAsync(run.id));
  };

  const openMap = (latitude: number | null, longitude: number | null) => {
    if (latitude == null || longitude == null) return;
    void Linking.openURL(directionsUrl(Platform.OS, latitude, longitude));
  };

  return (
    <Card testID={`run-${run.pickup_code}`}>
      <View style={styles.header}>
        <AppText variant="subtitle">{t(`merchant.orders.statuses.${run.status}`)}</AppText>
        <Badge
          label={t('courier.runs.fee', { price: formatCents(run.delivery_fee_cents) })}
          tone={awaitingPayment ? 'warning' : 'success'}
        />
      </View>

      {merchant ? (
        <AppText>
          {t('courier.runs.pickupAt', {
            name: merchant.name,
            address: `${merchant.address_line}, ${merchant.city}`,
          })}
        </AppText>
      ) : null}
      <AppText>{t('courier.runs.deliverTo', { address: deliveryAddress })}</AppText>
      {run.delivery_distance_m != null ? (
        <AppText variant="muted">
          {t('courier.runs.distance', { distance: formatDistance(run.delivery_distance_m) })}
        </AppText>
      ) : null}
      {run.delivery_instructions ? (
        <AppText variant="link">
          {t('courier.runs.instructions', { text: run.delivery_instructions })}
        </AppText>
      ) : null}
      <AppText variant="muted">
        {t('courier.runs.customer', {
          name: run.customer_name ?? t('merchant.orders.anonymousCustomer'),
        })}{' '}
        · {t('courier.runs.items', { count: itemsCount })}
      </AppText>

      {awaitingPayment ? (
        <AppText variant="link" testID={`awaiting-payment-${run.pickup_code}`}>
          {t('courier.runs.waitingPayment', {
            time: run.delivery_payment_due_at ? formatTime(run.delivery_payment_due_at) : '',
          })}
        </AppText>
      ) : null}
      {early && paidByCard ? <AppText variant="muted">{t('courier.runs.paid')}</AppText> : null}
      {cash && run.status !== 'delivered' ? (
        <AppText variant="link">
          {t('courier.runs.collectCash', { price: formatCents(run.delivery_fee_cents) })}
        </AppText>
      ) : null}
      {early && !run.delivery_authorized_at ? (
        <Button
          testID={`release-run-${run.pickup_code}`}
          variant="ghost"
          title={t('courier.runs.release')}
          loading={actions.decline.isPending}
          onPress={() => void decline()}
        />
      ) : null}

      {(run.status === 'accepted' || run.status === 'preparing') && run.estimated_ready_at ? (
        <AppText>
          {t('courier.runs.preparing', { time: formatTime(run.estimated_ready_at) })}
        </AppText>
      ) : null}
      {run.status === 'ready' ? <AppText variant="link">{t('courier.runs.ready')}</AppText> : null}

      {['accepted', 'preparing', 'ready'].includes(run.status) ? (
        <View style={[styles.code, { borderColor: colors.border }]}>
          <AppText variant="muted">{t('courier.runs.pickupCode')}</AppText>
          <AppText testID={`run-pickup-code-${run.pickup_code}`} style={styles.codeText} selectable>
            {run.pickup_code}
          </AppText>
        </View>
      ) : null}

      {run.status !== 'out_for_delivery' && merchant ? (
        <Button
          variant="secondary"
          title={t('courier.runs.toRestaurant')}
          onPress={() => openMap(merchant.latitude, merchant.longitude)}
        />
      ) : null}

      {run.status === 'out_for_delivery' ? (
        <>
          <AppText variant="link">{t('courier.runs.onTheWay')}</AppText>
          {cash ? (
            <AppText variant="link">
              {t('courier.runs.cashCollected', { price: formatCents(run.delivery_fee_cents) })}
            </AppText>
          ) : null}
          <Button
            variant="secondary"
            title={t('courier.runs.toCustomer')}
            onPress={() => openMap(run.delivery_latitude, run.delivery_longitude)}
          />
          <TextField
            label={t('courier.runs.deliveryCode')}
            value={deliveryCode}
            onChangeText={(v) => setDeliveryCode(v.replace(/\D/g, ''))}
            keyboardType="number-pad"
            maxLength={4}
            testID={`delivery-code-${run.pickup_code}`}
          />
          <Button
            testID={`delivered-${run.pickup_code}`}
            title={t('courier.runs.markDelivered')}
            disabled={deliveryCode.length !== 4}
            loading={actions.deliver.isPending}
            onPress={() =>
              void perform(() =>
                actions.deliver.mutateAsync({ orderId: run.id, code: deliveryCode }),
              )
            }
          />
        </>
      ) : null}

      {run.delivery_phone ? (
        <Button
          variant="ghost"
          title={t('courier.runs.call')}
          onPress={() => void Linking.openURL(`tel:${run.delivery_phone!.replace(/[^\d+]/g, '')}`)}
        />
      ) : null}

      {error ? <AppText variant="error">{error}</AppText> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  code: {
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  codeText: { fontSize: 32, fontWeight: '800', letterSpacing: 6 },
});
