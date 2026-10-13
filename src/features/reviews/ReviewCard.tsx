import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, StarPicker, Stars, TextField } from '@/components/ui';
import { errorKey } from '@/lib/errors';
import { spacing } from '@/theme';

import { useOrderReview, useSubmitReview } from './hooks';

type Props = {
  orderId: string;
  merchantName: string;
  /** Livreur de la commande (livraison) : le client peut aussi le noter. */
  courierName: string | null;
};

/** Après une commande terminée : le client note le restaurant et, s'il y en a un, le livreur. */
export function ReviewCard({ orderId, merchantName, courierName }: Props) {
  const { t } = useTranslation();
  const existing = useOrderReview(orderId, true);
  const submit = useSubmitReview();
  const [merchantStars, setMerchantStars] = useState(0);
  const [courierStars, setCourierStars] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (existing.isPending) return null;
  const review = existing.data;
  if (review) {
    return (
      <Card testID="review-done">
        <AppText variant="subtitle">{t('reviews.thanks')}</AppText>
        {review.merchant_stars ? (
          <View style={styles.row}>
            <AppText variant="muted">{merchantName}</AppText>
            <Stars value={review.merchant_stars} />
          </View>
        ) : null}
        {review.courier_stars && courierName ? (
          <View style={styles.row}>
            <AppText variant="muted">{courierName}</AppText>
            <Stars value={review.courier_stars} />
          </View>
        ) : null}
        {review.comment ? <AppText>« {review.comment} »</AppText> : null}
      </Card>
    );
  }

  const send = async () => {
    setError(null);
    try {
      await submit.mutateAsync({
        orderId,
        merchantStars: merchantStars || null,
        courierStars: courierName && courierStars ? courierStars : null,
        comment,
      });
    } catch (e) {
      setError(t(errorKey(e)));
    }
  };

  return (
    <Card testID="review-form">
      <AppText variant="subtitle">{t('reviews.title')}</AppText>
      <AppText variant="muted">{merchantName}</AppText>
      <StarPicker
        value={merchantStars}
        onChange={setMerchantStars}
        label={t('reviews.rateMerchant', { name: merchantName })}
        testID="review-merchant"
      />
      {courierName ? (
        <>
          <AppText variant="muted">{t('reviews.courierLabel', { name: courierName })}</AppText>
          <StarPicker
            value={courierStars}
            onChange={setCourierStars}
            label={t('reviews.rateCourier', { name: courierName })}
            testID="review-courier"
          />
        </>
      ) : null}
      <TextField
        label={t('reviews.comment')}
        value={comment}
        onChangeText={setComment}
        maxLength={300}
        multiline
      />
      {error ? <AppText variant="error">{error}</AppText> : null}
      <Button
        testID="review-submit"
        title={t('reviews.send')}
        disabled={!merchantStars && !courierStars}
        loading={submit.isPending}
        onPress={() => void send()}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
