/**
 * Numéros de téléphone des professionnels, vérifiés par SMS (Supabase Auth).
 * Supabase attend le format international E.164 : +33612345678.
 */

/** Convertit une saisie (06 12 34 56 78, +33 6…, 0033 6…) en E.164, ou `null` si invalide. */
export function toE164(input: string): string | null {
  const compact = input.replace(/[\s.\-()]/g, '');
  let digits: string;
  if (/^0[1-9]\d{8}$/.test(compact)) {
    digits = `33${compact.slice(1)}`; // numéro français à 10 chiffres
  } else if (/^00\d+$/.test(compact)) {
    digits = compact.slice(2);
  } else if (/^\+\d+$/.test(compact)) {
    digits = compact.slice(1);
  } else {
    return null;
  }
  if (digits.startsWith('330')) digits = `33${digits.slice(3)}`; // +33 0 6… : zéro en trop
  if (digits.startsWith('33') && digits.length !== 11) return null;
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

/** Affichage lisible : +33 6 12 34 56 78 pour la France, sinon le format international brut. */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const e164 = phone.startsWith('+') ? phone : `+${phone}`;
  const fr = /^\+33(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(e164);
  return fr ? `+33 ${fr.slice(1).join(' ')}` : e164;
}

/** Format national français (0612345678) quand c'est possible, pour pré-remplir un formulaire. */
export function toNationalFr(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/^\+/, '');
  return /^33\d{9}$/.test(digits) ? `0${digits.slice(2)}` : `+${digits}`;
}
