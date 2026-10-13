import { Image } from 'expo-image';
import { useColorScheme } from 'react-native';

const LOGO = require('@/assets/images/logo.png');
const LOGO_DARK = require('@/assets/images/logo-dark.png');
/** Proportions des fichiers logo (1557 × 416). */
const RATIO = 1557 / 416;

/** Logo Zéroo, fond transparent : « ZÉR » foncé sur fond clair, blanc sur fond sombre. */
export function Logo({ height = 40 }: { height?: number }) {
  const dark = useColorScheme() === 'dark';
  return (
    <Image
      source={dark ? LOGO_DARK : LOGO}
      style={{ height, width: height * RATIO }}
      contentFit="contain"
      accessibilityLabel="Zéroo"
      accessibilityRole="image"
    />
  );
}
