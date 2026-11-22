/**
 * Événements du calendrier des véhicules : types, construction et répartition par jour.
 * Fonctions pures partagées par les vues Mois, Semaine et Jour (heure LOCALE du navigateur).
 */
import { overlapsDay } from '@/lib/calendarDaySpan';

export interface CalendarVehicle {
  id: string;
  name: string;
  plate: string;
  type: string;
  status: string;
}

export interface CalendarReservation {
  id: string;
  vehicleId: string;
  vehicleName: string;
  vehiclePlate: string;
  userEmail: string;
  userName: string;
  startTime: string;
  endTime: string;
  reason: string | null;
  status: string;
}

export interface CalendarTrip {
  id: string;
  vehicleId: string;
  vehicleName: string;
  vehiclePlate: string;
  driverName: string;
  secondDriverName: string | null;
  missionType: string;
  missionName: string | null;
  checkOutAt: string;
  checkInAt: string | null;
  isOngoing: boolean;
}

export interface CalendarMaintenance {
  id: string;
  vehicleId: string;
  vehicleName: string;
  vehiclePlate: string;
  startDate: string;
  endDate: string | null;
  reason: string;
  isEndDateUnknown: boolean;
}

export type CalendarEvent =
  | { type: 'RESERVATION'; data: CalendarReservation; startTime: Date; endTime: Date }
  | { type: 'TRIP'; data: CalendarTrip; startTime: Date; endTime: Date | null; isOngoing: boolean }
  | { type: 'MAINTENANCE'; data: CalendarMaintenance; startTime: Date; endTime: Date | null; isEndDateUnknown: boolean };

export interface CalendarData {
  vehicles: CalendarVehicle[];
  reservations: CalendarReservation[];
  trips: CalendarTrip[];
  maintenances: CalendarMaintenance[];
}

export const EMPTY_CALENDAR_DATA: CalendarData = {
  vehicles: [],
  reservations: [],
  trips: [],
  maintenances: [],
};

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

/** Fusionne les réponses de plusieurs mois (une semaine à cheval) sans doublon. */
export function mergeCalendarData(parts: Partial<CalendarData>[]): CalendarData {
  return {
    vehicles: dedupeById(parts.flatMap(p => p.vehicles ?? [])),
    reservations: dedupeById(parts.flatMap(p => p.reservations ?? [])),
    trips: dedupeById(parts.flatMap(p => p.trips ?? [])),
    maintenances: dedupeById(parts.flatMap(p => p.maintenances ?? [])),
  };
}

export function buildCalendarEvents(data: Omit<CalendarData, 'vehicles'>): CalendarEvent[] {
  return [
    ...data.reservations.map(r => ({
      type: 'RESERVATION' as const,
      data: r,
      startTime: new Date(r.startTime),
      endTime: new Date(r.endTime),
    })),
    ...data.trips.map(t => ({
      type: 'TRIP' as const,
      data: t,
      startTime: new Date(t.checkOutAt),
      endTime: t.checkInAt ? new Date(t.checkInAt) : null,
      isOngoing: !t.checkInAt,
    })),
    ...data.maintenances.map(m => {
      const start = new Date(m.startDate.includes('T') ? m.startDate : `${m.startDate}T00:00:00`);
      const end = m.endDate ? new Date(m.endDate.includes('T') ? m.endDate : `${m.endDate}T23:59:59`) : null;
      return {
        type: 'MAINTENANCE' as const,
        data: m,
        startTime: start,
        endTime: end,
        isEndDateUnknown: !m.endDate,
      };
    }),
  ];
}

/** Les événements qui occupent le jour `date` (heure locale). */
export function eventsForDay(events: CalendarEvent[], date: Date): CalendarEvent[] {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  return events.filter(event => {
    if (event.type === 'RESERVATION') {
      return overlapsDay(event.startTime, event.endTime, dayStart, dayEnd);
    }
    if (event.type === 'TRIP') {
      if (event.isOngoing) return event.startTime <= dayEnd && dayStart <= todayEnd;
      return overlapsDay(event.startTime, event.endTime!, dayStart, dayEnd);
    }
    if (event.isEndDateUnknown) return event.startTime <= dayEnd && dayStart <= todayEnd;
    return event.startTime <= dayEnd && event.endTime! >= dayStart;
  });
}

export type CalendarViewMode = 'month' | 'week' | 'day';

export const CALENDAR_VIEW_LABELS: Record<CalendarViewMode, string> = {
  month: 'Mois',
  week: 'Semaine',
  day: 'Jour',
};

export function isCalendarViewMode(value: unknown): value is CalendarViewMode {
  return value === 'month' || value === 'week' || value === 'day';
}

/** Lundi (00:00 local) de la semaine contenant `date`. */
export function startOfWeek(date: Date): Date {
  const offset = (date.getDay() + 6) % 7;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - offset);
}

/** Les 7 jours (lundi → dimanche) de la semaine contenant `date`. */
export function weekDays(date: Date): Date[] {
  const monday = startOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
}

export function monthParamOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Mois à charger pour la période affichée : un seul, deux pour une semaine à cheval. */
export function monthsToFetch(view: CalendarViewMode, date: Date): string[] {
  if (view === 'week') {
    const days = weekDays(date);
    return Array.from(new Set([monthParamOf(days[0]), monthParamOf(days[6])]));
  }
  return [monthParamOf(date)];
}

/** Décale la date affichée d'une période (mois, semaine ou jour). */
export function shiftCalendarDate(view: CalendarViewMode, date: Date, direction: 1 | -1): Date {
  if (view === 'month') return new Date(date.getFullYear(), date.getMonth() + direction, 1);
  const step = view === 'week' ? 7 : 1;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + direction * step);
}

const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];
const WEEKDAY_NAMES = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

export function monthName(monthIndex: number): string {
  return MONTH_NAMES[monthIndex];
}

export function weekdayName(date: Date): string {
  return WEEKDAY_NAMES[date.getDay()];
}

/** Libellé de la période : « Novembre 2026 », « 27 oct. – 2 nov. 2026 » ou « Lundi 2 novembre 2026 ». */
export function calendarRangeLabel(view: CalendarViewMode, date: Date): string {
  if (view === 'month') return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
  if (view === 'day') {
    return `${weekdayName(date)} ${date.getDate()} ${MONTH_NAMES[date.getMonth()].toLowerCase()} ${date.getFullYear()}`;
  }
  const days = weekDays(date);
  const fmt = (d: Date) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const startYear = days[0].getFullYear();
  const endYear = days[6].getFullYear();
  return `${fmt(days[0])}${startYear !== endYear ? ` ${startYear}` : ''} – ${fmt(days[6])} ${endYear}`;
}
