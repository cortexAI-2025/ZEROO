import { useTranslation } from 'react-i18next';

import { AppText, Button, Card } from '@/components/ui';

import { usePush } from './usePush';

/**
 * Proposition d'activer les notifications, affichée au moment où elles servent
 * (après une commande, sur le tableau des commandes) et jamais au lancement de l'app.
 */
const TEXTS = {
  client: { title: 'notifications.clientTitle', body: 'notifications.clientBody' },
  merchant: { title: 'notifications.merchantTitle', body: 'notifications.merchantBody' },
  courier: { title: 'notifications.courierTitle', body: 'notifications.courierBody' },
} as const;

export function NotificationsPrompt({ audience }: { audience: keyof typeof TEXTS }) {
  const { t } = useTranslation();
  const { status, enable } = usePush();
  if (status === null || status === 'unsupported' || status === 'granted') return null;

  return (
    <Card testID="notifications-prompt">
      <AppText variant="subtitle">{t(TEXTS[audience].title)}</AppText>
      <AppText variant="muted">{t(TEXTS[audience].body)}</AppText>
      {status === 'denied' ? (
        <AppText variant="muted">{t('notifications.denied')}</AppText>
      ) : (
        <Button
          variant="secondary"
          title={t('notifications.enable')}
          onPress={() => void enable()}
        />
      )}
    </Card>
  );
}
