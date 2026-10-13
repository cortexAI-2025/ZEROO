/** SIRET saisi avec ou sans espaces : « 123 456 789 00015 » → « 12345678900015 ». */
export const normalizeSiret = (value: string) => value.replace(/\s/g, '');

/**
 * 14 chiffres et clé de Luhn (même règle que public.is_valid_siret en base). Les
 * établissements de La Poste (SIREN 356000000) ont leur propre règle.
 */
export function isValidSiret(value: string): boolean {
  const siret = normalizeSiret(value);
  if (!/^\d{14}$/.test(siret)) return false;
  const digits = [...siret].map(Number);
  if (siret.startsWith('356000000')) return digits.reduce((sum, d) => sum + d, 0) % 5 === 0;
  const sum = digits.reduce((total, d, i) => {
    if (i % 2 === 1) return total + d;
    const doubled = d * 2;
    return total + (doubled > 9 ? doubled - 9 : doubled);
  }, 0);
  return sum % 10 === 0;
}
