import type { PickResult } from './types';

const MAX_SIDE = 1200;

/**
 * Web : ouvre le sélecteur de fichiers (ou l'appareil photo sur mobile), puis réduit l'image à
 * 1200 px au plus et la convertit en JPEG pour limiter le poids des menus.
 */
export function pickImage(): Promise<PickResult> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob(
          (blob) => resolve(blob ? { body: blob, contentType: 'image/jpeg' } : null),
          'image/jpeg',
          0.85,
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    };
    input.click();
  });
}
