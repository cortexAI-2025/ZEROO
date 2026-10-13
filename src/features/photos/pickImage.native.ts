import type { PickResult } from './types';

/**
 * iOS et Android : le sélecteur de photos (expo-image-picker) n'est pas encore installé dans
 * l'application. En attendant, les photos s'ajoutent depuis la version web.
 */
export async function pickImage(): Promise<PickResult> {
  return 'unsupported';
}
