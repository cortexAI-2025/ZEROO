import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText, Button, Screen } from '@/components/ui';
import { useBillingActions } from '@/features/billing/billing';
import { useCurrentMerchant } from '@/features/merchant/hooks';

/** Page de retour des pages Stripe (inscription Connect, souscription) sur le web. */
export default function StripeReturnScreen() {
  const { t } = useTranslation();
  const merchant = useCurrentMerchant();
  const { refresh, reload } = useBillingActions({ role: 'merchant', id: merchant.id });
  const params = useLocalSearchParams<{ refresh?: string; done?: string; subscribed?: string }>();
  // Retour d'inscription Connect : on relit le compte chez Stripe. Retour d'abonnement :
  // le webhook suffit.
  const fromConnect = !!(params.done || params.refresh);

  // Le webhook Stripe arrive quelques secondes après le retour : on interroge Stripe
  // une fois à l'arrivée, puis on relit la base toutes les 3 s pendant 30 s.
  useEffect(() => {
    void (fromConnect ? refresh() : reload());
    const timer = setInterval(() => void reload(), 3_000);
    const stop = setTimeout(() => clearInterval(timer), 30_000);
    return () => {
      clearInterval(timer);
      clearTimeout(stop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Screen centered>
      <AppText variant="title">{t('merchant.billing.returnTitle')}</AppText>
      <AppText>
        {params.refresh ? t('merchant.billing.returnRefresh') : t('merchant.billing.returnDone')}
      </AppText>
      <Button
        title={t('merchant.billing.backToShop')}
        onPress={() => router.replace('/pro/shop')}
      />
    </Screen>
  );
}
