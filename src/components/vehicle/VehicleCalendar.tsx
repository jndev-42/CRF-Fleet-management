'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSession } from 'next-auth/react';
import styles from './VehicleCalendar.module.css';
import { useUL } from '@/lib/contexts/ULContext';
import { UNASSIGNED_DRIVER_NAME, isUnassignedDriverName } from '@/lib/reservationDriver';
import { canManageVehicles } from '@/lib/roles';
import { isMaintenanceEditable } from '@/lib/maintenanceStatus';
import {
  type CalendarEvent,
  type CalendarVehicle,
  type CalendarReservation,
  type CalendarTrip,
  type CalendarMaintenance,
  buildCalendarEvents,
  eventsForDay,
  mergeCalendarData,
  monthName,
} from '@/lib/calendarEvents';
import { useCalendarView } from './useCalendarView';
import CalendarEventCard from './CalendarEventCard';
import CalendarViewSwitcher from './CalendarViewSwitcher';
import CalendarWeekView from './CalendarWeekView';
import CalendarDayView from './CalendarDayView';
import EditMaintenanceEventModal from './modals/EditMaintenanceEventModal';
import DeleteMaintenanceEventModal from './modals/DeleteMaintenanceEventModal';

type Vehicle = CalendarVehicle;
type Reservation = CalendarReservation;
type Trip = CalendarTrip;
type MaintenanceEvent = CalendarMaintenance;

interface CalendarDay {
  date: Date;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  events: CalendarEvent[];
}

const PERIOD_WORD = { month: 'mois', week: 'semaine', day: 'jour' } as const;
const PERIOD_LABEL = { month: 'Mois', week: 'Semaine', day: 'Jour' } as const;

const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

interface VehicleCalendarProps {
  dtView?: boolean;
  /** À incrémenter par le parent après une action qui modifie le planning : recharge sans écran de chargement. */
  refreshKey?: number;
}

