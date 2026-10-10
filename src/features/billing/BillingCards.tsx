import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Platform } from 'react-native';

import { AppText, Badge, Button, Card } from '@/components/ui';
import { formatDay } from '@/lib/dates';
import { errorKey } from '@/lib/errors';

import { type BillingTarget, useBilling, useBillingActions } from './billing';

/**
 * Cartes « Paiements » (Stripe Connect) et « Abonnement » : onglet Boutique du restaurant,
 * onglet Compte du livreur. Les textes viennent de merchant.billing ou courier.billing.
 */
export function BillingCards({ target }: { target: BillingTarget }) {
  const { t } = useTranslation();
  const billing = useBilling(target);
  const actions = useBillingActions(target);
  const ns = target.role === 'merchant' ? 'merchant' : 'courier';
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (key: string, action: () => Promise<void>) => async () => {
    setError(null);
    setBusy(key);
    try {
      await action();
    } catch (e) {
      setError(t(errorKey(e)));
    } finally {
      setBusy(null);
    }
  };

  const account = billing.data?.account ?? null;
  const subscription = billing.data?.subscription ?? null;
  const isWeb = Platform.OS === 'web';
  const subscriptionActive =
    subscription?.status === 'trialing' || subscription?.status === 'active';

  return (
    <>
      <Card testID="payments-card">
        <AppText variant="subtitle">{t(`${ns}.billing.paymentsTitle`)}</AppText>
        {account?.charges_enabled ? (
          <>
            <Badge label="Stripe ✓" tone="success" />
            <AppText variant="muted">{t(`${ns}.billing.paymentsActive`)}</AppText>
            <Button
              variant="ghost"
              title={t(`${ns}.billing.stripeDashboard`)}
              onPress={() => void Linking.openURL('https://dashboard.stripe.com')}
            />
          </>
        ) : (
          <>
            <AppText variant="muted">
              {account?.details_submitted
                ? t(`${ns}.billing.paymentsPending`)
                : t(`${ns}.billing.paymentsNone`)}
            </AppText>
            <Button
              testID="setup-payments"
              title={
                account ? t(`${ns}.billing.paymentsContinue`) : t(`${ns}.billing.paymentsSetup`)
              }
              loading={busy === 'payments'}
              onPress={() => void run('payments', actions.setupPayments)()}
            />
          </>
        )}
      </Card>

      <Card testID="subscription-card">
        <AppText variant="subtitle">{t(`${ns}.billing.subscriptionTitle`)}</AppText>
        {subscription?.status === 'trialing' && subscription.trial_end ? (
          <AppText>
            {t(`${ns}.billing.trialing`, { date: formatDay(subscription.trial_end) })}
          </AppText>
        ) : null}
        {subscription?.status === 'active' ? (
          <AppText>
            {subscription.current_period_end
              ? t(`${ns}.billing.active`, { date: formatDay(subscription.current_period_end) })
              : t(`${ns}.billing.activeNoDate`)}
          </AppText>
        ) : null}
        {subscriptionActive &&
        subscription?.cancel_at_period_end &&
        subscription.current_period_end ? (
          <AppText variant="muted">
            {t(`${ns}.billing.cancelAtPeriodEnd`, {
              date: formatDay(subscription.current_period_end),
            })}
          </AppText>
        ) : null}
        {subscription?.status === 'past_due' || subscription?.status === 'unpaid' ? (
          <AppText variant="error">{t(`${ns}.billing.pastDue`)}</AppText>
        ) : null}
        {!subscriptionActive ? (
          <AppText variant="muted">
            {subscription?.trial_used
              ? t(`${ns}.billing.subscriptionNoneUsedTrial`)
              : t(`${ns}.billing.subscriptionNone`)}
          </AppText>
        ) : null}

        {/* Règles des stores : pas d'achat d'abonnement dans l'app mobile, seulement sur le web. */}
        {!isWeb ? <AppText variant="muted">{t(`${ns}.billing.webOnly`)}</AppText> : null}
        {isWeb &&
        !subscriptionActive &&
        subscription?.status !== 'past_due' &&
        subscription?.status !== 'unpaid' ? (
          <Button
            testID="subscribe"
            title={
              subscription?.trial_used
                ? t(`${ns}.billing.subscribe`)
                : t(`${ns}.billing.startTrial`)
            }
            loading={busy === 'subscribe'}
            onPress={() => void run('subscribe', actions.subscribe)()}
          />
        ) : null}
        {isWeb && subscription && subscription.status !== 'incomplete' ? (
          <Button
            variant="secondary"
            title={t(`${ns}.billing.manage`)}
            loading={busy === 'portal'}
            onPress={() => void run('portal', actions.manageSubscription)()}
          />
        ) : null}
      </Card>
      {error ? <AppText variant="error">{error}</AppText> : null}
    </>
  );
}
