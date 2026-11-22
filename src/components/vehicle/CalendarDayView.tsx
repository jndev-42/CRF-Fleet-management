'use client';

import React, { useMemo } from 'react';
import styles from './VehicleCalendar.module.css';
import CalendarEventCard from './CalendarEventCard';
import { eventsForDay, type CalendarEvent } from '@/lib/calendarEvents';

interface CalendarDayViewProps {
  date: Date;
  events: CalendarEvent[];
  onSelect: (event: CalendarEvent) => void;
}

/** Une seule colonne pour la journée : jusqu'à une dizaine de réservations restent lisibles. */
export default function CalendarDayView({ date, events, onSelect }: CalendarDayViewProps) {
  const dayEvents = useMemo(() => eventsForDay(events, date), [events, date]);

  return (
    <div className={styles.dayView} data-testid="calendar-day-view">
      {dayEvents.length === 0 ? (
        <p className={styles.emptyDay}>Aucune réservation, emprunt ou maintenance ce jour.</p>
      ) : (
        <div className={styles.eventListFull}>
          {dayEvents.map((event, idx) => (
            <CalendarEventCard
              key={`${event.type}-${event.data.id}-${idx}`}
              event={event}
              day={date}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
