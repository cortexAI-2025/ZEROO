import { useTranslation } from 'react-i18next';
import { ActivityIndicator } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { errorKey } from '@/lib/errors';

/** Écran de chargement ou d'erreur d'une requête, avec bouton « Réessayer ». */
export function QueryState({ error, onRetry }: { error?: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
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
