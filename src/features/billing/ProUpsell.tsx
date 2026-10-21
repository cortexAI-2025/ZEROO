import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { AppText, Button, Card } from '@/components/ui';

/** Invitation à passer en formule Pro, affichée à la place d'une fonction réservée. */
export function ProUpsell({ feature }: { feature: string }) {
  const { t } = useTranslation();
  return (
    <Card testID="pro-upsell">
      <AppText variant="subtitle">{t('billing.upsell.title')}</AppText>
      <AppText variant="muted">{feature}</AppText>
      <AppText variant="muted">{t('billing.upsell.body')}</AppText>
      <Button
        variant="secondary"
        title={t('billing.upsell.action')}
        onPress={() => router.push('/pro/shop')}
      />
    </Card>
  );
}
