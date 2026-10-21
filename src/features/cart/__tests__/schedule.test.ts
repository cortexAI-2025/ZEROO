import { isOpenAt, scheduleLeadMinutes, scheduleOptions, slotToIso } from '../schedule';

// Lundi 19 octobre 2026, 10 h (heure locale du test).
const monday = new Date(2026, 9, 19, 10, 0);
const lunch = [{ weekday: 1, opens_at: '11:00:00', closes_at: '14:00:00' }];

describe('isOpenAt', () => {
  it('ouvert pendant la plage, fermé hors plage', () => {
    expect(isOpenAt(lunch, [], new Date(2026, 9, 19, 12, 30))).toBe(true);
    expect(isOpenAt(lunch, [], new Date(2026, 9, 19, 14, 0))).toBe(false);
    expect(isOpenAt(lunch, [], new Date(2026, 9, 20, 12, 30))).toBe(false); // mardi
  });

  it('une plage de nuit déborde sur le lendemain', () => {
    const night = [{ weekday: 5, opens_at: '22:00:00', closes_at: '03:00:00' }]; // vendredi
    expect(isOpenAt(night, [], new Date(2026, 9, 23, 23, 0))).toBe(true); // vendredi 23 h
    expect(isOpenAt(night, [], new Date(2026, 9, 24, 2, 0))).toBe(true); // samedi 2 h
    expect(isOpenAt(night, [], new Date(2026, 9, 24, 3, 0))).toBe(false); // samedi 3 h
    expect(isOpenAt(night, [], new Date(2026, 9, 23, 2, 0))).toBe(false); // vendredi 2 h
  });

  it('une fermeture exceptionnelle prime sur les horaires', () => {
    const closure = [
      {
        starts_at: new Date(2026, 9, 19, 0, 0).toISOString(),
        ends_at: new Date(2026, 9, 20, 0, 0).toISOString(),
      },
    ];
    expect(isOpenAt(lunch, closure, new Date(2026, 9, 19, 12, 30))).toBe(false);
  });
});

describe('scheduleOptions', () => {
  it('propose des créneaux de 15 minutes après le délai de préparation', () => {
    const days = scheduleOptions({ hours: lunch, closures: [], now: monday, leadMinutes: 60 });
    expect(days[0].day).toBe('2026-10-19');
    expect(days[0].times[0]).toBe('11:00'); // 10 h + 1 h
    expect(days[0].times.at(-1)).toBe('13:45');
    expect(days[0].times).toHaveLength(12);
  });

  it('ne propose pas un créneau trop proche', () => {
    const now = new Date(2026, 9, 19, 11, 30);
    const days = scheduleOptions({ hours: lunch, closures: [], now, leadMinutes: 60 });
    expect(days[0].times[0]).toBe('12:30');
  });

  it('reste dans les 14 jours et saute les jours fermés', () => {
    const days = scheduleOptions({ hours: lunch, closures: [], now: monday, leadMinutes: 30 });
    expect(days.map((d) => d.day)).toEqual(['2026-10-19', '2026-10-26']);
  });

  it('aucun créneau sans horaires', () => {
    expect(scheduleOptions({ hours: [], closures: [], now: monday, leadMinutes: 30 })).toEqual([]);
  });
});

describe('délais', () => {
  it('minimum : préparation + 15 minutes, au moins 30 minutes', () => {
    expect(scheduleLeadMinutes(10)).toBe(30);
    expect(scheduleLeadMinutes(25)).toBe(40);
  });
  it('convertit un créneau en instant ISO', () => {
    expect(new Date(slotToIso('2026-10-22', '12:30')).getHours()).toBe(12);
  });
});
