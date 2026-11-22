'use client';

import React, { useMemo } from 'react';
import styles from './VehicleCalendar.module.css';
import CalendarEventCard from './CalendarEventCard';
import { eventsForDay, weekDays, type CalendarEvent } from '@/lib/calendarEvents';

interface CalendarWeekViewProps {
  date: Date;
  events: CalendarEvent[];
  onSelect: (event: CalendarEvent) => void;
  onOpenDay: (date: Date) => void;
}

const SHORT_DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

/** Sept colonnes lundi → dimanche, sans plafond de hauteur : toutes les réservations du jour sont visibles. */
export default function CalendarWeekView({ date, events, onSelect, onOpenDay }: CalendarWeekViewProps) {
  const days = useMemo(() => weekDays(date), [date]);
  const todayKey = new Date().toDateString();

  return (
    <div className={styles.gridContainer} data-testid="calendar-week-view">
      <div className={`${styles.grid} ${styles.gridWeek}`}>
        {days.map((d, i) => {
          const isToday = d.toDateString() === todayKey;
          const dayEvents = eventsForDay(events, d);
          return (
            <div key={d.toISOString()} className={`${styles.weekColumn} ${isToday ? styles.dayCellToday : ''}`}>
              <button
                type="button"
                className={styles.weekColumnHeader}
                onClick={() => onOpenDay(d)}
                aria-label={`Voir la journée du ${SHORT_DAYS[i]} ${d.getDate()}`}
              >
                <span className={styles.weekDayName}>{SHORT_DAYS[i]}</span>
                <span className={`${styles.dayNumber} ${isToday ? styles.todayBadge : ''}`}>{d.getDate()}</span>
              </button>
              <div className={styles.eventListFull}>
                {dayEvents.length === 0 && <span className={styles.emptyDay}>Rien de prévu</span>}
                {dayEvents.map((event, idx) => (
                  <CalendarEventCard
                    key={`${event.type}-${event.data.id}-${idx}`}
                    event={event}
                    day={d}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
