import { prepAdvice } from '../prepTiming';

const now = Date.parse('2026-10-09T12:00:00Z');
const inMinutes = (m: number) => new Date(now + m * 60_000).toISOString();

describe('prepAdvice', () => {
  it('client à 20 min, préparation 12 min : lancer dans 8 min', () => {
    expect(prepAdvice(inMinutes(20), 12, now)).toEqual({
      kind: 'start_later',
      startInMinutes: 8,
      arrivesInMinutes: 20,
    });
  });

  it('client à 9 min, préparation 12 min : lancer maintenant', () => {
    expect(prepAdvice(inMinutes(9), 12, now)).toEqual({ kind: 'start_now', arrivesInMinutes: 9 });
  });

  it('client déjà arrivé : lancer maintenant, arrivée 0 min', () => {
    expect(prepAdvice(inMinutes(-3), 10, now)).toEqual({ kind: 'start_now', arrivesInMinutes: 0 });
  });
});
