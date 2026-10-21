import { isOnlineAt } from '../onlineRules';

const NOW = Date.parse('2026-10-21T22:00:00Z');
const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();

describe('isOnlineAt', () => {
  it('est en ligne tant que la fenêtre n’a pas expiré', () => {
    expect(isOnlineAt({ is_available: true, available_until: at(10) }, NOW)).toBe(true);
  });

  it('passe hors ligne dès l’expiration, même si l’indicateur est resté vrai', () => {
    expect(isOnlineAt({ is_available: true, available_until: at(-1) }, NOW)).toBe(false);
    expect(isOnlineAt({ is_available: true, available_until: at(0) }, NOW)).toBe(false);
  });

  it('est hors ligne quand le livreur s’est mis indisponible ou sans fenêtre', () => {
    expect(isOnlineAt({ is_available: false, available_until: null }, NOW)).toBe(false);
    expect(isOnlineAt({ is_available: true, available_until: null }, NOW)).toBe(false);
  });

  it('reste en ligne la nuit comme le jour (aucune fermeture générale)', () => {
    const night = Date.parse('2026-10-22T03:00:00Z');
    expect(
      isOnlineAt(
        { is_available: true, available_until: new Date(night + 5 * 60_000).toISOString() },
        night,
      ),
    ).toBe(true);
  });
});
