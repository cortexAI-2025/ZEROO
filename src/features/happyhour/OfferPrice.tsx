import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Badge } from '@/components/ui';
import { formatCents } from '@/lib/money';
import { spacing } from '@/theme';

import { offerEndLabel } from './pricing';
import type { Offer } from './types';

/**
 * Prix d'un produit en Happy Hour : prix promotionnel, tarif habituel barré (le prix pratiqué
 * hors de l'offre), badge, heure de fin et stock restant quand il est limité.
 */
export function OfferPrice({ offer, extraCents = 0 }: { offer: Offer; extraCents?: number }) {
  const { t } = useTranslation();
  return (
    <View testID={`offer-${offer.item_id}`} style={styles.wrap}>
      <View style={styles.row}>
        <Badge label={t('happyHour.badge')} tone="warning" />
        <AppText variant="subtitle">{formatCents(offer.promo_cents + extraCents)}</AppText>
        <AppText variant="muted" style={styles.strike}>
          {formatCents(offer.regular_cents + extraCents)}
        </AppText>
      </View>
      <AppText variant="muted">
        {t('happyHour.until', { time: offerEndLabel(offer.ends_at) })}
        {offer.quantity_remaining !== null
          ? ` · ${t('happyHour.remaining', { count: offer.quantity_remaining })}`
          : ''}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  strike: { textDecorationLine: 'line-through' },
});
