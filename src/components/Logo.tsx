import { Image } from 'expo-image';
import { useColorScheme } from 'react-native';

const LOGO = require('@/assets/images/logo.png');
const LOGO_DARK = require('@/assets/images/logo-dark.png');
/** Proportions des fichiers logo (2164 × 554). */
const RATIO = 2164 / 554;

/** Logo ZeeRoo, fond transparent : « Zee » foncé sur fond clair, blanc sur fond sombre. */
export function Logo({ height = 40 }: { height?: number }) {
  const dark = useColorScheme() === 'dark';
  return (
    <Image
      source={dark ? LOGO_DARK : LOGO}
      style={{ height, width: height * RATIO }}
      contentFit="contain"
      accessibilityLabel="ZeeRoo"
      accessibilityRole="image"
    />
  );
}
