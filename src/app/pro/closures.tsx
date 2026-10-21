import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText, Button, Card, QueryState, Screen, TextField } from '@/components/ui';
import { useClosureActions, useClosures } from '@/features/merchant/closures';
import { formatFrenchDate, parseFrenchDate } from '@/features/merchant/dates';
import { useCurrentMerchant } from '@/features/merchant/hooks';
import { errorKey } from '@/lib/errors';

/** Fermetures exceptionnelles (congés, travaux) : prioritaires sur les horaires habituels. */
export default function ClosuresScreen() {
  const { t } = useTranslation();
  const merchant = useCurrentMerchant();
  const closures = useClosures(merchant.id);
  const actions = useClosureActions(merchant.id);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const fromIso = parseFrenchDate(from);
  const toIso = parseFrenchDate(to || from);
  const rangeError =
    submitted && (!fromIso || !toIso || toIso < fromIso) ? t('merchant.closures.invalid') : null;

  const submit = () => {
    setSubmitted(true);
    if (!fromIso || !toIso || toIso < fromIso) return;
    actions.add.mutate(
      { from: fromIso, to: toIso, reason },
      {
        onSuccess: () => {
          setFrom('');
          setTo('');
          setReason('');
          setSubmitted(false);
        },
      },
    );
  };

  if (!closures.data) {
    return <QueryState error={closures.error} onRetry={() => void closures.refetch()} />;
  }

  return (
    <Screen scroll>
      <AppText variant="muted">{t('merchant.closures.hint')}</AppText>

      {closures.data.length === 0 ? (
        <AppText variant="muted">{t('merchant.closures.empty')}</AppText>
      ) : (
        closures.data.map((closure) => {
          // La fin est exclusive (minuit du lendemain du dernier jour fermé).
          const lastDay = new Date(Date.parse(closure.ends_at) - 1).toISOString();
          return (
            <Card key={closure.id} testID={`closure-${closure.id}`}>
              <AppText variant="subtitle">
                {t('merchant.closures.range', {
                  from: formatFrenchDate(closure.starts_at),
                  to: formatFrenchDate(lastDay),
                })}
              </AppText>
              {closure.reason ? <AppText variant="muted">{closure.reason}</AppText> : null}
              <Button
                variant="ghost"
                title={t('common.delete')}
                loading={actions.remove.isPending && actions.remove.variables === closure.id}
                onPress={() => actions.remove.mutate(closure.id)}
              />
            </Card>
          );
        })
      )}

      <Card>
        <AppText variant="subtitle">{t('merchant.closures.add')}</AppText>
        <TextField
          testID="closure-from"
          label={t('merchant.closures.from')}
          value={from}
          onChangeText={setFrom}
          placeholder="24/12/2026"
          keyboardType="numbers-and-punctuation"
        />
        <TextField
          testID="closure-to"
          label={t('merchant.closures.to')}
          value={to}
          onChangeText={setTo}
          placeholder={t('merchant.closures.toPlaceholder')}
          keyboardType="numbers-and-punctuation"
        />
        <TextField
          testID="closure-reason"
          label={t('merchant.closures.reason')}
          value={reason}
          onChangeText={setReason}
          maxLength={100}
        />
        {rangeError ? <AppText variant="error">{rangeError}</AppText> : null}
        {actions.add.error ? (
          <AppText variant="error">{t(errorKey(actions.add.error))}</AppText>
        ) : null}
        <Button
          testID="closure-save"
          title={t('merchant.closures.save')}
          loading={actions.add.isPending}
          onPress={submit}
        />
      </Card>
    </Screen>
  );
}
