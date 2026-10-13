import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { View } from 'react-native';

import { radius, useThemeColors } from '@/theme';

/** Vignette en lecture seule (produit, restaurant ou livreur), avec repli sans photo. */
export function Thumb({
  url,
  size = 64,
  round = false,
  icon = 'image-outline',
  label,
}: {
  url: string | null | undefined;
  size?: number;
  round?: boolean;
  icon?: 'image-outline' | 'storefront-outline' | 'person-outline';
  label?: string;
}) {
  const colors = useThemeColors();
  const style = {
    width: size,
    height: size,
    borderRadius: round ? size / 2 : radius.md,
    backgroundColor: colors.surface,
  };
  if (url) {
    return (
      <Image source={{ uri: url }} style={style} contentFit="cover" accessibilityLabel={label} />
    );
  }
  return (
    <View style={[style, { alignItems: 'center', justifyContent: 'center' }]}>
      <Ionicons name={icon} size={size * 0.4} color={colors.textMuted} />
    </View>
  );
}
