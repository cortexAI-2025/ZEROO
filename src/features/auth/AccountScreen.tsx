import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { router } from 'expo-router';

import { AppText, Button, ListRow, Screen } from '@/components/ui';
import { useIsPlatformAdmin } from '@/features/marketing/hooks';
import { confirmAsync } from '@/lib/confirm';
import { errorKey } from '@/lib/errors';

import { deleteAccount, signOut } from './api';
import { useAuth } from './AuthProvider';

/**
 * Écran « Compte », partagé par les espaces client, commerçant et livreur. `children` :
 * contenu propre à l'espace (profil et abonnement du livreur), affiché avant les actions.
 */
export function AccountScreen({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  const { session } = useAuth();
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

  const admin = useIsPlatformAdmin();
  return (
    <Screen scroll>
      <AppText variant="title">{t('account.title')}</AppText>
      <AppText variant="muted">
        {t('account.signedInAs', { email: session?.user.email ?? '' })}
      </AppText>
      {children}
      {admin.data ? (
        <ListRow
          testID="admin-entry"
          title={t('admin.open')}
          onPress={() => router.push('/admin')}
        />
      ) : null}

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
