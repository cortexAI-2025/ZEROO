import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Badge, Button, Card } from '@/components/ui';
import { formatDay, formatTime } from '@/lib/dates';
import { errorKey } from '@/lib/errors';
import { formatCents } from '@/lib/money';
import { useNow } from '@/lib/useNow';
import { spacing } from '@/theme';

import type { MyReservation } from './api';
import { useBasketActions, useMyReservations } from './hooks';

function ReservationCard({ reservation }: { reservation: MyReservation }) {
  const { t } = useTranslation();
  const actions = useBasketActions();
  const now = useNow(30_000);
  const basket = reservation.surprise_baskets;
  const open = reservation.status === 'reserved';
  // Le client annule jusqu'au début du créneau ; ensuite, il contacte le commerçant.
  const canCancel = open && now < Date.parse(basket.pickup_starts_at);

  return (
    <Card testID={`my-reservation-${basket.title}`}>
      <View style={styles.row}>
        <AppText variant="subtitle" style={styles.flex}>
          {basket.merchants?.name}
        </AppText>
        <Badge
          label={t(`merchant.baskets.status.${reservation.status as 'reserved'}`)}
          tone={open ? 'success' : 'neutral'}
        />
      </View>
      <AppText>
        {reservation.quantity} × {basket.title} ·{' '}
        {formatCents(reservation.unit_price_cents * reservation.quantity)}
      </AppText>
      <AppText variant="muted">
        {t('client.baskets.pickup', {
          day: formatDay(basket.pickup_starts_at),
          from: formatTime(basket.pickup_starts_at),
          to: formatTime(basket.pickup_ends_at),
        })}
      </AppText>
      {basket.merchants?.offers_pickup ? (
        <AppText variant="muted">
          {basket.merchants.address_line}, {basket.merchants.city}
        </AppText>
      ) : null}
      {open ? (
        <>
          <AppText variant="muted">{t('client.baskets.showCode')}</AppText>
          <AppText variant="title" testID="reservation-code" style={styles.code}>
            {reservation.pickup_code}
          </AppText>
          <AppText variant="muted">{t('client.baskets.payOnSite')}</AppText>
          {canCancel ? (
            <Button
              variant="ghost"
              title={t('client.baskets.cancel')}
              loading={actions.cancel.isPending}
              onPress={() => actions.cancel.mutate(reservation.id)}
            />
          ) : (
            <AppText variant="muted">{t('client.baskets.cancelTooLate')}</AppText>
          )}
        </>
      ) : null}
      {actions.cancel.error ? (
        <AppText variant="error">{t(errorKey(actions.cancel.error))}</AppText>
      ) : null}
    </Card>
  );
}

/** Paniers anti-gaspi réservés par le client (à retirer, retirés, annulés). */
export function MyReservations() {
  const { t } = useTranslation();
  const reservations = useMyReservations();
  if (!reservations.data || reservations.data.length === 0) return null;
  return (
    <View style={styles.section}>
      <AppText variant="subtitle">{t('client.baskets.mine')}</AppText>
      {reservations.data.map((r) => (
        <ReservationCard key={r.id} reservation={r} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  code: { letterSpacing: 6 },
});
