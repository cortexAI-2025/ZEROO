import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Chip, Screen, TextField } from '@/components/ui';
import type { SavedAddress } from '@/features/account/api';
import { useAddresses } from '@/features/account/hooks';
import { useAuth } from '@/features/auth/AuthProvider';
import { signOut } from '@/features/auth/api';
import { useDeliveryQuote, useMerchantDeliverySettings } from '@/features/cart/delivery';
import { repriceLines } from '@/features/cart/reprice';
import { SchedulePicker } from '@/features/cart/SchedulePicker';
import { cartDiscountCents, isValidDeliveryPhone, useCart } from '@/features/cart/store';
import { fetchMerchantPage } from '@/features/discover/api';
import { formatDistance } from '@/features/discover/location';
import { useActiveOffers } from '@/features/happyhour/hooks';
import {
  cartLinePricing,
  cartTotalWithOffers,
  type OfferChange,
  offerChanges,
} from '@/features/happyhour/pricing';
import { useLoyaltyCard } from '@/features/loyalty/hooks';
import { AddressField } from '@/features/merchant/AddressField';
import { deliveryPausedNow, orderModes, resolveMode } from '@/features/merchant/modes';
import { customerOrderKeys } from '@/features/orders/hooks';
import { useReorderReport } from '@/features/orders/reorderReport';
import { placeOrder } from '@/features/payments/pay';
import { errorKey } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { DEFAULT_TIMEZONE, formatDateTimeIn } from '@/lib/zone';
import { formatCents } from '@/lib/money';
import { spacing, useThemeColors } from '@/theme';

