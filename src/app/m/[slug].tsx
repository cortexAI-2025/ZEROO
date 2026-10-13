import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Badge, Button, Card, QueryState, Screen } from '@/components/ui';
import { CartBar } from '@/features/cart/CartBar';
import { ItemSheet } from '@/features/cart/ItemSheet';
import { directionsUrl } from '@/features/discover/location';
import { useMerchantPage } from '@/features/discover/hooks';
import { useAuth } from '@/features/auth/AuthProvider';
import { useLoyaltyCard } from '@/features/loyalty/hooks';
import { LoyaltyProgress } from '@/features/loyalty/LoyaltyProgress';
import type { MenuItem } from '@/features/menu/types';
import { shortTime, WEEKDAYS } from '@/features/merchant/hours';
import type { MerchantCategory, OpeningHour } from '@/features/merchant/types';
import { Thumb } from '@/features/photos/Thumb';
import { formatCents } from '@/lib/money';
import { radius, spacing, useThemeColors } from '@/theme';

const isoWeekday = () => ((new Date().getDay() + 6) % 7) + 1;

function Hours({ hours }: { hours: OpeningHour[] }) {
  const { t } = useTranslation();
  const today = isoWeekday();
  return (
    <View style={styles.hours}>
      {WEEKDAYS.map((day) => {
        const slots = hours
          .filter((h) => h.weekday === day)
          .sort((a, b) => a.opens_at.localeCompare(b.opens_at));
        return (
          <View key={day} style={styles.row}>
            <AppText variant={day === today ? 'body' : 'muted'} style={styles.day}>
              {t(`merchant.hours.days.${day}`)}
            </AppText>
            <AppText variant={day === today ? 'body' : 'muted'}>
              {slots.length
                ? slots
                    .map((s) => `${shortTime(s.opens_at)} – ${shortTime(s.closes_at)}`)
                    .join(', ')
                : t('client.merchant.closedToday')}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

export default function MerchantPageScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const page = useMerchantPage(slug);
  const [selected, setSelected] = useState<MenuItem | null>(null);
  const [showHours, setShowHours] = useState(false);
  const { session } = useAuth();
  const card = useLoyaltyCard(page.data?.merchant.id);

  if (page.data === null) {
    return (
      <Screen centered>
        <AppText>{t('client.merchant.notFound')}</AppText>
      </Screen>
    );
  }
  if (!page.data) return <QueryState error={page.error} onRetry={() => void page.refetch()} />;

  const { merchant, menu } = page.data;
  const canOrder = !!merchant.is_accepting_orders;

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: merchant.name, headerShown: true }} />
      <ScrollView contentContainerStyle={styles.content}>
        {merchant.photo_url ? (
          <Image
            source={{ uri: merchant.photo_url }}
            style={styles.cover}
            contentFit="cover"
            accessibilityLabel={merchant.name}
          />
        ) : null}
        <AppText variant="title">{merchant.name}</AppText>
        <AppText variant="muted">
          {t(`merchant.categories.${merchant.category as MerchantCategory}`)} ·{' '}
          {merchant.address_line}, {merchant.postal_code} {merchant.city}
        </AppText>
        {merchant.delivery_enabled ? (
          <AppText variant="link" testID="merchant-delivers">
            🛵 {t('client.merchant.delivers', { price: formatCents(merchant.delivery_fee_cents) })}
          </AppText>
        ) : null}
        {merchant.description ? <AppText>{merchant.description}</AppText> : null}

        <View style={styles.actions}>
          <Button
            variant="secondary"
            title={t('client.merchant.directions')}
            onPress={() =>
              void Linking.openURL(
                directionsUrl(Platform.OS, merchant.latitude, merchant.longitude),
              )
            }
          />
          {merchant.phone ? (
            <Button
              variant="secondary"
              title={t('client.merchant.call')}
              onPress={() => void Linking.openURL(`tel:${merchant.phone!.replace(/\s/g, '')}`)}
            />
          ) : null}
          <Button
            variant="ghost"
            title={t('client.merchant.hours')}
            onPress={() => setShowHours((v) => !v)}
          />
        </View>
        {showHours ? <Hours hours={merchant.merchant_opening_hours} /> : null}

        {menu.some((c) => c.menu_items.some((i) => i.is_loyalty_menu)) ? (
          <Card testID="merchant-loyalty">
            <AppText variant="subtitle">
              {session
                ? t('client.loyalty.cardHere', { name: merchant.name })
                : t('client.merchant.loyaltyRule')}
            </AppText>
            {session ? (
              <LoyaltyProgress
                paidMenus={card?.paid_menus_count ?? 0}
                rewardsAvailable={card?.rewards_available ?? 0}
              />
            ) : (
              <AppText variant="muted">{t('client.loyalty.signInForCard')}</AppText>
            )}
          </Card>
        ) : null}

        {!canOrder ? (
          <Card testID="not-accepting">
            <AppText>
              {merchant.is_open_now
                ? t('client.merchant.pausedBanner')
                : t('client.merchant.closedBanner')}
            </AppText>
          </Card>
        ) : null}

        {menu.map((category) => (
          <View key={category.id} style={styles.category}>
            <AppText variant="subtitle">{category.name}</AppText>
            {category.menu_items.map((item) => (
              <Pressable
                key={item.id}
                testID={`menu-item-${item.name}`}
                accessibilityRole="button"
                disabled={!canOrder || !item.is_available}
                onPress={() => setSelected(item)}
                style={({ pressed }) => [
                  styles.item,
                  { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}>
                {item.image_url ? <Thumb url={item.image_url} size={72} label={item.name} /> : null}
                <View style={styles.flex}>
                  <AppText style={!item.is_available && { color: colors.textMuted }}>
                    {item.name}
                  </AppText>
                  {item.description ? <AppText variant="muted">{item.description}</AppText> : null}
                  <AppText variant="muted">{formatCents(item.price_cents)}</AppText>
                </View>
                {item.is_loyalty_menu ? <Badge label={t('client.merchant.loyaltyMenu')} /> : null}
                {!item.is_available ? <Badge label={t('client.merchant.unavailable')} /> : null}
              </Pressable>
            ))}
          </View>
        ))}
      </ScrollView>
      <CartBar />
      {selected ? (
        <ItemSheet
          item={selected}
          merchant={{ id: merchant.id, slug: merchant.slug, name: merchant.name }}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cover: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.lg },
  hours: { gap: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.md },
  day: { width: 90 },
  category: { gap: spacing.xs, marginTop: spacing.sm },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
