'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import styles from './VehicleCalendar.module.css';

interface Vehicle {
  id: string;
  name: string;
  plate: string;
  type: string;
  status: string;
}

interface Reservation {
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

interface Trip {
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

type CalendarEvent =
  | { type: 'RESERVATION'; data: Reservation; startTime: Date; endTime: Date }
  | { type: 'TRIP'; data: Trip; startTime: Date; endTime: Date | null; isOngoing: boolean };

interface CalendarDay {
  date: Date;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  events: CalendarEvent[];
}

const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export default function VehicleCalendar() {
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('ALL');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed

  const monthParam = useMemo(() => {
    return `${year}-${String(month + 1).padStart(2, '0')}`;
  }, [year, month]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/api/vehicles/calendar?month=${monthParam}`;
      if (selectedVehicleId !== 'ALL') {
        url += `&vehicleId=${encodeURIComponent(selectedVehicleId)}`;
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error('Erreur chargement calendrier');
      const data = await res.json();
      setVehicles(data.vehicles || []);
      setReservations(data.reservations || []);
      setTrips(data.trips || []);
    } catch (err) {
      console.error('Erreur calendrier:', err);
    } finally {
      setLoading(false);
    }
  }, [monthParam, selectedVehicleId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handlers for month navigation
  const handlePrevMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Build grid days for the selected month (Monday to Sunday)
  const calendarDays = useMemo<CalendarDay[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    // Get ISO day index for Monday = 0 ... Sunday = 6
    const startDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7;

    const days: CalendarDay[] = [];

    // Add days from previous month to fill the first week row
    for (let i = startDayOfWeek; i > 0; i--) {
      const d = new Date(year, month, 1 - i);
      days.push({
        date: d,
        dayNumber: d.getDate(),
        isCurrentMonth: false,
        isToday: d.getTime() === today.getTime(),
        events: [],
      });
    }

    // Add days of current month
    for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
      const d = new Date(year, month, i);
      days.push({
        date: d,
        dayNumber: i,
        isCurrentMonth: true,
        isToday: d.getTime() === today.getTime(),
        events: [],
      });
    }

    // Add days from next month to complete the last week row
    const totalDaysSoFar = days.length;
    const remainingDays = (7 - (totalDaysSoFar % 7)) % 7;
    for (let i = 1; i <= remainingDays; i++) {
      const d = new Date(year, month + 1, i);
      days.push({
        date: d,
        dayNumber: d.getDate(),
        isCurrentMonth: false,
        isToday: d.getTime() === today.getTime(),
        events: [],
      });
    }

    // Process & map events onto days
    const allEvents: CalendarEvent[] = [
      ...reservations.map(r => ({
        type: 'RESERVATION' as const,
        data: r,
        startTime: new Date(r.startTime),
        endTime: new Date(r.endTime),
      })),
      ...trips.map(t => ({
        type: 'TRIP' as const,
        data: t,
        startTime: new Date(t.checkOutAt),
        endTime: t.checkInAt ? new Date(t.checkInAt) : null,
        isOngoing: !t.checkInAt,
      })),
    ];

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    days.forEach(day => {
      const dayStart = new Date(day.date);
      dayStart.setHours(0, 0, 0, 0);

      const dayEnd = new Date(day.date);
      dayEnd.setHours(23, 59, 59, 999);

      day.events = allEvents.filter(event => {
        if (event.type === 'RESERVATION') {
          return event.startTime <= dayEnd && event.endTime >= dayStart;
        } else {
          // TRIP
          if (event.isOngoing) {
            // Ongoing trip starts at checkOutAt and runs up to current day (today), not beyond
            return event.startTime <= dayEnd && dayStart <= todayEnd;
          } else {
            return event.startTime <= dayEnd && event.endTime! >= dayStart;
          }
        }
      });
    });

    return days;
  }, [year, month, reservations, trips]);

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return 'En cours';
    const d = new Date(dateStr);
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDateFull = (dateStr: string | null) => {
    if (!dateStr) return 'Non restitué (En cours)';
    const d = new Date(dateStr);
    return d.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className={styles.container} data-testid="vehicle-calendar">
      {/* Header & Controls */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <span className={styles.titleIcon}>📅</span>
          <div>
            <h2 className={styles.title}>Planning des véhicules</h2>
            <p className={styles.subtitle}>Réservations & Emprunts par mois</p>
          </div>
        </div>

        <div className={styles.controls}>
          <div className={styles.monthNav}>
            <button
              className={styles.navBtn}
              onClick={handlePrevMonth}
              aria-label="Mois précédent"
              type="button"
            >
              ◀
            </button>
            <span className={styles.currentMonthLabel}>
              {MONTH_NAMES[month]} {year}
            </span>
            <button
              className={styles.navBtn}
              onClick={handleNextMonth}
              aria-label="Mois suivant"
              type="button"
            >
              ▶
            </button>
            <button
              className={styles.navBtn}
              onClick={handleToday}
              style={{ marginLeft: '0.25rem', borderLeft: '1px solid var(--border-primary)' }}
              type="button"
            >
              Aujourd&apos;hui
            </button>
          </div>

          <select
            className={styles.selectVehicle}
            value={selectedVehicleId}
            onChange={e => setSelectedVehicleId(e.target.value)}
            aria-label="Filtrer par véhicule"
          >
            <option value="ALL">Tous les véhicules</option>
            {vehicles.map(v => (
              <option key={v.id} value={v.id}>
                {v.name} ({v.plate})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Legend */}
      <div className={styles.legend}>
        <div className={styles.legendItem}>
          <span className={`${styles.legendBadge} ${styles.legendYellow}`} />
          <span>Réservation (Jaune)</span>
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendBadge} ${styles.legendGreen}`} />
          <span>Emprunt effectué (Vert)</span>
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendBadge} ${styles.legendOngoing}`} />
          <span>Emprunt en cours (Vert pointillés)</span>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Chargement du calendrier...
        </div>
      ) : (
        <div className={styles.grid}>
          {DAY_NAMES.map(dayName => (
            <div key={dayName} className={styles.dayHeader}>
              {dayName}
            </div>
          ))}

          {calendarDays.map((day, idx) => (
            <div
              key={idx}
              className={`
                ${styles.dayCell}
                ${!day.isCurrentMonth ? styles.dayCellOtherMonth : ''}
                ${day.isToday ? styles.dayCellToday : ''}
              `}
            >
              <div className={styles.dayNumberRow}>
                <span className={`${styles.dayNumber} ${day.isToday ? styles.todayBadge : ''}`}>
                  {day.dayNumber}
                </span>
              </div>

              <div className={styles.eventList}>
                {day.events.map((event, eIdx) => {
                  if (event.type === 'RESERVATION') {
                    const res = event.data;
                    return (
                      <div
                        key={`res-${res.id}-${eIdx}`}
                        className={`${styles.eventItem} ${styles.eventReservation}`}
                        onClick={() => setSelectedEvent(event)}
                        title={`Réservation : ${res.vehicleName} (${res.userName})`}
                      >
                        <div className={styles.eventHeader}>
                          <span className={styles.eventVehicle}>{res.vehicleName}</span>
                          <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>
                            {formatTime(res.startTime)}
                          </span>
                        </div>
                        <div className={styles.eventSubtext}>
                          🧑 {res.userName || res.userEmail.split('@')[0]}
                        </div>
                      </div>
                    );
                  } else {
                    const trip = event.data;
                    const isOngoing = event.isOngoing;
                    return (
                      <div
                        key={`trip-${trip.id}-${eIdx}`}
                        className={`
                          ${styles.eventItem}
                          ${isOngoing ? styles.eventTripOngoing : styles.eventTripCompleted}
                        `}
                        onClick={() => setSelectedEvent(event)}
                        title={`Emprunt ${isOngoing ? 'en cours' : ''} : ${trip.vehicleName} (${trip.driverName})`}
                      >
                        <div className={styles.eventHeader}>
                          <span className={styles.eventVehicle}>{trip.vehicleName}</span>
                          {isOngoing ? (
                            <span className={styles.ongoingBadge}>⏳ En cours</span>
                          ) : (
                            <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>
                              {formatTime(trip.checkOutAt)}
                            </span>
                          )}
                        </div>
                        <div className={styles.eventSubtext}>
                          🚗 {trip.driverName} {trip.secondDriverName ? ` & ${trip.secondDriverName}` : ''}
                        </div>
                      </div>
                    );
                  }
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Event Details Modal */}
      {selectedEvent && (
        <div className={styles.modalBackdrop} onClick={() => setSelectedEvent(null)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    background:
                      selectedEvent.type === 'RESERVATION'
                        ? '#FEF08A'
                        : selectedEvent.isOngoing
                        ? '#DCFCE7'
                        : '#DCFCE7',
                    color:
                      selectedEvent.type === 'RESERVATION'
                        ? '#854D0E'
                        : selectedEvent.isOngoing
                        ? '#15803D'
                        : '#166534',
                    border:
                      selectedEvent.type === 'RESERVATION'
                        ? '1px solid #CA8A04'
                        : selectedEvent.isOngoing
                        ? '1px dashed #15803D'
                        : '1px solid #16A34A',
                  }}
                >
                  {selectedEvent.type === 'RESERVATION'
                    ? '🟡 Réservation'
                    : selectedEvent.isOngoing
                    ? '🟢 Emprunt en cours'
                    : '🟢 Emprunt terminé'}
                </span>
                <h3 className={styles.modalTitle} style={{ marginTop: '0.4rem' }}>
                  {selectedEvent.data.vehicleName} ({selectedEvent.data.vehiclePlate})
                </h3>
              </div>
              <button
                className={styles.modalCloseBtn}
                onClick={() => setSelectedEvent(null)}
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            <div className={styles.modalBody}>
              {selectedEvent.type === 'RESERVATION' ? (
                <>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Réservé par</span>
                    <span className={styles.detailValue}>
                      {selectedEvent.data.userName} ({selectedEvent.data.userEmail})
                    </span>
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Début de réservation</span>
                    <span className={styles.detailValue}>
                      {formatDateFull(selectedEvent.data.startTime)}
                    </span>
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Fin de réservation</span>
                    <span className={styles.detailValue}>
                      {formatDateFull(selectedEvent.data.endTime)}
                    </span>
                  </div>
                  {selectedEvent.data.reason && (
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>Motif</span>
                      <span className={styles.detailValue}>{selectedEvent.data.reason}</span>
                    </div>
                  )}
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Statut</span>
                    <span className={styles.detailValue}>
                      {selectedEvent.data.status === 'VALIDATED' ? '✅ Validée' : '⏳ En attente'}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Conducteur principal</span>
                    <span className={styles.detailValue}>{selectedEvent.data.driverName}</span>
                  </div>
                  {selectedEvent.data.secondDriverName && (
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>Second conducteur</span>
                      <span className={styles.detailValue}>{selectedEvent.data.secondDriverName}</span>
                    </div>
                  )}
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Type de mission</span>
                    <span className={styles.detailValue}>{selectedEvent.data.missionType}</span>
                  </div>
                  {selectedEvent.data.missionName && (
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>Nom de la mission</span>
                      <span className={styles.detailValue}>{selectedEvent.data.missionName}</span>
                    </div>
                  )}
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Date d&apos;emprunt</span>
                    <span className={styles.detailValue}>
                      {formatDateFull(selectedEvent.data.checkOutAt)}
                    </span>
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Date de retour</span>
                    <span className={styles.detailValue}>
                      {selectedEvent.isOngoing ? (
                        <span style={{ color: '#15803D', fontWeight: 700 }}>
                          ⏳ En cours (non restitué)
                        </span>
                      ) : (
                        formatDateFull(selectedEvent.data.checkInAt)
                      )}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
