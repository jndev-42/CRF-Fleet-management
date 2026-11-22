import { describe, it, expect } from 'vitest';
import {
  buildCalendarEvents,
  calendarRangeLabel,
  eventsForDay,
  mergeCalendarData,
  monthsToFetch,
  shiftCalendarDate,
  startOfWeek,
  weekDays,
  isCalendarViewMode,
  type CalendarReservation,
} from '@/lib/calendarEvents';

const res = (id: string, start: string, end: string): CalendarReservation => ({
  id, vehicleId: 'v', vehicleName: 'VL', vehiclePlate: 'AA', userEmail: 'a@b.c', userName: 'A',
  startTime: start, endTime: end, reason: null, status: 'VALIDATED',
});

describe('calendarEvents', () => {
  it('startOfWeek / weekDays : lundi → dimanche (27 oct → 2 nov 2026)', () => {
    const wed = new Date(2026, 9, 28);
    expect(startOfWeek(wed)).toEqual(new Date(2026, 9, 26));
    const days = weekDays(new Date(2026, 10, 1)); // dimanche
    expect(days).toHaveLength(7);
    expect(days[0]).toEqual(new Date(2026, 9, 26));
    expect(days[6]).toEqual(new Date(2026, 10, 1));
  });

  it('monthsToFetch : un mois en vue Mois/Jour, deux pour une semaine à cheval', () => {
    expect(monthsToFetch('month', new Date(2026, 10, 15))).toEqual(['2026-11']);
    expect(monthsToFetch('day', new Date(2026, 10, 15))).toEqual(['2026-11']);
    expect(monthsToFetch('week', new Date(2026, 9, 28))).toEqual(['2026-10', '2026-11']);
    expect(monthsToFetch('week', new Date(2026, 10, 18))).toEqual(['2026-11']);
  });

  it('mergeCalendarData : fusion sans doublon', () => {
    const a = res('r1', '2026-10-30T08:00:00Z', '2026-10-30T09:00:00Z');
    const merged = mergeCalendarData([
      { reservations: [a], vehicles: [] },
      { reservations: [a, res('r2', '2026-11-02T08:00:00Z', '2026-11-02T09:00:00Z')] },
    ]);
    expect(merged.reservations.map(r => r.id)).toEqual(['r1', 'r2']);
  });

  it('shiftCalendarDate : mois, semaine, jour', () => {
    const d = new Date(2026, 10, 15);
    expect(shiftCalendarDate('month', d, 1)).toEqual(new Date(2026, 11, 1));
    expect(shiftCalendarDate('week', d, -1)).toEqual(new Date(2026, 10, 8));
    expect(shiftCalendarDate('day', d, 1)).toEqual(new Date(2026, 10, 16));
  });

  it('eventsForDay : 10 réservations le même jour, aucune un autre jour', () => {
    const events = buildCalendarEvents({
      reservations: Array.from({ length: 10 }, (_, i) => res(`r${i}`, new Date(2026, 10, 10, 8, i).toISOString(), new Date(2026, 10, 10, 18, i).toISOString())),
      trips: [],
      maintenances: [],
    });
    expect(eventsForDay(events, new Date(2026, 10, 10))).toHaveLength(10);
    expect(eventsForDay(events, new Date(2026, 10, 11))).toHaveLength(0);
  });

  it('libellé de semaine à cheval sur deux années : année de début indiquée', () => {
    // Semaine du lundi 28 déc. 2026 au dimanche 3 janv. 2027
    const label = calendarRangeLabel('week', new Date(2026, 11, 30));
    expect(label).toContain('2026 –');
    expect(label.endsWith('2027')).toBe(true);
    // Même année : une seule mention
    expect(calendarRangeLabel('week', new Date(2026, 10, 18)).match(/2026/g)).toHaveLength(1);
  });

  it('calendarRangeLabel et isCalendarViewMode', () => {
    expect(calendarRangeLabel('month', new Date(2026, 10, 15))).toBe('Novembre 2026');
    expect(calendarRangeLabel('day', new Date(2026, 10, 2))).toBe('Lundi 2 novembre 2026');
    expect(calendarRangeLabel('week', new Date(2026, 10, 18))).toContain('2026');
    expect(isCalendarViewMode('week')).toBe(true);
    expect(isCalendarViewMode('année')).toBe(false);
  });
});
