'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './ReservationSlotPicker.module.css';

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

/** Sous-ensembles de `GET /api/vehicles/calendar` réellement consommés ici. */
interface CalendarReservation {
    startTime: string;
    endTime: string;
    userName: string;
    status: string;
}
interface CalendarTrip {
    checkOutAt: string;
    checkInAt: string | null;
    driverName: string;
}
interface CalendarMaintenance {
    startDate: string;
    endDate: string | null;
    reason: string;
}

interface ReservationSlotPickerProps {
    vehicleId: string;
    /** `YYYY-MM-DD` ou `''`. */
    startDate: string;
    /** `YYYY-MM-DD` ou `''`. */
    endDate: string;
    onSelectRange: (startDate: string, endDate: string) => void;
}

/** Clé locale `YYYY-MM-DD` — jamais `toISOString()`, qui décale d'un jour en UTC-. */
function toDayKey(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function monthKeyOf(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Tous les jours `YYYY-MM-DD` couverts par un intervalle, bornes incluses. */
function daysBetween(from: Date, to: Date): string[] {
    const days: string[] = [];
    const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const last = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    // Garde-fou : un intervalle aberrant (donnée corrompue) ne doit pas boucler sans fin.
    let guard = 0;
    while (cursor <= last && guard < 400) {
        days.push(toDayKey(cursor));
        cursor.setDate(cursor.getDate() + 1);
        guard++;
    }
    return days;
}

/**
 * Mini-calendrier d'occupation d'un véhicule + sélection d'une plage de dates.
 *
 * Alimenté par `GET /api/vehicles/calendar?vehicleId=…&month=…` — aucune nouvelle surface
 * API. Cet endpoint pagine par mois (fenêtre ±7 jours), la navigation mois par mois est
 * donc gérée ici : chaque mois visité déclenche son propre appel, mémoïsé ensuite.
 *
 * Échec de fetch assumé en fail-open : le calendrier s'affiche sans occupation plutôt
 * que de bloquer la réservation. Le serveur reste seul juge des chevauchements
 * (`POST /api/vehicles/{id}/reservations` → 409).
 */
export default function ReservationSlotPicker({
    vehicleId,
    startDate,
    endDate,
    onSelectRange,
}: ReservationSlotPickerProps) {
    const today = useMemo(() => new Date(), []);
    const [viewMonth, setViewMonth] = useState<Date>(
        () => new Date(today.getFullYear(), today.getMonth(), 1),
    );
    /** Occupation par mois visité : `{ '2026-09': { '2026-09-04': ['Maraude — Dupont'] } }`. */
    const [occupancyByMonth, setOccupancyByMonth] = useState<Record<string, Record<string, string[]>>>({});

    const viewMonthKey = monthKeyOf(viewMonth);
    // Dérivé, jamais un état : un mois est « en chargement » tant qu'il n'a pas d'entrée.
    const alreadyLoaded = occupancyByMonth[viewMonthKey] !== undefined;

    const loadMonth = useCallback(async (monthKey: string) => {
        try {
            const res = await fetch(
                `/api/vehicles/calendar?vehicleId=${encodeURIComponent(vehicleId)}&month=${monthKey}`,
            );
            if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
            const data = await res.json();

            const map: Record<string, string[]> = {};
            const push = (dayKey: string, label: string) => {
                if (!map[dayKey]) map[dayKey] = [];
                if (!map[dayKey].includes(label)) map[dayKey].push(label);
            };

            const reservations: CalendarReservation[] = Array.isArray(data?.reservations) ? data.reservations : [];
            for (const r of reservations) {
                const label = `Réservation — ${r.userName}${r.status === 'PENDING' ? ' (en attente)' : ''}`;
                for (const day of daysBetween(new Date(r.startTime), new Date(r.endTime))) push(day, label);
            }

            const trips: CalendarTrip[] = Array.isArray(data?.trips) ? data.trips : [];
            for (const t of trips) {
                const label = `Emprunt — ${t.driverName}`;
                const end = t.checkInAt ? new Date(t.checkInAt) : new Date(t.checkOutAt);
                for (const day of daysBetween(new Date(t.checkOutAt), end)) push(day, label);
            }

            const maintenances: CalendarMaintenance[] = Array.isArray(data?.maintenances) ? data.maintenances : [];
            for (const m of maintenances) {
                const label = `Maintenance — ${m.reason}`;
                const start = new Date(`${m.startDate.split('T')[0]}T12:00:00`);
                const end = m.endDate ? new Date(`${m.endDate.split('T')[0]}T12:00:00`) : start;
                for (const day of daysBetween(start, end)) push(day, label);
            }

            setOccupancyByMonth(prev => ({ ...prev, [monthKey]: map }));
        } catch (e) {
            console.error('Failed to fetch vehicle occupancy', monthKey, e);
            setOccupancyByMonth(prev => ({ ...prev, [monthKey]: {} })); // fail-open assumé
        }
    }, [vehicleId]);

    useEffect(() => {
        if (alreadyLoaded) return;
        void loadMonth(viewMonthKey);
    }, [alreadyLoaded, viewMonthKey, loadMonth]);

    const occupancy = occupancyByMonth[viewMonthKey] ?? {};

    /** Cases du mois, précédées des blancs nécessaires pour aligner sur un lundi. */
    const cells = useMemo(() => {
        const year = viewMonth.getFullYear();
        const month = viewMonth.getMonth();
        const firstDay = new Date(year, month, 1);
        // getDay(): 0 = dimanche. Grille lundi-first → dimanche en dernière colonne.
        const leading = (firstDay.getDay() + 6) % 7;
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const list: ({ key: string; day: number } | null)[] = Array.from({ length: leading }, () => null);
        for (let day = 1; day <= daysInMonth; day++) {
            list.push({ key: toDayKey(new Date(year, month, day)), day });
        }
        return list;
    }, [viewMonth]);

    const todayKey = toDayKey(today);

    function handleDayClick(dayKey: string) {
        // Nouvelle plage si rien n'est sélectionné, si une plage complète l'est déjà,
        // ou si le clic précède le début courant.
        const rangeComplete = Boolean(startDate) && Boolean(endDate) && startDate !== endDate;
        if (!startDate || rangeComplete || dayKey < startDate) {
            onSelectRange(dayKey, dayKey);
            return;
        }
        onSelectRange(startDate, dayKey);
    }

    function isSelected(dayKey: string): boolean {
        if (!startDate) return false;
        const last = endDate || startDate;
        return dayKey >= startDate && dayKey <= last;
    }

    const monthLabel = viewMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

    return (
        <div className={styles.picker} data-testid="reservation-slot-picker">
            <div className={styles.header}>
                <button
                    type="button"
                    className={styles.navBtn}
                    onClick={() => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                    aria-label="Mois précédent"
                >
                    ◀
                </button>
                <span className={styles.monthLabel}>{monthLabel}</span>
                <button
                    type="button"
                    className={styles.navBtn}
                    onClick={() => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                    aria-label="Mois suivant"
                >
                    ▶
                </button>
            </div>

            {!alreadyLoaded && (
                <p className={styles.loading} role="status">Chargement de l&apos;occupation…</p>
            )}

            <div className={styles.weekdays} aria-hidden="true">
                {WEEKDAY_LABELS.map(label => (
                    <span key={label} className={styles.weekday}>{label}</span>
                ))}
            </div>

            <div className={styles.grid} role="grid" aria-label="Occupation du véhicule">
                {cells.map((cell, idx) => {
                    if (!cell) return <span key={`blank-${idx}`} className={styles.blank} />;
                    const busy = occupancy[cell.key] ?? [];
                    const selected = isSelected(cell.key);
                    const isPast = cell.key < todayKey;
                    const classNames = [
                        styles.day,
                        busy.length > 0 ? styles.dayBusy : '',
                        selected ? styles.daySelected : '',
                        cell.key === todayKey ? styles.dayToday : '',
                    ].filter(Boolean).join(' ');

                    return (
                        <button
                            key={cell.key}
                            type="button"
                            data-testid="slot-day"
                            data-day={cell.key}
                            data-busy={busy.length > 0 ? 'true' : 'false'}
                            aria-pressed={selected}
                            className={classNames}
                            disabled={isPast}
                            title={busy.length > 0 ? busy.join('\n') : undefined}
                            onClick={() => handleDayClick(cell.key)}
                        >
                            <span className={styles.dayNumber}>{cell.day}</span>
                            {busy.length > 0 && <span className={styles.dot} aria-hidden="true" />}
                        </button>
                    );
                })}
            </div>

            <p className={styles.legend}>
                <span className={styles.legendBusy} aria-hidden="true" /> Créneau déjà occupé (réservation, emprunt ou maintenance)
            </p>
        </div>
    );
}
