/** Photo choisie et préparée (JPEG redimensionné), prête à être envoyée. */
export type PickedImage = { body: Blob; contentType: 'image/jpeg' };

/** null : choix annulé ; 'unsupported' : pas de sélecteur de photos sur cet appareil. */
export type PickResult = PickedImage | 'unsupported' | null;
