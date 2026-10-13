import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { spacing, useThemeColors } from '@/theme';

const STAR_COLOR = '#F5A524';

/** Note sur 5 en étoiles (demi-étoiles arrondies), en lecture seule. */
export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const rounded = Math.round(value * 2) / 2;
  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('reviews.starsLabel', { value: value.toFixed(1).replace('.', ',') })}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Ionicons
          key={n}
          size={size}
          color={rounded >= n - 0.5 ? STAR_COLOR : colors.border}
          name={rounded >= n ? 'star' : rounded >= n - 0.5 ? 'star-half' : 'star-outline'}
        />
      ))}
    </View>
  );
}

/** Choix d'une note de 1 à 5 (une étoile = un bouton). */
export function StarPicker({
  value,
  onChange,
  label,
  testID,
}: {
  value: number;
  onChange: (stars: number) => void;
  label: string;
  testID?: string;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  return (
    <View style={styles.picker} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          testID={testID ? `${testID}-${n}` : undefined}
          accessibilityRole="radio"
          accessibilityState={{ checked: value === n }}
          accessibilityLabel={t('reviews.starsChoice', { count: n })}
          hitSlop={4}
          onPress={() => onChange(n)}>
          <Ionicons
            size={34}
            name={value >= n ? 'star' : 'star-outline'}
            color={value >= n ? STAR_COLOR : colors.textMuted}
          />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 1 },
  picker: { flexDirection: 'row', gap: spacing.xs },
});
