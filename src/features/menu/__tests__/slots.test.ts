import {
  describeWeekdays,
  groupSlots,
  MEAL_PERIOD_WINDOWS,
  slotsForPeriods,
  slotWithinOpening,
} from '../slots';
import { slotsLabel } from '../slotLabel';

const hours = (weekday: number, opens_at: string, closes_at: string) => ({
  weekday,
  opens_at,
  closes_at,
});
const slot = (weekday: number, starts_at: string, ends_at: string) => ({
  weekday,
  starts_at,
  ends_at,
});

describe('slotsForPeriods', () => {
  it('crée les créneaux types des moments choisis pour chaque jour', () => {
    const slots = slotsForPeriods(['breakfast', 'lunch']);
    expect(slots).toHaveLength(14);
    expect(slots[0]).toEqual({ weekday: 1, starts_at: '06:00', ends_at: '11:00' });
    expect(slots[7]).toEqual({ weekday: 1, starts_at: '11:00', ends_at: '15:00' });
  });

  it('limite aux jours demandés', () => {
    expect(slotsForPeriods(['dinner'], [5, 6])).toEqual([
      { weekday: 5, starts_at: '18:00', ends_at: '23:00' },
      { weekday: 6, starts_at: '18:00', ends_at: '23:00' },
    ]);
  });

  it('le repas de nuit passe minuit', () => {
    expect(MEAL_PERIOD_WINDOWS.night.end < MEAL_PERIOD_WINDOWS.night.start).toBe(true);
  });
});

describe('slotWithinOpening', () => {
  it('accepte un créneau compris dans une plage d’ouverture', () => {
    expect(slotWithinOpening(slot(1, '11:00', '15:00'), [hours(1, '08:00', '19:00')])).toBe(true);
  });

  it('refuse un créneau hors de toute ouverture', () => {
    expect(slotWithinOpening(slot(1, '11:00', '15:00'), [hours(1, '17:00', '23:00')])).toBe(false);
    expect(slotWithinOpening(slot(2, '11:00', '15:00'), [hours(1, '08:00', '19:00')])).toBe(false);
  });

  it('gère plusieurs plages dans la journée', () => {
    const open = [hours(1, '08:00', '10:00'), hours(1, '12:00', '14:00')];
    expect(slotWithinOpening(slot(1, '09:00', '09:30'), open)).toBe(true);
    expect(slotWithinOpening(slot(1, '10:00', '12:00'), open)).toBe(false);
  });

  it('gère le passage de minuit : dark kitchen ouverte de 22 h à 3 h', () => {
    const night = [hours(5, '22:00', '03:00')];
    expect(slotWithinOpening(slot(5, '23:00', '01:00'), night)).toBe(true);
    expect(slotWithinOpening(slot(6, '01:00', '02:00'), night)).toBe(true);
    expect(slotWithinOpening(slot(5, '12:00', '14:00'), night)).toBe(false);
    expect(slotWithinOpening(slot(6, '03:00', '05:00'), night)).toBe(false);
  });

  it('le dimanche soir déborde sur le lundi matin', () => {
    const sunday = [hours(7, '22:00', '03:00')];
    expect(slotWithinOpening(slot(1, '01:00', '02:00'), sunday)).toBe(true);
    expect(slotWithinOpening(slot(1, '04:00', '05:00'), sunday)).toBe(false);
  });

  it('une fin égale au début de l’autre plage ne compte pas comme recoupement', () => {
    expect(slotWithinOpening(slot(1, '11:00', '12:00'), [hours(1, '12:00', '14:00')])).toBe(false);
  });
});

describe('groupSlots', () => {
  it('regroupe les jours qui partagent la même plage, triés par heure', () => {
    const slots = [
      ...[1, 2, 3].map((d) => slot(d, '11:00:00', '15:00:00')),
      ...[1, 2, 3].map((d) => slot(d, '06:00', '11:00')),
      slot(6, '11:00', '15:00'),
    ];
    expect(groupSlots(slots)).toEqual([
      { weekdays: [1, 2, 3], starts_at: '06:00', ends_at: '11:00' },
      { weekdays: [1, 2, 3, 6], starts_at: '11:00', ends_at: '15:00' },
    ]);
  });

  it('renvoie une liste vide sans créneau (servi toute l’ouverture)', () => {
    expect(groupSlots([])).toEqual([]);
  });
});

describe('describeWeekdays', () => {
  const names = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
  it('résume les jours', () => {
    expect(describeWeekdays([1, 2, 3, 4, 5, 6, 7], names, 'tous les jours')).toBe('tous les jours');
    expect(describeWeekdays([1, 2, 3, 4, 5, 6], names, 'tous les jours')).toBe('lun–sam');
    expect(describeWeekdays([1, 3, 5], names, 'tous les jours')).toBe('lun, mer, ven');
    expect(describeWeekdays([6, 7], names, 'tous les jours')).toBe('sam, dim');
  });
});

describe('slotsLabel', () => {
  const dayName = (n: number) => ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'][n - 1];

  it('décrit les heures de service par groupe de jours', () => {
    const slots = [
      ...[1, 2, 3, 4, 5, 6].map((d) => ({
        weekday: d,
        starts_at: '11:00:00',
        ends_at: '15:00:00',
      })),
      { weekday: 7, starts_at: '08:00:00', ends_at: '12:00:00' },
    ];
    expect(slotsLabel(slots, dayName, 'tous les jours')).toBe(
      'dim 08:00–12:00 · lun–sam 11:00–15:00',
    );
  });

  it('indique « tous les jours » et gère le repas de nuit', () => {
    const slots = [1, 2, 3, 4, 5, 6, 7].map((d) => ({
      weekday: d,
      starts_at: '22:00',
      ends_at: '04:00',
    }));
    expect(slotsLabel(slots, dayName, 'tous les jours')).toBe('tous les jours 22:00–04:00');
  });

  it('renvoie une chaîne vide sans créneau', () => {
    expect(slotsLabel([], dayName, 'tous les jours')).toBe('');
  });
});
