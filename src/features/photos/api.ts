import { supabase } from '@/lib/supabase';

import type { PickedImage } from './types';

const BUCKET = 'photos';

/**
 * Envoie (ou remplace) une photo dans le bucket public et renvoie son URL. Le paramètre `v`
 * force le rafraîchissement des caches quand la photo change sous la même adresse.
 * Dossiers autorisés : merchants/<id du restaurant>/… et couriers/<id du livreur>/….
 */
export async function uploadPhoto(path: string, image: PickedImage): Promise<string> {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, image.body, { contentType: image.contentType, upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

export async function removePhoto(path: string) {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

export const photoPaths = {
  merchant: (merchantId: string) => `merchants/${merchantId}/cover.jpg`,
  logo: (merchantId: string) => `merchants/${merchantId}/logo.jpg`,
  item: (merchantId: string, itemId: string) => `merchants/${merchantId}/items/${itemId}.jpg`,
  courier: (courierId: string) => `couriers/${courierId}/avatar.jpg`,
};
