import { Redirect } from 'expo-router';
import { Platform } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import { LandingPage } from '@/features/landing/LandingPage';
import { homeHref, useSpace } from '@/features/space/SpaceProvider';

/**
 * zeeroo.fr : page d'accueil pour les visiteurs du site. Dans l'app mobile, ou pour un
 * utilisateur connecté, on va directement à la connexion ou à son espace.
 */
export default function RootIndex() {
  const { session, isLoading } = useAuth();
  const { space } = useSpace();

  if (isLoading) return null; // écran de lancement encore affiché
  if (session) return <Redirect href={homeHref(space)} />;
  if (Platform.OS !== 'web') return <Redirect href="/sign-in" />;
  return <LandingPage />;
}
