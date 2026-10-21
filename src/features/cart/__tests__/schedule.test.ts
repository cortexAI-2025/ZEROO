import { isOpenAt, isoToSlot, scheduleLeadMinutes, scheduleOptions, slotToIso } from '../schedule';

const PARIS = 'Europe/Paris';
const MARTINIQUE = 'America/Martinique'; // UTC−4 toute l'année
// Lundi 19 octobre 2026, 10 h à Paris (08 h UTC).
const monday = new Date('2026-10-19T08:00:00Z');
const lunch = [{ weekday: 1, opens_at: '11:00:00', closes_at: '14:00:00' }];

describe('isOpenAt (fuseau de l’établissement)', () => {
  it('ouvert pendant la plage, fermé hors plage', () => {
    expect(isOpenAt(lunch, [], new Date('2026-10-19T10:30:00Z'), PARIS)).toBe(true); // 12 h 30
    expect(isOpenAt(lunch, [], new Date('2026-10-19T12:00:00Z'), PARIS)).toBe(false); // 14 h
    expect(isOpenAt(lunch, [], new Date('2026-10-20T10:30:00Z'), PARIS)).toBe(false); // mardi
  });

  it('le même instant ne se lit pas pareil dans deux fuseaux', () => {
    const instant = new Date('2026-10-19T10:30:00Z'); // 12 h 30 à Paris, 6 h 30 en Martinique
    expect(isOpenAt(lunch, [], instant, PARIS)).toBe(true);
    expect(isOpenAt(lunch, [], instant, MARTINIQUE)).toBe(false);
  });

  it('une plage de nuit déborde sur le lendemain', () => {
    const night = [{ weekday: 5, opens_at: '22:00:00', closes_at: '03:00:00' }]; // vendredi
    expect(isOpenAt(night, [], new Date('2026-10-23T21:00:00Z'), PARIS)).toBe(true); // ven. 23 h
    expect(isOpenAt(night, [], new Date('2026-10-24T00:00:00Z'), PARIS)).toBe(true); // sam. 2 h
    expect(isOpenAt(night, [], new Date('2026-10-24T01:00:00Z'), PARIS)).toBe(false); // sam. 3 h
    expect(isOpenAt(night, [], new Date('2026-10-23T00:00:00Z'), PARIS)).toBe(false); // ven. 2 h
  });

  it('une fermeture exceptionnelle prime sur les horaires', () => {
    const closure = [{ starts_at: '2026-10-18T22:00:00Z', ends_at: '2026-10-19T22:00:00Z' }];
    expect(isOpenAt(lunch, closure, new Date('2026-10-19T10:30:00Z'), PARIS)).toBe(false);
  });
});

describe('scheduleOptions', () => {
  it('propose des créneaux de 15 minutes après le délai de préparation', () => {
    const days = scheduleOptions({
      hours: lunch,
      closures: [],
      now: monday,
      leadMinutes: 60,
      timeZone: PARIS,
    });
    expect(days[0].day).toBe('2026-10-19');
    expect(days[0].times[0]).toBe('11:00'); // 10 h + 1 h
    expect(days[0].times.at(-1)).toBe('13:45');
    expect(days[0].times).toHaveLength(12);
  });

  it('ne propose pas un créneau trop proche', () => {
    const now = new Date('2026-10-19T09:30:00Z'); // 11 h 30 à Paris
    const days = scheduleOptions({
      hours: lunch,
      closures: [],
      now,
      leadMinutes: 60,
      timeZone: PARIS,
    });
    expect(days[0].times[0]).toBe('12:30');
  });

  it('reste dans les 14 jours et saute les jours fermés', () => {
    const days = scheduleOptions({
      hours: lunch,
      closures: [],
      now: monday,
      leadMinutes: 30,
      timeZone: PARIS,
    });
    expect(days.map((d) => d.day)).toEqual(['2026-10-19', '2026-10-26']);
  });

  it('utilise le jour et l’heure de l’établissement, pas ceux de l’appareil', () => {
    // 02 h 30 UTC le mardi 20 = lundi 19 à 22 h 30 en Martinique : encore lundi là-bas.
    const now = new Date('2026-10-20T02:30:00Z');
    const days = scheduleOptions({
      hours: lunch,
      closures: [],
      now,
      leadMinutes: 30,
      timeZone: MARTINIQUE,
    });
    expect(days[0].day).toBe('2026-10-26'); // le lundi 19 est terminé (22 h 30), prochain lundi
    const sameInstantParis = scheduleOptions({
      hours: lunch,
      closures: [],
      now,
      leadMinutes: 30,
      timeZone: PARIS,
    });
    expect(sameInstantParis[0].day).toBe('2026-10-26'); // mardi 20 à 4 h 30 à Paris : prochain lundi aussi
    const evening = scheduleOptions({
      hours: lunch,
      closures: [],
      now: new Date('2026-10-19T12:00:00Z'),
      leadMinutes: 30,
      timeZone: MARTINIQUE,
    });
    expect(evening[0]).toEqual({
      day: '2026-10-19',
      times: expect.arrayContaining(['11:00', '13:45']),
    }); // 08 h en Martinique : tout le service du lundi
  });

  it('aucun créneau sans horaires', () => {
    expect(
      scheduleOptions({ hours: [], closures: [], now: monday, leadMinutes: 30, timeZone: PARIS }),
    ).toEqual([]);
  });

  it('traverse le changement d’heure sans créneau fantôme', () => {
    // Dimanche 25 octobre 2026 : retour à l'heure d'hiver à Paris (3 h → 2 h).
    const sunday = [{ weekday: 7, opens_at: '00:00:00', closes_at: '23:59:00' }];
    const days = scheduleOptions({
      hours: sunday,
      closures: [],
      now: new Date('2026-10-24T08:00:00Z'),
      leadMinutes: 30,
      timeZone: PARIS,
    });
    const day = days.find((d) => d.day === '2026-10-25');
    expect(day).toBeDefined();
    expect(new Set(day?.times).size).toBe(day?.times.length);
  });
});

describe('conversions', () => {
  it('slotToIso lit l’heure dans le fuseau de l’établissement', () => {
    expect(slotToIso('2026-10-22', '12:30', PARIS)).toBe('2026-10-22T10:30:00.000Z');
    expect(slotToIso('2026-10-22', '12:30', MARTINIQUE)).toBe('2026-10-22T16:30:00.000Z');
    expect(slotToIso('2026-01-22', '12:30', PARIS)).toBe('2026-01-22T11:30:00.000Z'); // hiver
  });
  it('isoToSlot est l’inverse de slotToIso', () => {
    expect(isoToSlot('2026-10-22T16:30:00.000Z', MARTINIQUE)).toEqual({
      day: '2026-10-22',
      time: '12:30',
    });
    expect(isoToSlot(slotToIso('2026-03-29', '12:00', PARIS)!, PARIS)).toEqual({
      day: '2026-03-29',
      time: '12:00',
    });
  });
  it('une heure qui n’existe pas (saut du printemps) n’a pas d’instant', () => {
    expect(slotToIso('2026-03-29', '02:30', PARIS)).toBeNull();
  });
});

describe('délais', () => {
  it('minimum : préparation + 15 minutes, au moins 30 minutes', () => {
    expect(scheduleLeadMinutes(10)).toBe(30);
    expect(scheduleLeadMinutes(25)).toBe(40);
  });
});
