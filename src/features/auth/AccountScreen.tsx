import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppText, Button, Screen } from '@/components/ui';
import { useSpace } from '@/features/space/SpaceProvider';
import { confirmAsync } from '@/lib/confirm';
import { errorKey } from '@/lib/errors';

import { deleteAccount, signOut } from './api';
import { useAuth } from './AuthProvider';

const SWITCH_LABELS = {
  client: 'space.switchToClient',
  merchant: 'space.switchToMerchant',
  courier: 'space.switchToCourier',
} as const;

/**
 * Écran « Compte », partagé par les espaces client, commerçant et livreur. `children` :
 * contenu propre à l'espace (profil et abonnement du livreur), affiché avant les actions.
 */
export function AccountScreen({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const { space, setSpace } = useSpace();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setError(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    const confirmed = await confirmAsync({
      title: t('account.deleteConfirmTitle'),
      message: t('account.deleteConfirmBody'),
      confirmLabel: t('account.deleteConfirmAction'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (confirmed) await run(deleteAccount);
  };

  return (
    <Screen scroll>
      <AppText variant="title">{t('account.title')}</AppText>
      <AppText variant="muted">
        {t('account.signedInAs', { email: session?.user.email ?? '' })}
      </AppText>
      {children}

      {(['client', 'merchant', 'courier'] as const)
        .filter((other) => other !== space)
        .map((other) => (
          <Button
            key={other}
            testID={`switch-space-${other}`}
            variant="secondary"
            title={t(SWITCH_LABELS[other])}
            onPress={() => setSpace(other)}
          />
        ))}
      <Button
        variant="secondary"
        title={t('account.signOut')}
        loading={busy}
        onPress={() => void run(signOut)}
      />
      <Button
        variant="danger"
        title={t('account.deleteAccount')}
        disabled={busy}
        onPress={() => void onDelete()}
      />
      {error ? <AppText variant="error">{error}</AppText> : null}
    </Screen>
  );
}
