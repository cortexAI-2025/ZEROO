import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText, Badge, Button, Card, SwitchRow, TextField } from '@/components/ui';
import { errorKey } from '@/lib/errors';

import { isValidPublicPhone } from './publicPhone';

type Props = {
  phone: string | null;
  authorized: boolean;
  onSave: (patch: {
    public_phone?: string | null;
    public_phone_authorized?: boolean;
  }) => Promise<unknown>;
};

/**
 * Numéro professionnel affiché sur le mini-site. Distinct du téléphone de contact du compte
 * (privé). Publié seulement si le restaurateur l'autorise ; l'autorisation se retire à tout moment
 * et le numéro quitte aussitôt le mini-site (la base ne le rend plus aux visiteurs).
 */
export function PublicPhoneCard({ phone, authorized, onSave }: Props) {
  const { t } = useTranslation();
  const [value, setValue] = useState(phone ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const trimmed = value.trim();
  const valid = isValidPublicPhone(trimmed);
  const saved = trimmed === (phone ?? '');

  const run = async (patch: Parameters<Props['onSave']>[0], okMessage: string | null) => {
    setMessage(null);
    setBusy(true);
    try {
      await onSave(patch);
      setMessage(okMessage);
    } catch (e) {
      setMessage(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card testID="public-phone-card">
      <AppText variant="subtitle">{t('merchant.publicPhone.title')}</AppText>
      <Badge
        label={t(
          authorized && phone ? 'merchant.publicPhone.published' : 'merchant.publicPhone.private',
        )}
        tone={authorized && phone ? 'success' : 'neutral'}
      />
      <AppText variant="muted">{t('merchant.publicPhone.intro')}</AppText>
      <TextField
        testID="public-phone"
        label={t('merchant.publicPhone.label')}
        value={value}
        onChangeText={setValue}
        keyboardType="phone-pad"
        error={valid ? undefined : t('merchant.publicPhone.invalid')}
      />
      <Button
        testID="public-phone-save"
        title={t('common.save')}
        disabled={!valid || saved}
        loading={busy}
        onPress={() =>
          // Effacer le numéro retire aussi l'autorisation : rien ne reste publié.
          void run(
            trimmed
              ? { public_phone: trimmed }
              : { public_phone: null, public_phone_authorized: false },
            t('merchant.publicPhone.saved'),
          )
        }
      />
      <SwitchRow
        testID="public-phone-switch"
        label={t('merchant.publicPhone.authorize')}
        hint={t('merchant.publicPhone.authorizeHint')}
        value={authorized}
        disabled={busy || (!authorized && (!phone || !saved))}
        onValueChange={(next) => void run({ public_phone_authorized: next }, null)}
      />
      {!phone ? <AppText variant="muted">{t('merchant.publicPhone.needsNumber')}</AppText> : null}
      {message ? <AppText variant="muted">{message}</AppText> : null}
    </Card>
  );
}
