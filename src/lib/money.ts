const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

/** 850 → « 8,50 € ». Les montants sont toujours stockés en centimes. */
export function formatCents(cents: number): string {
  // Intl insère des espaces insécables : on les normalise pour l'affichage et les tests.
  return euros.format(cents / 100).replace(/ | /g, ' ');
}

/** « 8,50 », « 8.5 », « 8 € » → 850 ; null si la saisie n'est pas un prix valide. */
export function parsePriceToCents(input: string): number | null {
  const normalized = input.replace(/€|\s/g, '').replace(',', '.');
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

/** 850 → « 8,50 » pour pré-remplir un champ de saisie. */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}
