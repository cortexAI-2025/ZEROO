import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Chip } from '@/components/ui';
import { confirmAsync } from '@/lib/confirm';
import { formatDay } from '@/lib/dates';
import { errorKey } from '@/lib/errors';
import { formatCents } from '@/lib/money';
import { spacing } from '@/theme';

import { type BillingTarget, useBilling, useBillingActions } from './billing';
import {
  COURIER_FEATURES,
  courierHasFeature,
  effectivePlan,
  MERCHANT_FEATURES,
  merchantHasFeature,
} from './entitlements';
import {
  COURIER_PLANS,
  formatPrice,
  type Interval,
  MERCHANT_PLANS,
  type PlanId,
  planTier,
  yearlyMonthlyHtCents,
} from './plans';

/** Liste des fonctions de la formule choisie, avec ce qui est inclus ou non. */
function PlanFeatures({ plan }: { plan: PlanId }) {
  const { t } = useTranslation();
  const tier = planTier(plan);
  const isCourier = plan.startsWith('courier');
  const rows = isCourier
    ? COURIER_FEATURES.map((f) => ({
        key: f,
        label: t(`billing.courierFeatures.${f}`),
        included: courierHasFeature(tier, f),
      }))
    : MERCHANT_FEATURES.map((f) => ({
        key: f,
        label: t(`billing.merchantFeatures.${f}`),
        included: merchantHasFeature(tier, f),
      }));
  return (
    <View testID={`plan-features-${plan}`} style={styles.features}>
      {rows.map((row) => (
        <AppText key={row.key} variant={row.included ? undefined : 'muted'}>
          {row.included ? '✓ ' : '— '}
          {row.label}
        </AppText>
      ))}
    </View>
  );
}

/**
 * Carte « Abonnement » (seul usage de Stripe) : onglet Boutique du restaurant, onglet Compte
 * du livreur. Les textes viennent de merchant.billing ou courier.billing.
 */
export function BillingCards({ target }: { target: BillingTarget }) {
  const { t } = useTranslation();
  const billing = useBilling(target);
  const actions = useBillingActions(target);
  const ns = target.role === 'merchant' ? 'merchant' : 'courier';
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isCourier = target.role === 'courier';
  const [tierChoice, setTierChoice] = useState<'start' | 'pro'>('start');
  const [interval, setInterval] = useState<Interval>('month');
  // Restaurant et livreur choisissent chacun entre Start et Pro (grilles différentes).
  const plan: PlanId = isCourier
    ? tierChoice === 'pro'
      ? 'courier_pro'
      : 'courier_start'
    : tierChoice;
  const plans = isCourier ? COURIER_PLANS : MERCHANT_PLANS;
  const price = formatPrice(plan, interval);

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

  const subscription = billing.data?.subscription ?? null;
  const currentTier = effectivePlan(subscription);
  const currentId: PlanId = isCourier
    ? currentTier === 'pro'
      ? 'courier_pro'
      : 'courier_start'
    : (currentTier ?? 'start');
  const changePlan = async () => {
    const ok = await confirmAsync({
      title: t('billing.changeConfirmTitle'),
      message: t('billing.changeConfirmBody', {
        plan: t(`billing.plans.${plan}`),
        ht: price.ht,
      }),
      confirmLabel: t('billing.change'),
      cancelLabel: t('common.cancel'),
    });
    if (ok) await actions.changePlan(plan, interval);
  };
  const isWeb = Platform.OS === 'web';
  const subscriptionActive =
    subscription?.status === 'trialing' || subscription?.status === 'active';

  return (
    <>
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

        {isWeb && !subscriptionActive && subscription?.status !== 'past_due' ? (
          <>
            <View style={styles.chips} testID="plan-choice">
              {plans.map((id) => (
                <Chip
                  key={id}
                  testID={`plan-${planTier(id)}`}
                  label={t(`billing.plans.${id}`)}
                  selected={plan === id}
                  onPress={() => setTierChoice(planTier(id))}
                />
              ))}
            </View>
            <AppText variant="muted">{t(`billing.planInfo.${plan}`)}</AppText>
            <PlanFeatures plan={plan} />
            <View style={styles.chips} testID="interval-choice">
              {(['month', 'year'] as const).map((id) => (
                <Chip
                  key={id}
                  testID={`interval-${id}`}
                  label={t(`billing.intervals.${id}`)}
                  selected={interval === id}
                  onPress={() => setInterval(id)}
                />
              ))}
            </View>
            <AppText testID="plan-price">
              {t(`billing.price.${interval}`, { ht: price.ht, ttc: price.ttc })}
            </AppText>
            {interval === 'year' ? (
              <AppText variant="muted">
                {t('billing.yearlyHint', { monthly: formatCents(yearlyMonthlyHtCents(plan)) })}
              </AppText>
            ) : null}
          </>
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
            onPress={() => void run('subscribe', () => actions.subscribe(plan, interval))()}
          />
        ) : null}
        {isWeb && subscriptionActive ? (
          <>
            <AppText variant="subtitle">{t('billing.changeTitle')}</AppText>
            <AppText variant="muted">
              {t('billing.currentPlan', { plan: t(`billing.plans.${currentId}`) })}
            </AppText>
            <View style={styles.chips} testID="change-plan-choice">
              {plans.map((id) => (
                <Chip
                  key={id}
                  testID={`change-plan-${planTier(id)}`}
                  label={t(`billing.plans.${id}`)}
                  selected={plan === id}
                  onPress={() => setTierChoice(planTier(id))}
                />
              ))}
              {(['month', 'year'] as const).map((id) => (
                <Chip
                  key={id}
                  testID={`change-interval-${id}`}
                  label={t(`billing.intervals.${id}`)}
                  selected={interval === id}
                  onPress={() => setInterval(id)}
                />
              ))}
            </View>
            <AppText testID="change-price">
              {t(`billing.price.${interval}`, { ht: price.ht, ttc: price.ttc })}
            </AppText>
            <PlanFeatures plan={plan} />
            <AppText variant="muted">{t('billing.changeHint')}</AppText>
            <Button
              testID="change-plan"
              variant="secondary"
              title={t('billing.change')}
              loading={busy === 'change'}
              onPress={() => void run('change', changePlan)()}
            />
          </>
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

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  features: { gap: spacing.xs },
});
