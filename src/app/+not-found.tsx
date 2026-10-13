import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { AppText, Button, Screen } from '@/components/ui';

/** Adresse inconnue (lien périmé, faute de frappe) : retour à l'accueil. */
export default function NotFoundScreen() {
  const { t } = useTranslation();
  return (
    <Screen>
      <Stack.Screen options={{ title: t('notFound.title') }} />
      <AppText variant="title" accessibilityRole="header">
        {t('notFound.title')}
      </AppText>
      <AppText variant="muted">{t('notFound.body')}</AppText>
      <Button title={t('notFound.home')} onPress={() => router.replace('/')} />
    </Screen>
  );
}
