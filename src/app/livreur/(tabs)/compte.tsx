import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Meter, Stars } from '@/components/ui';
import { AccountScreen } from '@/features/auth/AccountScreen';
import { useBillingActions } from '@/features/billing/billing';
import { BillingCards } from '@/features/billing/BillingCards';
import { useCurrentCourier, useSetCourierPaymentLink } from '@/features/courier/hooks';
import { PaymentLinkCard } from '@/features/payments/PaymentLinkCard';
import { Thumb } from '@/features/photos/Thumb';
import { useCourierRating, useCourierReviews } from '@/features/reviews/hooks';
import { ReviewList } from '@/features/reviews/ReviewList';
import { spacing } from '@/theme';

/**
 * Compte du livreur : profil, paiements Stripe, abonnement, puis actions du compte.
 * C'est aussi la page de retour des pages Stripe (?done, ?refresh, ?subscribed).
 */
export default function CourierAccountScreen() {
  const { t } = useTranslation();
  const courier = useCurrentCourier();
  const setPaymentLink = useSetCourierPaymentLink(courier.id);
  const rating = useCourierRating(courier.id).data;
  const average = rating?.average ?? null;
  const reviews = useCourierReviews(courier.id);
  const target = { role: 'courier', id: courier.id } as const;
  const { refresh, reload } = useBillingActions(target);
  const params = useLocalSearchParams<{ refresh?: string; done?: string; subscribed?: string }>();
  const fromStripe = !!(params.done || params.refresh || params.subscribed);
  const fromConnect = !!(params.done || params.refresh);

  // Retour de Stripe : le webhook arrive quelques secondes après, on relit la base toutes
  // les 3 s pendant 30 s (après avoir interrogé Stripe une fois au retour d'inscription).
  useEffect(() => {
    if (!fromStripe) return;
    void (fromConnect ? refresh() : reload());
    const timer = setInterval(() => void reload(), 3_000);
    const stop = setTimeout(() => clearInterval(timer), 30_000);
    return () => {
      clearInterval(timer);
      clearTimeout(stop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromStripe]);

  return (
    <AccountScreen>
      {params.refresh ? (
        <AppText variant="muted">{t('courier.billing.returnRefresh')}</AppText>
      ) : null}
      <Card testID="courier-profile">
        <AppText variant="subtitle">{t('courier.account.profile')}</AppText>
        <View style={styles.line}>
          <Thumb url={courier.photo_url} size={64} round icon="person-outline" />
          <AppText variant="subtitle">{courier.display_name}</AppText>
        </View>
        {average !== null ? (
          <View style={styles.line}>
            <Stars value={average} size={18} />
            <AppText variant="subtitle">{average.toFixed(2).replace('.', ',')}</AppText>
            <AppText variant="muted">{t('reviews.count', { count: rating?.count ?? 0 })}</AppText>
          </View>
        ) : (
          <AppText variant="muted">{t('reviews.none')}</AppText>
        )}
        <AppText variant="muted">
          {t(`courier.onboarding.vehicles.${courier.vehicle}`)} · {courier.phone}
          {courier.work_zone ? ` · ${courier.work_zone}` : ''}
        </AppText>
        <Button
          testID="courier-profile-edit"
          variant="secondary"
          title={t('courier.profile.edit')}
          onPress={() => router.push('/livreur/profil')}
        />
      </Card>
      <Card>
        <AppText variant="subtitle">{t('courier.account.company')}</AppText>
        <AppText>{t(`courier.onboarding.statuses.${courier.legal_status}`)}</AppText>
        <AppText variant="muted">{t('courier.account.siret', { siret: courier.siret })}</AppText>
        <AppText variant="muted">{t('courier.onboarding.verification')}</AppText>
      </Card>
      {rating && rating.count > 0 ? (
        <Card testID="courier-ratings">
          <AppText variant="subtitle">{t('courier.account.ratings')}</AppText>
          {rating.distribution.map((d) => (
            <View key={d.stars} style={styles.line}>
              <AppText variant="muted" style={styles.starLabel}>
                {d.stars} ★
              </AppText>
              <Meter ratio={d.count / rating.count} />
              <AppText variant="muted" style={styles.pct}>
                {Math.round((d.count / rating.count) * 100)} %
              </AppText>
            </View>
          ))}
          <AppText variant="subtitle">{t('courier.account.reviews')}</AppText>
          <ReviewList reviews={reviews.data ?? []} starsOf={(r) => r.courier_stars} />
        </Card>
      ) : null}
      <PaymentLinkCard
        role="courier"
        link={courier.payment_link}
        onSave={(link) => setPaymentLink.mutateAsync(link)}
      />
      <BillingCards target={target} />
    </AccountScreen>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  starLabel: { width: 32 },
  pct: { width: 44, textAlign: 'right' },
});
