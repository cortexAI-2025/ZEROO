import { useTranslation } from 'react-i18next';
import { ActivityIndicator } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { errorKey } from '@/lib/errors';
import { useIsOnline } from '@/lib/network';

/** Écran de chargement ou d'erreur d'une requête, avec bouton « Réessayer ». */
export function QueryState({ error, onRetry }: { error?: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  const online = useIsOnline();
  if (!error && !online) {
    // Hors connexion, React Query met les requêtes en pause (ni succès ni erreur) : sans ce message, l'écran resterait
    // sur un indicateur de chargement indéfini. La requête reprend toute seule au retour du réseau.
    return (
      <Screen centered>
        <AppText variant="error">{t('common.networkError')}</AppText>
      </Screen>
    );
  }
  if (!error) {
    return (
      <Screen centered>
        <ActivityIndicator size="large" />
      </Screen>
    );
  }
  return (
    <Screen centered>
      <AppText variant="error">{t(errorKey(error))}</AppText>
      {onRetry ? <Button variant="secondary" title={t('common.retry')} onPress={onRetry} /> : null}
    </Screen>
  );
}
