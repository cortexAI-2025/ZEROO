import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';

import { AppText, Badge, Button, Card, QueryState, Screen } from '@/components/ui';
import { BasketsSection } from '@/features/baskets/BasketsSection';
import { CartBar } from '@/features/cart/CartBar';
import { DirectoryMap, MAP_SUPPORTED } from '@/features/discover/DirectoryMap';
import { useActiveOffers } from '@/features/happyhour/hooks';
import { offerEndLabel } from '@/features/happyhour/pricing';
import { OfferPrice } from '@/features/happyhour/OfferPrice';
import { ItemSheet } from '@/features/cart/ItemSheet';
import { directionsUrl, formatDistance } from '@/features/discover/location';
import { useMerchantPage } from '@/features/discover/hooks';
import { useAuth } from '@/features/auth/AuthProvider';
import { useLoyaltyCard } from '@/features/loyalty/hooks';
import { LoyaltyProgress } from '@/features/loyalty/LoyaltyProgress';
import { slotsLabel } from '@/features/menu/slotLabel';
import type { MenuItem } from '@/features/menu/types';
import { formatFrenchDate } from '@/features/merchant/dates';
import { siteStyle } from '@/features/merchant/minisite';
import { shortTime, WEEKDAYS } from '@/features/merchant/hours';
import { deliveryPausedNow, showsAddress } from '@/features/merchant/modes';
import {
  type MerchantCategory,
  merchantPublicUrl,
  type OpeningHour,
} from '@/features/merchant/types';
import { Thumb } from '@/features/photos/Thumb';
import { formatCents } from '@/lib/money';
import { useNow } from '@/lib/useNow';
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
  const now = useNow(60_000);
  // Offres Happy Hour du mode de commande par défaut (retrait, sinon livraison).
  const offerMode = page.data?.merchant.offers_pickup === false ? 'delivery' : 'pickup';
  const { offers } = useActiveOffers(page.data?.merchant.id, offerMode);

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
  const hasAddress = showsAddress(merchant);
  // Mini-site Pro : logo, accroche, présentation, couleur. Sans Pro : fiche de commande Start.
  const site = siteStyle(merchant);
  // Offres en vigueur, une ligne par offre (la plus proche de se terminer).
  const activeOffers = [...new Map([...offers.values()].map((o) => [o.happy_hour_id, o])).values()];
  // Fermeture exceptionnelle en cours ou annoncée (la fin est exclusive : minuit du lendemain).
  const nowMs = now;
  const closure = merchant.merchant_closures
    .filter((c) => Date.parse(c.ends_at) > nowMs)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
  const closureActive = !!closure && Date.parse(closure.starts_at) <= nowMs;
  const closureRange = closure
    ? t('client.merchant.closureRange', {
        from: formatFrenchDate(closure.starts_at),
        to: formatFrenchDate(new Date(Date.parse(closure.ends_at) - 1).toISOString()),
      })
    : '';

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: merchant.name, headerShown: true }} />
      <ScrollView contentContainerStyle={styles.content}>
        {site.accent ? (
          <View testID="site-accent" style={[styles.accentBar, { backgroundColor: site.accent }]} />
        ) : null}
        {merchant.photo_url ? (
          <Image
            source={{ uri: merchant.photo_url }}
            style={styles.cover}
            contentFit="cover"
            accessibilityLabel={merchant.name}
          />
        ) : null}
        <View style={styles.titleRow}>
          {site.logoUrl ? (
            <Image
              testID="site-logo"
              source={{ uri: site.logoUrl }}
              style={styles.logo}
              contentFit="cover"
              accessibilityLabel={merchant.name}
            />
          ) : null}
          <View style={styles.flex}>
            <AppText variant="title">{merchant.name}</AppText>
            {site.tagline ? (
              <AppText
                variant="link"
                testID="site-tagline"
                style={site.accent ? { color: site.accent } : undefined}>
                {site.tagline}
              </AppText>
            ) : null}
          </View>
        </View>
        {site.about ? <AppText testID="site-about">{site.about}</AppText> : null}
        <AppText variant="muted">
          {t(`merchant.categories.${merchant.category as MerchantCategory}`)} ·{' '}
          {hasAddress
            ? `${merchant.address_line}, ${merchant.postal_code} ${merchant.city}`
            : t('client.merchant.serviceZone', {
                city: merchant.city,
                distance: formatDistance(merchant.delivery_radius_m),
              })}
        </AppText>
        <View style={styles.badges} testID="merchant-modes">
          {merchant.offers_pickup ? <Badge label={t('client.merchant.modePickup')} /> : null}
          {merchant.delivery_available_now ? (
            <Badge label={t('client.merchant.modeDelivery')} />
          ) : null}
        </View>
        {deliveryPausedNow(merchant) ? (
          <AppText variant="muted" testID="delivery-paused">
            {t('client.merchant.deliveryPaused')}
          </AppText>
        ) : null}
        {merchant.delivery_available_now ? (
          <AppText variant="link" testID="merchant-delivers">
            🛵 {t('client.merchant.delivers', { price: formatCents(merchant.delivery_fee_cents) })}
          </AppText>
        ) : null}
        {!merchant.offers_pickup && merchant.delivery_available_now ? (
          <AppText variant="muted">{t('client.merchant.deliveryOnly')}</AppText>
        ) : null}
        {merchant.description ? <AppText>{merchant.description}</AppText> : null}

        {merchant.offers_pickup && merchant.pickup_instructions ? (
          <Card testID="pickup-instructions">
            <AppText variant="subtitle">{t('client.merchant.pickupInstructions')}</AppText>
            <AppText>{merchant.pickup_instructions}</AppText>
          </Card>
        ) : null}

        <View style={styles.actions}>
          {hasAddress ? (
            <Button
              variant="secondary"
              title={t('client.merchant.directions')}
              onPress={() =>
                void Linking.openURL(
                  directionsUrl(Platform.OS, merchant.latitude ?? 0, merchant.longitude ?? 0),
                )
              }
            />
          ) : null}
          {merchant.public_phone ? (
            <Button
              variant="secondary"
              title={t('client.merchant.call')}
              onPress={() =>
                void Linking.openURL(`tel:${merchant.public_phone!.replace(/\s/g, '')}`)
              }
            />
          ) : null}
          <Button
            variant="ghost"
            title={t('client.merchant.hours')}
            onPress={() => setShowHours((v) => !v)}
          />
        </View>
        {showHours ? <Hours hours={merchant.merchant_opening_hours} /> : null}

        {activeOffers.length > 0 ? (
          <Card testID="active-offers">
            <AppText variant="subtitle">{t('happyHour.nowTitle')}</AppText>
            {activeOffers.map((o) => (
              <AppText key={o.happy_hour_id}>
                {o.name} · {t('happyHour.until', { time: offerEndLabel(o.ends_at) })}
              </AppText>
            ))}
          </Card>
        ) : null}

        {site.personalized ? (
          <View style={styles.actions}>
            <Button
              testID="site-share"
              variant="secondary"
              title={t('common.share')}
              onPress={() => {
                const url = merchantPublicUrl(merchant.slug);
                void Share.share({ message: `${merchant.name} : ${url}`, url }).catch(
                  () => undefined,
                );
              }}
            />
          </View>
        ) : null}
        {site.personalized && hasAddress && MAP_SUPPORTED ? (
          <DirectoryMap
            merchants={[
              {
                slug: merchant.slug,
                name: merchant.name,
                is_accepting_orders: !!merchant.is_accepting_orders,
                latitude: merchant.latitude ?? 0,
                longitude: merchant.longitude ?? 0,
              },
            ]}
            center={null}
            selectedSlug={merchant.slug}
            onSelect={() => undefined}
          />
        ) : null}

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
              {!merchant.has_order_mode
                ? t('client.merchant.noMode')
                : closureActive
                  ? t('client.merchant.closureActive', { range: closureRange })
                  : merchant.is_open_now
                    ? t('client.merchant.pausedBanner')
                    : t('client.merchant.closedBanner')}
            </AppText>
            {closureActive && closure?.reason ? (
              <AppText variant="muted">{closure.reason}</AppText>
            ) : null}
          </Card>
        ) : null}
        {closure && !closureActive ? (
          <AppText variant="muted" testID="closure-upcoming">
            {t('client.merchant.closureUpcoming', { range: closureRange })}
            {closure.reason ? ` · ${closure.reason}` : ''}
          </AppText>
        ) : null}

        {menu.map((category) => (
          <View key={category.id} style={styles.category}>
            <AppText variant="subtitle">{category.name}</AppText>
            {category.menu_items.map((item) => {
              // Produit servi seulement à certaines heures : grisé le reste du temps.
              const inSlot = item.is_in_slot_now !== false;
              const serviceHours = slotsLabel(
                item.menu_item_slots,
                (day) =>
                  t(`merchant.hours.days.${day as 1}`)
                    .slice(0, 3)
                    .toLowerCase(),
                t('client.merchant.everyDay'),
              );
              return (
                <Pressable
                  key={item.id}
                  testID={`menu-item-${item.name}`}
                  accessibilityRole="button"
                  disabled={!canOrder || !item.is_available || !inSlot}
                  onPress={() => setSelected(item)}
                  style={({ pressed }) => [
                    styles.item,
                    { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                  ]}>
                  {item.image_url ? (
                    <Thumb url={item.image_url} size={72} label={item.name} />
                  ) : null}
                  <View style={styles.flex}>
                    <AppText style={(!item.is_available || !inSlot) && { color: colors.textMuted }}>
                      {item.name}
                    </AppText>
                    {item.description ? (
                      <AppText variant="muted">{item.description}</AppText>
                    ) : null}
                    {offers.get(item.id) ? (
                      <OfferPrice offer={offers.get(item.id)!} />
                    ) : (
                      <AppText variant="muted">{formatCents(item.price_cents)}</AppText>
                    )}
                    {serviceHours ? (
                      <AppText variant="muted" testID={`service-hours-${item.name}`}>
                        {t('client.merchant.servedAt', { hours: serviceHours })}
                      </AppText>
                    ) : null}
                  </View>
                  {item.is_formula ? <Badge label={t('client.merchant.formula')} /> : null}
                  {item.is_loyalty_menu ? <Badge label={t('client.merchant.loyaltyMenu')} /> : null}
                  {!item.is_available ? <Badge label={t('client.merchant.unavailable')} /> : null}
                  {item.is_available && !inSlot ? (
                    <Badge label={t('client.merchant.outOfSlot')} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
        <BasketsSection merchantId={merchant.id} />
      </ScrollView>
      <CartBar />
      {selected ? (
        <ItemSheet
          item={selected}
          offer={offers.get(selected.id)}
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
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  accentBar: { height: 6, borderRadius: radius.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  logo: { width: 64, height: 64, borderRadius: radius.md },
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
