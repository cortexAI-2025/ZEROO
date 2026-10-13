import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Stars } from '@/components/ui';
import { formatDay } from '@/lib/dates';
import { spacing } from '@/theme';

import type { OrderReview } from './api';

/** Derniers avis (restaurant ou livreur) : étoiles, date et commentaire. */
export function ReviewList({
  reviews,
  starsOf,
}: {
  reviews: OrderReview[];
  starsOf: (review: OrderReview) => number | null;
}) {
  const { t } = useTranslation();
  if (reviews.length === 0) return <AppText variant="muted">{t('reviews.none')}</AppText>;
  return (
    <View style={styles.list}>
      {reviews.map((review) => (
        <View key={review.order_id} style={styles.item}>
          <View style={styles.row}>
            <Stars value={starsOf(review) ?? 0} />
            <AppText variant="muted">{formatDay(review.created_at)}</AppText>
          </View>
          {review.comment ? <AppText>« {review.comment} »</AppText> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  item: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
});
