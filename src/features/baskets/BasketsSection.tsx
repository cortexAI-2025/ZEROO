import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Badge, Button, Card } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatDay, formatTime } from '@/lib/dates';
import { errorKey } from '@/lib/errors';
import { formatCents } from '@/lib/money';
import { spacing } from '@/theme';

import { useBasketActions, usePublicBaskets } from './hooks';
import type { Basket } from './types';

/** Allergènes déclarés, ou la mise en garde d'un panier surprise dont la composition varie. */
export function AllergenNotice({ basket }: { basket: Pick<Basket, 'allergens' | 'is_surprise'> }) {
  const { t } = useTranslation();
  const list = basket.allergens.map((a) => t(`baskets.allergens.${a as 'gluten'}`)).join(', ');
  return (
    <View style={styles.notice} testID="allergen-notice">
      <AppText variant="muted">
        {list
          ? t('client.baskets.allergensDeclared', { list })
          : t('client.baskets.noAllergenDeclared')}
      </AppText>
      {basket.is_surprise ? (
        <AppText variant="muted">{t('client.baskets.surpriseNotice')}</AppText>
      ) : null}
    </View>
  );
}

function BasketCard({ basket }: { basket: Basket }) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const actions = useBasketActions();
  const left = basket.quantity_total - basket.quantity_reserved;
  const reservable = !!basket.is_reservable;

  return (
    <Card testID={`public-basket-${basket.title}`}>
      <View style={styles.row}>
        <AppText variant="subtitle" style={styles.flex}>
          {basket.title}
        </AppText>
        <Badge
          label={basket.is_surprise ? t('client.baskets.surprise') : t('client.baskets.known')}
        />
      </View>
      {basket.contents ? <AppText>{basket.contents}</AppText> : null}
      <View style={styles.row}>
        <AppText variant="subtitle">{formatCents(basket.price_cents)}</AppText>
        {basket.estimated_value_cents ? (
          <AppText variant="muted">
            {t('client.baskets.value', { value: formatCents(basket.estimated_value_cents) })}
          </AppText>
        ) : null}
      </View>
      <AppText variant="muted">
        {t('client.baskets.pickup', {
          day: formatDay(basket.pickup_starts_at),
          from: formatTime(basket.pickup_starts_at),
          to: formatTime(basket.pickup_ends_at),
        })}
      </AppText>
      <AppText variant="muted">{t('client.baskets.payOnSite')}</AppText>
      <AllergenNotice basket={basket} />
      {reservable ? (
        <>
          <AppText variant="link">{t('client.baskets.left', { count: left })}</AppText>
          {session ? (
            <Button
              testID={`reserve-${basket.title}`}
              title={t('client.baskets.reserve')}
              loading={actions.reserve.isPending}
              onPress={() =>
                actions.reserve.mutate(
                  { basketId: basket.id, quantity: 1 },
                  { onSuccess: () => router.push('/orders') },
                )
              }
            />
          ) : (
            <Button title={t('client.baskets.signIn')} onPress={() => router.push('/sign-in')} />
          )}
        </>
      ) : (
        <AppText variant="muted">{t('client.baskets.soldOut')}</AppText>
      )}
      {actions.reserve.error ? (
        <AppText variant="error">{t(errorKey(actions.reserve.error))}</AppText>
      ) : null}
    </Card>
  );
}

/**
 * Paniers anti-gaspi d'un commerce : une option complémentaire, placée après la carte. Réservation
 * sans paiement en ligne : le client règle sur place, au retrait.
 */
export function BasketsSection({ merchantId }: { merchantId: string }) {
  const { t } = useTranslation();
  const baskets = usePublicBaskets(merchantId);
  if (!baskets.data || baskets.data.length === 0) return null;
  return (
    <View style={styles.section} testID="baskets-section">
      <AppText variant="subtitle">{t('client.baskets.title')}</AppText>
      <AppText variant="muted">{t('client.baskets.hint')}</AppText>
      {baskets.data.map((b) => (
        <BasketCard key={b.id} basket={b} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  notice: { gap: spacing.xs },
});
