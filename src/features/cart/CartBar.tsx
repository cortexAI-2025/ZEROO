import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Button } from '@/components/ui';
import { formatCents } from '@/lib/money';
import { spacing, useThemeColors } from '@/theme';

import { cartCount, cartTotalCents, useCart } from './store';

/** Barre « Voir le panier », affichée en bas d'écran dès que le panier n'est pas vide. */
export function CartBar({ showMerchant = false }: { showMerchant?: boolean }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const lines = useCart((s) => s.lines);
  const merchant = useCart((s) => s.merchant);
  if (!merchant || lines.length === 0) return null;

  return (
    <View style={[styles.bar, { backgroundColor: colors.background, borderColor: colors.border }]}>
      {showMerchant ? (
        <AppText variant="muted">{t('client.cart.cartAt', { name: merchant.name })}</AppText>
      ) : null}
      <Button
        testID="cart-bar"
        title={`${t('client.cart.viewCart', { count: cartCount(lines) })} · ${formatCents(cartTotalCents(lines))}`}
        onPress={() => router.push('/cart')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { padding: spacing.md, gap: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth },
});
