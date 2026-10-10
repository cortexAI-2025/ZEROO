import { normalizeTime, validateSlots } from '../hours';

describe('normalizeTime', () => {
  it.each([
    ['11:00', '11:00'],
    ['9:30', '09:30'],
    ['9h30', '09:30'],
    ['18h', '18:00'],
    ['0930', '09:30'],
    ['23:59', '23:59'],
  ])('« %s » → %s', (input, expected) => {
    expect(normalizeTime(input)).toBe(expected);
  });

  it.each(['24:00', '12:60', 'midi', ''])('refuse « %s »', (input) => {
    expect(normalizeTime(input)).toBeNull();
  });
});

describe('validateSlots', () => {
  it('accepte un créneau qui passe minuit', () => {
    expect(validateSlots([{ weekday: 5, opensAt: '18h', closesAt: '2h' }])).toEqual({
      ok: true,
      slots: [{ weekday: 5, opensAt: '18:00', closesAt: '02:00' }],
    });
  });

  it('signale le créneau invalide', () => {
    expect(
      validateSlots([
        { weekday: 1, opensAt: '11:00', closesAt: '14:00' },
        { weekday: 1, opensAt: '18:00', closesAt: '18:00' },
      ]),
    ).toEqual({ ok: false, index: 1 });
  });
});
