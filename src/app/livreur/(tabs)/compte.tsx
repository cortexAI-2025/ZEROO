import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText, Card } from '@/components/ui';
import { AccountScreen } from '@/features/auth/AccountScreen';
import { useBillingActions } from '@/features/billing/billing';
import { BillingCards } from '@/features/billing/BillingCards';
import { useCurrentCourier } from '@/features/courier/hooks';

/**
 * Compte du livreur : profil, paiements Stripe, abonnement, puis actions du compte.
 * C'est aussi la page de retour des pages Stripe (?done, ?refresh, ?subscribed).
 */
export default function CourierAccountScreen() {
  const { t } = useTranslation();
  const courier = useCurrentCourier();
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
      <Card>
        <AppText variant="subtitle">{t('courier.account.profile')}</AppText>
        <AppText>{courier.display_name}</AppText>
        <AppText variant="muted">
          {t(`courier.onboarding.statuses.${courier.legal_status}`)} ·{' '}
          {t('courier.account.siret', { siret: courier.siret })}
        </AppText>
        <AppText variant="muted">
          {t(`courier.onboarding.vehicles.${courier.vehicle}`)} · {courier.phone}
        </AppText>
      </Card>
      <BillingCards target={target} />
    </AccountScreen>
  );
}