export default function VehicleCalendar({ dtView = false, refreshKey = 0 }: VehicleCalendarProps) {
  const { activeUL } = useUL();
  const { data: session } = useSession();
  const { view, setView, currentDate, goPrev, goNext, goToday, openDay, monthsKey, label } = useCalendarView();
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('ALL');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [maintenances, setMaintenances] = useState<MaintenanceEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showCalendar, setShowCalendar] = useState<boolean>(true);
  const [editingMaintenance, setEditingMaintenance] = useState<MaintenanceEvent | null>(null);
  const [deletingMaintenance, setDeletingMaintenance] = useState<MaintenanceEvent | null>(null);

  // La vue DT est en lecture seule par contrat et affiche des véhicules d'autres ULs :
  // le serveur répondrait 403. On y masque donc les actions de maintenance.
  const canEditMaintenance = canManageVehicles(session?.user?.roles || []) && !dtView;

  // Reset vehicle filter when active UL changes
  useEffect(() => {
    setSelectedVehicleId('ALL');
  }, [activeUL?.id]);

  useEffect(() => {
    const saved = localStorage.getItem('show_vehicle_calendar');
    if (saved !== null) {
      setShowCalendar(saved === 'true');
    }
  }, []);

  const toggleShowCalendar = () => {
    setShowCalendar(prev => {
      const next = !prev;
      localStorage.setItem('show_vehicle_calendar', String(next));
      return next;
    });
  };

  // Numéro de la dernière requête : une réponse plus ancienne (navigation rapide) est ignorée.
  const requestIdRef = useRef(0);

  const fetchData = useCallback(async (silent = false) => {
    const requestId = ++requestIdRef.current;
    if (!silent) setLoading(true);
    try {
      // Une semaine à cheval sur deux mois charge les deux, fusionnés sans doublon.
      const responses = await Promise.all(monthsKey.split(',').map(async monthParam => {
        let url = `/api/vehicles/calendar?month=${monthParam}`;
        if (dtView) {
          url += `&view=dt`;
        }
        if (selectedVehicleId !== 'ALL') {
          url += `&vehicleId=${encodeURIComponent(selectedVehicleId)}`;
        }
        const res = await fetch(url);
        if (!res.ok) throw new Error('Erreur chargement calendrier');
        return res.json();
      }));
      if (requestId !== requestIdRef.current) return;
      const data = mergeCalendarData(responses);
      setVehicles(data.vehicles);
      setReservations(data.reservations);
      setTrips(data.trips);
      setMaintenances(data.maintenances);
    } catch (err) {
      if (requestId === requestIdRef.current) console.error('Erreur calendrier:', err);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [monthsKey, selectedVehicleId, dtView]);

  // Un changement de `refreshKey` seul recharge en silence : la grille reste affichée.
  const lastRefreshKeyRef = useRef(refreshKey);
  useEffect(() => {
    const silent = refreshKey !== lastRefreshKeyRef.current;
    lastRefreshKeyRef.current = refreshKey;
    if (showCalendar) {
      fetchData(silent);
    }
  }, [fetchData, showCalendar, activeUL?.id, refreshKey]);

  const events = useMemo(
    () => buildCalendarEvents({ reservations, trips, maintenances }),
    [reservations, trips, maintenances],
  );

  // Build grid days for the selected month (Monday to Sunday)
  const calendarDays = useMemo<CalendarDay[]>(() => {
    if (view !== 'month') return [];
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastDayOfMonth = new Date(year, month + 1, 0);
    // ISO day index for Monday = 0 ... Sunday = 6
    const startDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7;

    const dates: { date: Date; isCurrentMonth: boolean }[] = [];
    for (let i = startDayOfWeek; i > 0; i--) {
      dates.push({ date: new Date(year, month, 1 - i), isCurrentMonth: false });
    }
    for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
      dates.push({ date: new Date(year, month, i), isCurrentMonth: true });
    }
    const remainingDays = (7 - (dates.length % 7)) % 7;
    for (let i = 1; i <= remainingDays; i++) {
      dates.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
    }

    return dates.map(({ date, isCurrentMonth }) => ({
      date,
      dayNumber: date.getDate(),
      isCurrentMonth,
      isToday: date.getTime() === today.getTime(),
      events: eventsForDay(events, date),
    }));
  }, [view, currentDate, events]);

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

  if (!showCalendar) {
    return (
      <div className={styles.containerCollapsed} data-testid="vehicle-calendar">
        <div className={styles.titleArea}>
          <span className={styles.titleIcon}>📅</span>
          <div>
            <h2 className={styles.title}>Planning des véhicules</h2>
            <p className={styles.subtitle}>Le calendrier est actuellement masqué</p>
          </div>
        </div>
        <button
          type="button"
          className={styles.toggleBtn}
          onClick={toggleShowCalendar}
          aria-expanded={false}
          aria-label="Afficher le calendrier des véhicules"
        >
          👁️ Afficher le calendrier
        </button>
      </div>
    );
  }

  return (
    <div className={styles.container} data-testid="vehicle-calendar">
      {/* Header & Controls */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <span className={styles.titleIcon}>📅</span>
          <div>
            <h2 className={styles.title}>Planning des véhicules</h2>
            <p className={styles.subtitle}>Réservations & Emprunts par {PERIOD_WORD[view]}</p>
          </div>
        </div>

        <div className={styles.controls}>
          <div className={styles.monthNav}>
            <button
              className={styles.navBtn}
              onClick={goPrev}
              aria-label={`${PERIOD_LABEL[view]} précédent${view === 'week' ? 'e' : ''}`}
              type="button"
            >
              ◀
            </button>
            <span className={styles.currentMonthLabel}>
              {label}
            </span>
            <button
              className={styles.navBtn}
              onClick={goNext}
              aria-label={`${PERIOD_LABEL[view]} suivant${view === 'week' ? 'e' : ''}`}
              type="button"
            >
              ▶
            </button>
            <button
              className={styles.navBtn}
              onClick={goToday}
              style={{ marginLeft: '0.25rem', borderLeft: '1px solid var(--border-primary)' }}
              type="button"
            >
              Aujourd&apos;hui
            </button>
          </div>

          <CalendarViewSwitcher view={view} onChange={setView} />

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

          <button
            type="button"
            className={styles.toggleBtn}
            onClick={toggleShowCalendar}
            aria-expanded={true}
            aria-label="Masquer le calendrier des véhicules"
          >
            👁️ Masquer
          </button>
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
        <div className={styles.legendItem}>
          <span className={`${styles.legendBadge} ${styles.legendMaintenance}`} />
          <span>Maintenance (Rouge)</span>
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendBadge} ${styles.legendMaintenanceOngoing}`} />
          <span>Maintenance fin inconnue (Rouge pointillés)</span>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Chargement du calendrier...
        </div>
      ) : (
        <>
          {view === 'month' && (
            <div className={styles.gridContainer}>
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
                      <button
                        type="button"
                        className={styles.dayNumberButton}
                        onClick={() => openDay(day.date)}
                        aria-label={`Voir la journée du ${day.dayNumber} ${monthName(day.date.getMonth()).toLowerCase()}`}
                      >
                        <span className={`${styles.dayNumber} ${day.isToday ? styles.todayBadge : ''}`}>
                          {day.dayNumber}
                        </span>
                      </button>
                    </div>

                    <div className={styles.eventList}>
                      {day.events.map((event, eIdx) => (
                        <CalendarEventCard
                          key={`${event.type}-${event.data.id}-${eIdx}`}
                          event={event}
                          day={day.date}
                          onSelect={setSelectedEvent}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {view === 'week' && (
            <CalendarWeekView date={currentDate} events={events} onSelect={setSelectedEvent} onOpenDay={openDay} />
          )}
          {view === 'day' && (
            <CalendarDayView date={currentDate} events={events} onSelect={setSelectedEvent} />
          )}
        </>
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
                        : selectedEvent.type === 'TRIP'
                        ? '#DCFCE7'
                        : '#FEE2E2',
                    color:
                      selectedEvent.type === 'RESERVATION'
                        ? '#854D0E'
                        : selectedEvent.type === 'TRIP'
                        ? (selectedEvent.isOngoing ? '#15803D' : '#166534')
                        : '#991B1B',
                    border:
                      selectedEvent.type === 'RESERVATION'
                        ? '1px solid #CA8A04'
                        : selectedEvent.type === 'TRIP'
                        ? (selectedEvent.isOngoing ? '1px dashed #15803D' : '1px solid #16A34A')
                        : (selectedEvent.isEndDateUnknown ? '1px dashed #DC2626' : '1px solid #EF4444'),
                  }}
                >
                  {selectedEvent.type === 'RESERVATION'
                    ? '🟡 Réservation'
                    : selectedEvent.type === 'TRIP'
                    ? (selectedEvent.isOngoing ? '🟢 Emprunt en cours' : '🟢 Emprunt terminé')
                    : (selectedEvent.isEndDateUnknown ? '🔴 Maintenance (date fin inconnue)' : '🔴 Maintenance')}
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
                    <span className={styles.detailLabel}>Chauffeur (Réservé par)</span>
                    <span className={styles.detailValue}>
                      {isUnassignedDriverName(selectedEvent.data.userName) ? (
                        <strong>{UNASSIGNED_DRIVER_NAME}</strong>
                      ) : (
                        `${selectedEvent.data.userName} (${selectedEvent.data.userEmail})`
                      )}
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
              ) : selectedEvent.type === 'TRIP' ? (
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
                        <span style={{ color: 'var(--status-available)', fontWeight: 700 }}>
                          ⏳ En cours (non restitué)
                        </span>
                      ) : (
                        formatDateFull(selectedEvent.data.checkInAt)
                      )}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Véhicule</span>
                    <span className={styles.detailValue}>
                      {selectedEvent.data.vehicleName} ({selectedEvent.data.vehiclePlate})
                    </span>
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Date de début</span>
                    <span className={styles.detailValue}>
                      {formatDateFull(selectedEvent.data.startDate)}
                    </span>
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Date de fin</span>
                    <span className={styles.detailValue}>
                      {selectedEvent.data.endDate ? (
                        formatDateFull(selectedEvent.data.endDate)
                      ) : (
                        <span style={{ color: 'var(--status-maintenance)', fontWeight: 700 }}>
                          Date de fin inconnue
                        </span>
                      )}
                    </span>
                  </div>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Raison / Motif</span>
                    <span className={styles.detailValue}>{selectedEvent.data.reason}</span>
                  </div>
                  {canEditMaintenance && isMaintenanceEditable(selectedEvent.data.endDate) && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                      <button
                        className="btn btn-secondary"
                        onClick={() => setEditingMaintenance(selectedEvent.data)}
                      >
                        ✏️ Modifier
                      </button>
                      <button
                        className="btn btn-primary"
                        style={{ background: 'var(--status-maintenance)', borderColor: 'var(--status-maintenance)' }}
                        onClick={() => setDeletingMaintenance(selectedEvent.data)}
                      >
                        🗑️ Supprimer
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modification d'une maintenance (calendrier) */}
      {editingMaintenance && (
        <EditMaintenanceEventModal
          event={editingMaintenance}
          onClose={() => setEditingMaintenance(null)}
          onSuccess={() => {
            setSelectedEvent(null);
            setEditingMaintenance(null);
            fetchData();
          }}
        />
      )}

      {/* Suppression d'une maintenance (calendrier) */}
      {deletingMaintenance && (
        <DeleteMaintenanceEventModal
          event={deletingMaintenance}
          onClose={() => setDeletingMaintenance(null)}
          onSuccess={() => {
            setSelectedEvent(null);
            setDeletingMaintenance(null);
            fetchData();
          }}
        />
      )}
    </div>
  );
}
