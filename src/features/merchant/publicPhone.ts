/** Numéro professionnel public : vide (non renseigné) ou un numéro de 8 à 20 caractères. */
export function isValidPublicPhone(value: string): boolean {
  const v = value.trim();
  return v === '' || /^\+?\d[\d .-]{7,18}$/.test(v);
}
