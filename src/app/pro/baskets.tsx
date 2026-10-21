import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import {
  AppText,
  Badge,
  Button,
  Card,
  QueryState,
  Screen,
  SwitchRow,
  TextField,
} from '@/components/ui';
import type { BasketWithReservations } from '@/features/baskets/api';
import { useBasketActions, useMerchantBaskets } from '@/features/baskets/hooks';
import type { Reservation } from '@/features/baskets/types';
import { useCurrentMerchant } from '@/features/merchant/hooks';
import { formatDay, formatTime } from '@/lib/dates';
import { errorKey } from '@/lib/errors';
import { formatCents } from '@/lib/money';
import { useNow } from '@/lib/useNow';
import { spacing } from '@/theme';

/** Remise d'une réservation : le commerçant saisit le code montré par le client. */
function ReservationRow({ reservation }: { reservation: Reservation }) {
  const { t } = useTranslation();
  const merchant = useCurrentMerchant();
  const actions = useBasketActions(merchant.id);
  const [code, setCode] = useState('');
  const open = reservation.status === 'reserved';
  const error = actions.collect.error ?? actions.cancel.error;

  return (
    <View testID={`reservation-${reservation.id}`} style={styles.reservation}>
      <AppText>
        {reservation.quantity} ×{' '}
        {reservation.customer_name ?? t('merchant.orders.anonymousCustomer')} ·{' '}
        <AppText variant="muted">
          {t(`merchant.baskets.status.${reservation.status as 'reserved'}`)}
        </AppText>
      </AppText>
      {open ? (
        <>
          <TextField
            testID={`collect-code-${reservation.id}`}
            label={t('merchant.baskets.code')}
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase())}
            autoCapitalize="characters"
            maxLength={4}
          />
          <View style={styles.actions}>
            <Button
              testID={`collect-${reservation.id}`}
              title={t('merchant.baskets.collect')}
              disabled={code.length < 4}
              loading={actions.collect.isPending}
              onPress={() => actions.collect.mutate({ id: reservation.id, code })}
            />
            <Button
              variant="ghost"
              title={t('merchant.baskets.cancelReservation')}
              onPress={() => actions.cancel.mutate(reservation.id)}
            />
          </View>
          {error ? <AppText variant="error">{t(errorKey(error))}</AppText> : null}
        </>
      ) : null}
    </View>
  );
}

function BasketCard({ basket }: { basket: BasketWithReservations }) {
  const { t } = useTranslation();
  const merchant = useCurrentMerchant();
  const actions = useBasketActions(merchant.id);
  const now = useNow(30_000);
  const ended = Date.parse(basket.pickup_ends_at) <= now;
  const reservations = basket.basket_reservations.filter(
    (r) => r.status === 'reserved' || r.status === 'collected',
  );

  return (
    <Card testID={`basket-${basket.title}`}>
      <View style={styles.header}>
        <AppText variant="subtitle" style={styles.flex}>
          {basket.title}
        </AppText>
        <Badge
          label={
            ended
              ? t('merchant.baskets.ended')
              : basket.is_active
                ? t('merchant.baskets.open')
                : t('merchant.baskets.paused')
          }
          tone={!ended && basket.is_active ? 'success' : 'neutral'}
        />
      </View>
      <AppText variant="muted">
        {formatDay(basket.pickup_starts_at)} · {formatTime(basket.pickup_starts_at)} –{' '}
        {formatTime(basket.pickup_ends_at)} · {formatCents(basket.price_cents)}
      </AppText>
      <AppText variant="muted">
        {t('merchant.baskets.stock', {
          reserved: basket.quantity_reserved,
          total: basket.quantity_total,
        })}
      </AppText>
      {!ended ? (
        <SwitchRow
          label={t('merchant.baskets.active')}
          value={basket.is_active}
          onValueChange={(active) => actions.setActive.mutate({ id: basket.id, active })}
        />
      ) : null}
      <Button
        variant="secondary"
        title={t('common.edit')}
        onPress={() => router.push({ pathname: '/pro/basket/[id]', params: { id: basket.id } })}
      />
      {reservations.length > 0 ? (
        <View style={styles.reservations}>
          <AppText variant="subtitle">{t('merchant.baskets.reservations')}</AppText>
          {reservations.map((r) => (
            <ReservationRow key={r.id} reservation={r} />
          ))}
        </View>
      ) : null}
      {actions.setActive.error ? (
        <AppText variant="error">{t(errorKey(actions.setActive.error))}</AppText>
      ) : null}
    </Card>
  );
}

/** Paniers anti-gaspi du commerçant : une option en plus, incluse dans Start et Pro. */
export default function BasketsScreen() {
  const { t } = useTranslation();
  const merchant = useCurrentMerchant();
  const baskets = useMerchantBaskets(merchant.id);
  if (!baskets.data)
    return <QueryState error={baskets.error} onRetry={() => void baskets.refetch()} />;

  return (
    <Screen scroll>
      <AppText variant="muted">{t('merchant.baskets.hint')}</AppText>
      <Button
        testID="basket-new"
        title={t('merchant.baskets.new')}
        onPress={() => router.push({ pathname: '/pro/basket/[id]', params: { id: 'new' } })}
      />
      {baskets.data.length === 0 ? (
        <AppText variant="muted">{t('merchant.baskets.empty')}</AppText>
      ) : null}
      {baskets.data.map((b) => (
        <BasketCard key={b.id} basket={b} />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  reservations: { gap: spacing.sm },
  reservation: { gap: spacing.xs },
});
