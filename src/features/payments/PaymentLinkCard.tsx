import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking } from 'react-native';

import { AppText, Badge, Button, Card, TextField } from '@/components/ui';
import { errorKey } from '@/lib/errors';

import { isValidPaymentLink } from './pay';

type Props = {
  role: 'merchant' | 'courier';
  link: string | null;
  onSave: (link: string | null) => Promise<unknown>;
};

/**
 * Lien de paiement du professionnel (SumUp, PayPal, Stripe Payment Link, Lydia Pro…) : la page
 * de paiement de son propre fournisseur, qui accepte la carte, Apple Pay et Google Pay et verse
 * l'argent sur son compte bancaire. ZeeRoo l'ouvre pour le client et n'encaisse rien.
 */
export function PaymentLinkCard({ role, link, onSave }: Props) {
  const { t } = useTranslation();
  const [value, setValue] = useState(link ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const trimmed = value.trim();
  const valid = trimmed === '' || isValidPaymentLink(trimmed);

  const save = async () => {
    setMessage(null);
    setBusy(true);
    try {
      await onSave(trimmed || null);
      setMessage(t('payments.link.saved'));
    } catch (e) {
      setMessage(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card testID="payment-link-card">
      <AppText variant="subtitle">{t('payments.link.title')}</AppText>
      {link ? <Badge label={t('payments.link.active')} tone="success" /> : null}
      <AppText variant="muted">{t(`payments.link.intro.${role}`)}</AppText>
      <TextField
        testID="payment-link"
        label={t('payments.link.label')}
        placeholder="https://pay.sumup.com/…"
        value={value}
        onChangeText={setValue}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        error={valid ? undefined : t('payments.link.invalid')}
      />
      <Button
        testID="payment-link-save"
        title={t('common.save')}
        disabled={!valid || trimmed === (link ?? '')}
        loading={busy}
        onPress={() => void save()}
      />
      {link ? (
        <Button
          variant="ghost"
          title={t('payments.link.test')}
          onPress={() => void Linking.openURL(link)}
        />
      ) : null}
      <AppText variant="muted">{t('payments.link.hint')}</AppText>
      {message ? <AppText variant="muted">{message}</AppText> : null}
    </Card>
  );
}
