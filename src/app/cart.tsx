import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Chip, Screen, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { useDeliveryQuote, useMerchantDeliverySettings } from '@/features/cart/delivery';
import {
  cartDiscountCents,
  cartTotalCents,
  isValidDeliveryPhone,
  useCart,
} from '@/features/cart/store';
import { formatDistance } from '@/features/discover/location';
import { useLoyaltyCard } from '@/features/loyalty/hooks';
import { AddressField } from '@/features/merchant/AddressField';
import { cancelMyOrder } from '@/features/orders/api';
import { customerOrderKeys } from '@/features/orders/hooks';
import { payOrder } from '@/features/payments/pay';
import { errorKey } from '@/lib/errors';
import { formatCents } from '@/lib/money';
import { spacing, useThemeColors } from '@/theme';

export default function CartScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const {
    merchant,
    lines,
    note,
    rewardLineKey,
    setQuantity,
    setNote,
    setRewardLine,
    clear,
    fulfillment,
    setFulfillment,
    deliveryAddress,
    setDeliveryAddress,
    deliveryPhone,
    setDeliveryPhone,
    deliveryInstructions,
    setDeliveryInstructions,
  } = useCart();
  const deliverySettings = useMerchantDeliverySettings(merchant?.id).data;
  const isDelivery = !!deliverySettings?.delivery_enabled && fulfillment === 'delivery';
  const quoteQuery = useDeliveryQuote(isDelivery ? merchant?.id : undefined, deliveryAddress);
  const quote = isDelivery ? quoteQuery.data : undefined;
  const card = useLoyaltyCard(merchant?.id);
  const rewardsAvailable = card?.rewards_available ?? 0;
  // Le choix du menu offert n'a de sens que si un menu offert est disponible.
  const activeRewardKey = rewardsAvailable > 0 ? rewardLineKey : null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelledNotice, setCancelledNotice] = useState(false);
  const subtotal = cartTotalCents(lines);
  const discount = cartDiscountCents(lines, activeRewardKey);
  const total = subtotal - discount;
  // La course est payée au livreur, en plus du repas : prix fixé par le restaurant.
  const deliveryFee = isDelivery
    ? (quote?.fee_cents ?? deliverySettings?.delivery_fee_cents ?? 0)
    : 0;
  const grandTotal = total + deliveryFee;
  const deliveryReady =
    !isDelivery ||
    (!!deliveryAddress && quote?.available === true && isValidDeliveryPhone(deliveryPhone));
  // Retour de Stripe Checkout (web) sans paiement : on annule la commande en attente.
  const { cancelled } = useLocalSearchParams<{ cancelled?: string }>();

  useEffect(() => {
    if (!cancelled) return;
    void cancelMyOrder(cancelled)
      .catch(() => undefined)
      .then(() => setCancelledNotice(true));
  }, [cancelled]);

  const order = async () => {
    if (!merchant) return;
    setError(null);
    setCancelledNotice(false);
    setBusy(true);
    try {
      const result = await payOrder({
        merchantId: merchant.id,
        merchantName: merchant.name,
        lines,
        note,
        rewardLineKey: activeRewardKey,
        delivery:
          isDelivery && deliveryAddress
            ? {
                ...deliveryAddress,
                phone: deliveryPhone.trim(),
                instructions: deliveryInstructions,
              }
            : undefined,
      });
      if (result.kind === 'cancelled') setCancelledNotice(true);
      if (result.kind === 'paid') {
        clear();
        await queryClient.invalidateQueries({ queryKey: customerOrderKeys.all });
        router.replace({ pathname: '/order/[id]', params: { id: result.orderId } });
      }
    } catch (e) {
      setError(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  if (!merchant || lines.length === 0) {
    return (
      <Screen centered>
        <Stack.Screen options={{ title: t('client.cart.title'), headerShown: true }} />
        <AppText>{t('client.cart.empty')}</AppText>
        <Button
          variant="secondary"
          title={t('client.cart.continueShopping')}
          onPress={() => router.replace(session ? '/explore' : '/')}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: t('client.cart.title'), headerShown: true }} />
      <AppText variant="title">{merchant.name}</AppText>

      {lines.map((line) => (
        <Card key={line.key} testID={`cart-line-${line.name}`}>
          <View style={styles.row}>
            <View style={styles.flex}>
              <AppText>{line.name}</AppText>
              {line.options.length > 0 ? (
                <AppText variant="muted">{line.options.map((o) => o.name).join(', ')}</AppText>
              ) : null}
              <AppText variant="muted">{formatCents(line.unitPriceCents * line.quantity)}</AppText>
              {line.key === activeRewardKey ? (
                <AppText variant="link">🎁 {t('client.loyalty.rewardApplied')}</AppText>
              ) : null}
            </View>
            <Pressable
              accessibilityLabel={`${line.name} -`}
              onPress={() => setQuantity(line.key, line.quantity - 1)}
              hitSlop={8}>
              <Ionicons name="remove-circle-outline" size={28} color={colors.text} />
            </Pressable>
            <AppText variant="subtitle">{line.quantity}</AppText>
            <Pressable
              accessibilityLabel={`${line.name} +`}
              onPress={() => setQuantity(line.key, line.quantity + 1)}
              hitSlop={8}>
              <Ionicons name="add-circle-outline" size={28} color={colors.text} />
            </Pressable>
          </View>
          {rewardsAvailable > 0 && line.isLoyaltyMenu ? (
            <Button
              testID={`use-reward-${line.name}`}
              variant="ghost"
              title={
                line.key === activeRewardKey
                  ? t('client.loyalty.removeReward')
                  : t('client.loyalty.useReward')
              }
              onPress={() => setRewardLine(line.key === activeRewardKey ? null : line.key)}
            />
          ) : null}
        </Card>
      ))}

      {rewardsAvailable > 0 ? (
        <Card testID="cart-reward">
          <AppText>{t('client.loyalty.rewardsAvailable', { count: rewardsAvailable })}</AppText>
          <AppText variant="muted">
            {lines.some((l) => l.isLoyaltyMenu)
              ? t('client.loyalty.rewardHint')
              : t('client.loyalty.addMenuForReward')}
          </AppText>
        </Card>
      ) : null}

      <Button
        variant="ghost"
        title={t('client.cart.continueShopping')}
        onPress={() => router.push({ pathname: '/m/[slug]', params: { slug: merchant.slug } })}
      />

      {deliverySettings?.delivery_enabled ? (
        <Card testID="fulfillment">
          <View style={styles.chips}>
            <Chip
              testID="fulfillment-pickup"
              label={t('client.cart.pickup')}
              selected={!isDelivery}
              onPress={() => setFulfillment('pickup')}
            />
            <Chip
              testID="fulfillment-delivery"
              label={`🛵 ${t('client.cart.delivery')}`}
              selected={isDelivery}
              onPress={() => setFulfillment('delivery')}
            />
          </View>
          {isDelivery ? (
            <>
              <AddressField
                testID="delivery-address"
                label={t('client.cart.deliveryAddress')}
                hint={t('client.cart.deliveryAddressHint')}
                value={deliveryAddress ?? undefined}
                onChange={setDeliveryAddress}
              />
              <TextField
                testID="delivery-phone"
                label={t('client.cart.deliveryPhone')}
                value={deliveryPhone}
                onChangeText={setDeliveryPhone}
                keyboardType="phone-pad"
                autoComplete="tel"
                maxLength={20}
              />
              <TextField
                label={t('client.cart.deliveryInstructions')}
                placeholder={t('client.cart.instructionsPlaceholder')}
                value={deliveryInstructions}
                onChangeText={setDeliveryInstructions}
                maxLength={200}
              />
              {!deliveryAddress ? (
                <AppText variant="muted">{t('client.cart.deliveryNeedsAddress')}</AppText>
              ) : quoteQuery.isPending ? (
                <AppText variant="muted">{t('client.cart.quoteChecking')}</AppText>
              ) : quote?.available ? (
                <AppText variant="link" testID="delivery-quote">
                  {t('client.cart.quoteOk', { distance: formatDistance(quote.distance_m ?? 0) })}
                </AppText>
              ) : quote?.reason ? (
                <AppText variant="error" testID="delivery-quote">
                  {t(`client.cart.quoteReasons.${quote.reason}`)}
                </AppText>
              ) : null}
            </>
          ) : null}
        </Card>
      ) : null}

      <TextField
        label={t('client.cart.note')}
        placeholder={t('client.cart.notePlaceholder')}
        value={note}
        onChangeText={setNote}
        maxLength={300}
        multiline
      />

      {discount > 0 ? (
        <>
          <View style={styles.row}>
            <AppText style={styles.flex}>{t('client.cart.subtotal')}</AppText>
            <AppText>{formatCents(subtotal)}</AppText>
          </View>
          <View style={styles.row}>
            <AppText style={styles.flex}>{t('client.loyalty.rewardApplied')}</AppText>
            <AppText testID="cart-discount">− {formatCents(discount)}</AppText>
          </View>
        </>
      ) : null}
      {isDelivery ? (
        <View style={styles.row}>
          <AppText style={styles.flex}>{t('client.cart.deliveryFee')}</AppText>
          <AppText testID="cart-delivery-fee">{formatCents(deliveryFee)}</AppText>
        </View>
      ) : null}
      <View style={styles.row}>
        <AppText variant="subtitle" style={styles.flex}>
          {t('client.cart.total')}
        </AppText>
        <AppText variant="subtitle" testID="cart-total">
          {formatCents(grandTotal)}
        </AppText>
      </View>
      <AppText variant="muted">
        {grandTotal === 0 ? t('client.loyalty.freeOrder') : t('client.cart.paymentInfo')}
      </AppText>
      {isDelivery ? <AppText variant="muted">{t('client.cart.twoPayments')}</AppText> : null}
      <AppText variant="muted">{t('client.cart.noFees')}</AppText>
      {cancelledNotice ? (
        <AppText variant="muted">{t('client.cart.paymentCancelled')}</AppText>
      ) : null}

      {error ? <AppText variant="error">{error}</AppText> : null}
      {session ? (
        <Button
          testID="place-order"
          title={
            grandTotal === 0
              ? t('client.cart.orderFree')
              : t('client.cart.order', { price: formatCents(grandTotal) })
          }
          loading={busy}
          disabled={!deliveryReady}
          onPress={() => void order()}
        />
      ) : (
        <Button title={t('client.cart.signInToOrder')} onPress={() => router.push('/sign-in')} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