export default function CartScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const queryClient = useQueryClient();
  const { session, isLoading: authLoading } = useAuth();
  const [confirmedCustomerId, setConfirmedCustomerId] = useState<string | null>(null);
  const {
    merchant,
    lines,
    note,
    rewardLineKey,
    setQuantity,
    setLines,
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
    scheduledFor,
    setScheduledFor,
    group,
    setGroup,
  } = useCart();
  const deliverySettings = useMerchantDeliverySettings(merchant?.id).data;
  // Modes réellement proposés (revérifiés côté serveur à la commande) : retrait, livraison, ou les deux.
  const modes = orderModes(deliverySettings, !!scheduledFor);
  const mode = deliverySettings ? resolveMode(fulfillment, modes) : null;
  const isDelivery = mode === 'delivery';
  const hasPickup = modes.includes('pickup');
  // Adresses enregistrées : un appui remplit l'adresse et les instructions ; l'adresse par
  // défaut est proposée d'office si aucune n'est encore choisie.
  const saved = useAddresses();
  const applySaved = (a: SavedAddress) => {
    setDeliveryAddress({
      addressLine: a.address_line,
      postalCode: a.postal_code,
      city: a.city,
      latitude: a.latitude,
      longitude: a.longitude,
    });
    if (a.instructions) setDeliveryInstructions(a.instructions);
  };
  const defaultSaved = saved.data?.find((a) => a.is_default);
  useEffect(() => {
    if (!deliveryAddress && defaultSaved) applySaved(defaultSaved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultSaved?.id]);

  // Offres Happy Hour du mode choisi, relues toutes les 30 s : le prix annoncé suit l'offre.
  const { offers, refetch: refetchOffers } = useActiveOffers(
    merchant?.id,
    mode === 'delivery' ? 'delivery' : 'pickup',
    scheduledFor,
  );
  const previousOffers = useRef(offers);
  const [notices, setNotices] = useState<OfferChange[]>([]);
  const reorderReport = useReorderReport((s) => s.report);
  const setReorderReport = useReorderReport((s) => s.setReport);
  useEffect(() => {
    // Une offre qui se termine (ou change de prix) pendant que le client prépare son panier :
    // on le dit, plutôt que de modifier le total en silence.
    const changes = offerChanges(
      previousOffers.current,
      offers,
      lines.map((l) => l.itemId),
    );
    if (changes.length > 0) setNotices((n) => [...n, ...changes]);
    previousOffers.current = offers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offers]);

  const quoteQuery = useDeliveryQuote(
    isDelivery ? merchant?.id : undefined,
    deliveryAddress,
    scheduledFor,
  );
  const quote = isDelivery ? quoteQuery.data : undefined;
  const card = useLoyaltyCard(merchant?.id);
  const rewardsAvailable = card?.rewards_available ?? 0;
  // Le choix du menu offert n'a de sens que si un menu offert est disponible.
  const activeRewardKey = rewardsAvailable > 0 ? rewardLineKey : null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Espèces : au comptoir pour un retrait (si le restaurant l'accepte), au livreur pour une course.
  const [mealCash, setMealCash] = useState(false);
  const [rideCash, setRideCash] = useState(false);
  const subtotal = cartTotalWithOffers(lines, offers, activeRewardKey);
  const discount = cartDiscountCents(lines, activeRewardKey, offers);
  const total = subtotal - discount;
  // La course est payée au livreur, en plus du repas : prix fixé par le restaurant.
  const deliveryFee = isDelivery
    ? (quote?.fee_cents ?? deliverySettings?.delivery_fee_cents ?? 0)
    : 0;
  const grandTotal = total + deliveryFee;
  const canPayCashAtCounter = mode === 'pickup' && !!deliverySettings?.accepts_cash_pickup;
  // Sans lien de paiement, le restaurant n'encaisse qu'en espèces au comptoir.
  const canPayByCard = !!deliverySettings?.has_payment_link;
  const cashMeal = canPayCashAtCounter && (mealCash || !canPayByCard);
  // Commande groupée : entreprise, effectif et montant minimal ; le serveur revérifie tout.
  const groupReady =
    !group ||
    (group.companyName.trim().length >= 2 &&
      group.headcount >= (deliverySettings?.group_min_headcount ?? 2) &&
      total >= (deliverySettings?.group_min_total_cents ?? 0));
  const deliveryReady =
    mode !== null &&
    groupReady &&
    (!isDelivery ||
      (!!deliveryAddress && quote?.available === true && isValidDeliveryPhone(deliveryPhone)));
  const order = async () => {
    if (!merchant || !session || confirmedCustomerId !== session.user.id) return;
    setError(null);
    setBusy(true);
    try {
      // Never rely on a cached space selection as proof of customer identity.
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user || user.id !== confirmedCustomerId) {
        setConfirmedCustomerId(null);
        throw new Error('Session client expirée ou modifiée : reconnectez-vous.');
      }
      const result = await placeOrder({
        merchantId: merchant.id,
        merchantName: merchant.name,
        lines,
        note,
        rewardLineKey: activeRewardKey,
        offers,
        mealPayment: cashMeal ? 'cash' : 'card',
        deliveryPayment: isDelivery && rideCash ? 'cash' : 'card',
        scheduledFor,
        group,
        delivery:
          isDelivery && deliveryAddress
            ? {
                ...deliveryAddress,
                phone: deliveryPhone.trim(),
                instructions: deliveryInstructions,
              }
            : undefined,
      });
      clear();
      await queryClient.invalidateQueries({ queryKey: customerOrderKeys.all });
      router.replace({ pathname: '/order/[id]', params: { id: result.orderId } });
    } catch (e) {
      setError(t(errorKey(e)));
      if (errorKey(e) === 'errors.priceChanged') void refreshPrices();
    } finally {
      setBusy(false);
    }
  };

  // Le serveur a refusé un prix annoncé : on relit les offres et la carte, puis le client revalide.
  const refreshPrices = async () => {
    if (!merchant) return;
    await refetchOffers();
    const page = await fetchMerchantPage(merchant.slug);
    if (page) setLines(repriceLines(lines, page.menu).lines);
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

      {!authLoading && (!session || confirmedCustomerId !== session.user.id) ? (
        <Card testID="customer-identity-gate">
          <AppText variant="subtitle">Identification requise avant commande</AppText>
          <AppText variant="muted">
            {session
              ? `Vous êtes connecté avec ${session.user.email ?? 'un compte existant'}. Si vous confirmez, cette commande et son historique seront associés à ce compte, même si vous avez changé d'espace.`
              : 'Connectez-vous à votre compte client avant de passer commande. Le mode invité n’est pas activé.'}
          </AppText>
          {session ? (
            <>
              <Button
                testID="confirm-customer-identity"
                title="Commander avec ce compte"
                onPress={() => setConfirmedCustomerId(session.user.id)}
              />
              <Button
                testID="switch-customer-account"
                variant="secondary"
                title="Utiliser un autre compte client"
                onPress={() => void signOut().then(() => router.push('/sign-in'))}
              />
            </>
          ) : (
            <Button
              testID="sign-in-before-checkout"
              title="Se connecter pour commander"
              onPress={() => router.push('/sign-in')}
            />
          )}
        </Card>
      ) : null}

      {reorderReport ? (
        <Card testID="reorder-report">
          <AppText variant="subtitle">{t('client.reorder.title')}</AppText>
          <AppText variant="muted">{t('client.reorder.intro')}</AppText>
          {reorderReport.issues.map((issue, i) => (
            <AppText key={`${issue.name}-${i}`} variant="error">
              {t(`client.reorder.reasons.${issue.reason}`, {
                name: issue.name,
                from: formatCents(issue.fromCents ?? 0),
                to: formatCents(issue.toCents ?? 0),
              })}
            </AppText>
          ))}
          {reorderReport.unavailableNow ? (
            <AppText variant="error">
              {t('client.reorder.closed', { name: reorderReport.merchantName })}
            </AppText>
          ) : null}
          {reorderReport.modeChangedFrom ? (
            <AppText variant="error">
              {t(`client.reorder.mode.${reorderReport.modeChangedFrom}`)}
            </AppText>
          ) : null}
          <Button
            variant="ghost"
            title={t('client.cart.dismissNotice')}
            onPress={() => setReorderReport(null)}
          />
        </Card>
      ) : null}

      {notices.length > 0 ? (
        <Card testID="offer-notices">
          {notices.map((notice, i) => (
            <AppText key={`${notice.itemId}-${i}`} variant="error">
              {t(notice.kind === 'ended' ? 'client.cart.offerEnded' : 'client.cart.offerChanged', {
                name: lines.find((l) => l.itemId === notice.itemId)?.name ?? '',
              })}
            </AppText>
          ))}
          <Button
            variant="ghost"
            title={t('client.cart.dismissNotice')}
            onPress={() => setNotices([])}
          />
        </Card>
      ) : null}

      {lines.map((line) => (
        <Card key={line.key} testID={`cart-line-${line.name}`}>
          <View style={styles.row}>
            <View style={styles.flex}>
              <AppText>{line.name}</AppText>
              {line.options.length > 0 ? (
                <AppText variant="muted">{line.options.map((o) => o.name).join(', ')}</AppText>
              ) : null}
              <CartLinePrice line={line} offers={offers} rewardKey={activeRewardKey} />
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

      {deliverySettings ? (
        <SchedulePicker
          merchantId={merchant.id}
          merchant={deliverySettings}
          scheduledFor={scheduledFor}
          onSchedule={setScheduledFor}
          group={group}
          onGroup={setGroup}
        />
      ) : null}
      {group && total < (deliverySettings?.group_min_total_cents ?? 0) ? (
        <AppText variant="error" testID="group-minimum">
          {t('client.schedule.groupMinimum', {
            amount: formatCents(deliverySettings?.group_min_total_cents ?? 0),
          })}
        </AppText>
      ) : null}

      {deliverySettings && mode === null ? (
        <Card testID="no-order-mode">
          <AppText variant="error">
            {deliveryPausedNow(deliverySettings)
              ? t('client.cart.deliveryOnlyUnavailable')
              : t('client.merchant.noMode')}
          </AppText>
        </Card>
      ) : null}

      {modes.includes('delivery') ? (
        <Card testID="fulfillment">
          <View style={styles.chips}>
            {hasPickup ? (
              <Chip
                testID="fulfillment-pickup"
                label={t('client.cart.pickup')}
                selected={!isDelivery}
                onPress={() => setFulfillment('pickup')}
              />
            ) : null}
            <Chip
              testID="fulfillment-delivery"
              label={`🛵 ${t('client.cart.delivery')}`}
              selected={isDelivery}
              onPress={() => setFulfillment('delivery')}
            />
          </View>
          {isDelivery ? (
            <>
              {(saved.data ?? []).length > 0 ? (
                <View style={styles.chips}>
                  {saved.data?.map((a) => (
                    <Chip
                      key={a.id}
                      testID={`saved-address-${a.label}`}
                      label={a.label}
                      selected={
                        deliveryAddress?.addressLine === a.address_line &&
                        deliveryAddress.postalCode === a.postal_code
                      }
                      onPress={() => applySaved(a)}
                    />
                  ))}
                </View>
              ) : null}
              <AddressField
                key={
                  deliveryAddress
                    ? `${deliveryAddress.addressLine}|${deliveryAddress.postalCode}`
                    : 'none'
                }
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

      {canPayCashAtCounter ? (
        <Card testID="meal-payment">
          <AppText variant="subtitle">{t('client.cart.payHow')}</AppText>
          <View style={styles.chips}>
            {canPayByCard ? (
              <Chip
                testID="meal-payment-card"
                label={t('client.cart.payOnline')}
                selected={!cashMeal}
                onPress={() => setMealCash(false)}
              />
            ) : null}
            <Chip
              testID="meal-payment-cash"
              label={t('client.cart.payCash')}
              selected={cashMeal}
              onPress={() => setMealCash(true)}
            />
          </View>
        </Card>
      ) : null}

      {isDelivery ? (
        <Card testID="ride-payment">
          <AppText variant="subtitle">{t('client.cart.rideHow')}</AppText>
          <View style={styles.chips}>
            <Chip
              testID="ride-payment-card"
              label={t('client.cart.rideCard')}
              selected={!rideCash}
              onPress={() => setRideCash(false)}
            />
            <Chip
              testID="ride-payment-cash"
              label={t('client.cart.rideCash')}
              selected={rideCash}
              onPress={() => setRideCash(true)}
            />
          </View>
          <AppText variant="muted">
            {rideCash ? t('client.cart.rideCashHint') : t('client.cart.rideCardHint')}
          </AppText>
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
        {cashMeal
          ? t('client.cart.cashInfo')
          : total === 0
            ? t('client.loyalty.freeOrder')
            : t('client.cart.paymentInfo')}
      </AppText>
      {isDelivery ? <AppText variant="muted">{t('client.cart.twoPayments')}</AppText> : null}
      {scheduledFor ? (
        <AppText variant="muted" testID="cart-scheduled">
          {t('client.schedule.summary', {
            date: formatDateTimeIn(scheduledFor, deliverySettings?.timezone ?? DEFAULT_TIMEZONE),
          })}
        </AppText>
      ) : null}
      <AppText variant="muted">{t('client.cart.noFees')}</AppText>

      {error ? <AppText variant="error">{error}</AppText> : null}
      {session ? (
        <Button
          testID="place-order"
          title={
            cashMeal
              ? t('client.cart.orderCash')
              : total === 0
                ? t('client.cart.orderFree')
                : t('client.cart.order', { price: formatCents(total) })
          }
          loading={busy}
          disabled={
            !deliveryReady || authLoading || !session || confirmedCustomerId !== session.user.id
          }
          onPress={() => void order()}
        />
      ) : (
        <Button title={t('client.cart.signInToOrder')} onPress={() => router.push('/sign-in')} />
      )}
    </Screen>
  );
}

/** Prix d'une ligne : tarif habituel barré et économie quand une offre Happy Hour s'applique. */
function CartLinePrice({
  line,
  offers,
  rewardKey,
}: {
  line: { key: string; itemId: string; unitPriceCents: number; quantity: number };
  offers: ReturnType<typeof useActiveOffers>['offers'];
  rewardKey: string | null;
}) {
  const { t } = useTranslation();
  const pricing = cartLinePricing(line, offers, rewardKey);
  if (pricing.savingCents === 0) {
    return <AppText variant="muted">{formatCents(pricing.totalCents)}</AppText>;
  }
  return (
    <View testID={`cart-line-offer-${line.itemId}`}>
      <View style={styles.row}>
        <AppText>{formatCents(pricing.totalCents)}</AppText>
        <AppText variant="muted" style={styles.strike}>
          {formatCents(line.unitPriceCents * line.quantity)}
        </AppText>
      </View>
      <AppText variant="link">
        {t('happyHour.saving', { price: formatCents(pricing.savingCents) })}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  strike: { textDecorationLine: 'line-through' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
