'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type CalendarViewMode,
  isCalendarViewMode,
  monthsToFetch,
  shiftCalendarDate,
  calendarRangeLabel,
} from '@/lib/calendarEvents';

export const CALENDAR_VIEW_STORAGE_KEY = 'vehicle_calendar_view';

/** État de navigation du calendrier : vue (mémorisée), date de référence, mois à charger. */
export function useCalendarView() {
  const [view, setViewState] = useState<CalendarViewMode>('month');
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CALENDAR_VIEW_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture de localStorage après hydratation SSR
      if (isCalendarViewMode(saved)) setViewState(saved);
    } catch {
      // stockage indisponible : on garde la vue Mois
    }
  }, []);

  const setView = useCallback((next: CalendarViewMode) => {
    setViewState(next);
    try {
      localStorage.setItem(CALENDAR_VIEW_STORAGE_KEY, next);
    } catch {
      // stockage indisponible : le choix vaut pour la session
    }
  }, []);

  const goPrev = useCallback(() => setCurrentDate(d => shiftCalendarDate(view, d, -1)), [view]);
  const goNext = useCallback(() => setCurrentDate(d => shiftCalendarDate(view, d, 1)), [view]);
  const goToday = useCallback(() => setCurrentDate(new Date()), []);
  /** Ouvre la vue Jour sur une date (clic sur un numéro de jour en vue Mois). */
  const openDay = useCallback((date: Date) => {
    setCurrentDate(date);
    setView('day');
  }, [setView]);

  const months = useMemo(() => monthsToFetch(view, currentDate), [view, currentDate]);
  const monthsKey = months.join(',');
  const label = useMemo(() => calendarRangeLabel(view, currentDate), [view, currentDate]);

  return { view, setView, currentDate, goPrev, goNext, goToday, openDay, months, monthsKey, label };
}
