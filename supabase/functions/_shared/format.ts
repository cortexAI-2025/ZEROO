const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

/** 1700 → « 17,00 € » */
export const formatCents = (cents: number) => euros.format(cents / 100).replace(/ | /g, ' ');

/** Heure locale du commerce : « 12:45 ». */
export const formatTime = (iso: string, timeZone = 'Europe/Paris') =>
  new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone });
