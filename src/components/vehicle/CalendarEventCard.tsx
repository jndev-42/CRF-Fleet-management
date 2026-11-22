'use client';

import React from 'react';
import styles from './VehicleCalendar.module.css';
import { getDaySpanLabel } from '@/lib/calendarDaySpan';
import type { CalendarEvent } from '@/lib/calendarEvents';

interface CalendarEventCardProps {
  event: CalendarEvent;
  /** Jour dans lequel la carte s'affiche (libellé horaire). */
  day: Date;
  onSelect: (event: CalendarEvent) => void;
}

/** Une réservation, un emprunt ou une maintenance dans une case de jour (vues Mois, Semaine, Jour). */
export default function CalendarEventCard({ event, day, onSelect }: CalendarEventCardProps) {
  if (event.type === 'RESERVATION') {
    const res = event.data;
    return (
      <div
        className={`${styles.eventItem} ${styles.eventReservation}`}
        onClick={() => onSelect(event)}
        title={`Réservation : ${res.vehicleName} (${res.userName})`}
      >
        <div className={styles.eventHeader}>
          <span className={styles.eventVehicle}>{res.vehicleName}</span>
          <span className={styles.eventTime}>{getDaySpanLabel(event.startTime, event.endTime, day)}</span>
        </div>
        <div className={styles.eventSubtext}>🧑 {res.userName || res.userEmail.split('@')[0]}</div>
      </div>
    );
  }

  if (event.type === 'TRIP') {
    const trip = event.data;
    const isOngoing = event.isOngoing;
    return (
      <div
        className={`${styles.eventItem} ${isOngoing ? styles.eventTripOngoing : styles.eventTripCompleted}`}
        onClick={() => onSelect(event)}
        title={`Emprunt ${isOngoing ? 'en cours' : ''} : ${trip.vehicleName} (${trip.driverName})`}
      >
        <div className={styles.eventHeader}>
          <span className={styles.eventVehicle}>{trip.vehicleName}</span>
          {isOngoing ? (
            <span className={styles.ongoingBadge}>⏳ En cours</span>
          ) : (
            <span className={styles.eventTime}>{getDaySpanLabel(event.startTime, event.endTime!, day)}</span>
          )}
        </div>
        <div className={styles.eventSubtext}>
          🚗 {trip.driverName} {trip.secondDriverName ? ` & ${trip.secondDriverName}` : ''}
        </div>
      </div>
    );
  }

  const maint = event.data;
  const isUnknown = event.isEndDateUnknown;
  return (
    <div
      className={`${styles.eventItem} ${isUnknown ? styles.eventMaintenanceOngoing : styles.eventMaintenanceCompleted}`}
      onClick={() => onSelect(event)}
      title={`Maintenance ${isUnknown ? '(fin inconnue)' : ''} : ${maint.vehicleName} (${maint.reason})`}
    >
      <div className={styles.eventHeader}>
        <span className={styles.eventVehicle}>{maint.vehicleName}</span>
        {isUnknown ? (
          <span className={styles.ongoingBadgeRed}>🔧 Maint.</span>
        ) : (
          <span className={styles.maintLabel}>🔧 Maint.</span>
        )}
      </div>
      <div className={styles.eventSubtext}>🛠️ {maint.reason}</div>
    </div>
  );
}
