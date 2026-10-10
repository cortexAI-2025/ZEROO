import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';

import { AppText, Card, QueryState, Screen } from '@/components/ui';
import { useMyLoyaltyCards } from '@/features/loyalty/hooks';
import { LoyaltyProgress } from '@/features/loyalty/LoyaltyProgress';

export default function LoyaltyScreen() {
  const { t } = useTranslation();
  const cards = useMyLoyaltyCards();
  if (!cards.data) return <QueryState error={cards.error} onRetry={() => void cards.refetch()} />;

  return (
    <Screen scroll>
      <AppText variant="title">{t('client.loyalty.title')}</AppText>
      <AppText variant="muted">{t('client.loyalty.rule')}</AppText>
      {cards.data.length === 0 ? (
        <AppText variant="muted">{t('client.loyalty.empty')}</AppText>
      ) : null}
      {cards.data.map((card) => (
        <Pressable
          key={card.merchant_id}
          accessibilityRole="button"
          onPress={() =>
            card.merchants &&
            router.push({ pathname: '/m/[slug]', params: { slug: card.merchants.slug } })
          }>
          <Card testID={`loyalty-${card.merchants?.slug}`}>
            <AppText variant="subtitle">{card.merchants?.name}</AppText>
            <LoyaltyProgress
              paidMenus={card.paid_menus_count}
              rewardsAvailable={card.rewards_available}
            />
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
