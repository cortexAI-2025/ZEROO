import type { ConfigContext, ExpoConfig } from 'expo/config';

// Le schéma d'URL de Google Sign-In iOS est l'ID client iOS inversé
// (com.googleusercontent.apps.XXXX). Le plugin refuse de démarrer sans lui,
// on ne l'ajoute donc que s'il est renseigné.
const googleIosUrlScheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME;

// Identifiant du projet EAS (`npx eas-cli init`), requis pour les notifications push.
const easProjectId = process.env.EAS_PROJECT_ID;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Zéroo',
  slug: 'zeroo',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'zeroo',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'fr.zeroo.app',
    icon: './assets/images/icon.png',
    usesAppleSignIn: true,
    supportsTablet: true,
  },
  android: {
    package: 'fr.zeroo.app',
    adaptiveIcon: {
      backgroundColor: '#0D3B2A',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: 'single',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-localization',
    ['expo-notifications', { sounds: ['./assets/sounds/new-order.wav'], color: '#1F7A35' }],
    'expo-apple-authentication',
    [
      '@stripe/stripe-react-native',
      { merchantIdentifier: 'merchant.fr.zeroo', enableGooglePay: true },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Zéroo utilise votre position pour trouver les commerces proches de vous. Elle n’est pas enregistrée.',
      },
    ],
    ...(googleIosUrlScheme
      ? [
          ['@react-native-google-signin/google-signin', { iosUrlScheme: googleIosUrlScheme }] as [
            string,
            object,
          ],
        ]
      : []),
    [
      'expo-splash-screen',
      {
        backgroundColor: '#FFFFFF',
        image: './assets/images/splash-icon.png',
        imageWidth: 240,
        dark: { backgroundColor: '#0B0B0C', image: './assets/images/splash-icon-dark.png' },
      },
    ],
  ],
  extra: {
    ...config.extra,
    ...(easProjectId ? { eas: { projectId: easProjectId } } : {}),
  },
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
});
