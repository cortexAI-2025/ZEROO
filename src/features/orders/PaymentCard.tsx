import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking } from 'react-native';

import { AppText, Badge, Button, Card } from '@/components/ui';
import { declarePayment } from '@/features/payments/pay';
import { errorKey } from '@/lib/errors';
import { formatCents } from '@/lib/money';

type Props = {
  orderId: string;
  kind: 'meal' | 'delivery';
  /** Restaurant (repas) ou livreur (livraison). */
  payee: string;
  amountCents: number;
  /** Lien de paiement du professionnel (SumUp, PayPal, Stripe…), absent s'il n'en a pas. */
  link: string | null | undefined;
  /** Référence à indiquer avec le paiement (code de la commande). */
  reference: string;
  declaredAt: string | null;
  paidAt: string | null;
  onChanged: () => void;
};

/**
 * Paiement direct d'un professionnel par carte, Apple Pay ou Google Pay : le client ouvre le
 * lien de paiement du restaurant ou du livreur, puis indique « J'ai payé » ; le professionnel
 * confirme la réception. ZeeRoo n'encaisse rien.
 */
export function PaymentCard(props: Props) {
  const { t } = useTranslation();
  const { orderId, kind, payee, amountCents, link, reference, declaredAt, paidAt } = props;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amount = formatCents(amountCents);
  const testID = kind === 'meal' ? 'meal-payment-card' : 'ride-payment-card';

  if (paidAt) {
    return (
      <Card testID={testID}>
        <Badge label={t('client.payment.received')} tone="success" />
        <AppText variant="muted">
          {t(`client.payment.receivedBy.${kind}`, { name: payee, price: amount })}
        </AppText>
      </Card>
    );
  }

  const declare = async () => {
    setError(null);
    setBusy(true);
    try {
      await declarePayment(orderId, kind);
      props.onChanged();
    } catch (e) {
      setError(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card testID={testID}>
      <AppText variant="subtitle">
        {t(`client.payment.title.${kind}`, { name: payee, price: amount })}
      </AppText>
      {link ? (
        <>
          <AppText variant="muted">
            {t('client.payment.howTo', { name: payee, price: amount, reference })}
          </AppText>
          <Button
            testID={`${testID}-open`}
            variant={declaredAt ? 'secondary' : 'primary'}
            title={t('client.payment.open', { price: amount })}
            onPress={() => void Linking.openURL(link)}
          />
          {declaredAt ? (
            <AppText variant="link">{t('client.payment.declared', { name: payee })}</AppText>
          ) : (
            <Button
              testID={`${testID}-declare`}
              variant="ghost"
              title={t('client.payment.declare')}
              loading={busy}
              onPress={() => void declare()}
            />
          )}
        </>
      ) : (
        <AppText variant="muted">{t('client.payment.noLink', { name: payee })}</AppText>
      )}
      {error ? <AppText variant="error">{error}</AppText> : null}
    </Card>
  );
}
