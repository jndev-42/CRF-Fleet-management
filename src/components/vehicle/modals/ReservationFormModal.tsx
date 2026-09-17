'use client';

import React, { useEffect, useState } from 'react';
import styles from '../Reservation.module.css';
import UserCombobox from '@/components/ui/UserCombobox';
import { canAccessAdminPanel } from '@/lib/roles';
import RecurrencePanel, { RecurrenceFormState } from '../RecurrencePanel';
import ReservationSlotPicker from '../ReservationSlotPicker';
import { UNASSIGNED_DRIVER_NAME } from '@/lib/reservationDriver';

/** État initial du panneau de récurrence. Exporté pour les tests et les appelants. */
export const DEFAULT_RECURRENCE: RecurrenceFormState = {
    enabled: false,
    daysOfWeek: [],
    startHour: '',
    endHour: '',
    firstOccurrenceDate: '',
    recurrenceEndDate: '',
};

export interface ReservationFormSuccess {
    /**
     * Bandeau d'alerte à afficher par l'appelant après une récurrence partiellement
     * créée (créneaux ignorés pour cause de conflit). `null` quand tout est passé.
     */
    recurrenceWarning: string | null;
}

interface ReservationFormModalProps {
    vehicleId: string;
    /**
     * Type du véhicule (VL / VPSP…). Sert au fetch de la liste des chauffeurs
     * (`GET /api/users?vehicleType=…`), effectué ICI et non par l'appelant : dans le
     * parcours de réservation rapide le type n'est connu qu'après la sélection du
     * véhicule dans `VehiclePickerModal`.
     */
    vehicleType: string;
    currentUserEmail: string | null;
    userRoles: string[];
    onClose: () => void;
    /**
     * Callback générique post-soumission. Chaque consommateur définit son propre effet :
     * `ReservationBlock` rafraîchit sa liste locale, `QuickReservationSection` la grille
     * de véhicules du dashboard.
     */
    onSuccess: (result: ReservationFormSuccess) => void;
    /** Titre du modal. Défaut : parcours fiche véhicule. */
    title?: string;
    /**
     * Affiche le mini-calendrier d'occupation du véhicule au-dessus des champs de dates.
     * Désactivé par défaut : la fiche véhicule porte déjà sa propre liste de réservations,
     * seul le parcours rapide (sans contexte véhicule) en a besoin.
     */
    showOccupancy?: boolean;
    /** Présélection du chauffeur. `'UNASSIGNED'` pour « Chauffeur non décidé ». */
    initialDriverSelection?: string;
}

/**
 * Formulaire de création de réservation — source unique de vérité.
 *
 * Partagé par la fiche véhicule (`ReservationBlock`) et la réservation rapide du
 * dashboard (`QuickReservationSection`). Ne connaît qu'une surface serveur :
 * `POST /api/vehicles/{id}/reservations`, en simple ou en récurrent.
 *
 * Ne touche jamais `Vehicle.status` : une réservation n'immobilise pas le véhicule,
 * contrairement à l'emprunt.
 */
export default function ReservationFormModal({
    vehicleId,
    vehicleType,
    currentUserEmail,
    userRoles,
    onClose,
    onSuccess,
    title = 'Réserver ce véhicule',
    showOccupancy = false,
    initialDriverSelection = '',
}: ReservationFormModalProps) {
    const [startDate, setStartDate] = useState('');
    const [startTime, setStartTime] = useState('');
    const [endDate, setEndDate] = useState('');
    const [endTime, setEndTime] = useState('');
    const [reason, setReason] = useState('');
    const [driverSelection, setDriverSelection] = useState(initialDriverSelection);
    const [submitting, setSubmitting] = useState(false);
    const [recurrence, setRecurrence] = useState<RecurrenceFormState>(DEFAULT_RECURRENCE);

    const [users, setUsers] = useState<{ id: string; name: string | null; email: string }[]>([]);

    const canValidate = canAccessAdminPanel(userRoles) || userRoles.includes('ADMIN') || userRoles.includes('RESPO');
    const canManageDriver = canAccessAdminPanel(userRoles) || userRoles.includes('RESPO');

    useEffect(() => {
        if (!canManageDriver) return;
        fetch(`/api/users?vehicleType=${encodeURIComponent(vehicleType)}`)
            .then(res => { if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`); return res.json(); })
            .then(data => { if (data.users) setUsers(data.users); })
            .catch(console.error);
    }, [canManageDriver, vehicleType]);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            if (recurrence.enabled) {
                const payload = {
                    recurrence: {
                        daysOfWeek: recurrence.daysOfWeek,
                        startHour: recurrence.startHour,
                        endHour: recurrence.endHour,
                        firstOccurrenceDate: recurrence.firstOccurrenceDate,
                        recurrenceEndDate: recurrence.recurrenceEndDate,
                        reason: reason || undefined,
                        ...(canManageDriver && driverSelection === 'UNASSIGNED' ? { isUnassignedDriver: true } : {}),
                        ...(canManageDriver && driverSelection && driverSelection !== 'UNASSIGNED' ? { onBehalfOfUserId: driverSelection } : {}),
                    },
                };

                const res = await fetch(`/api/vehicles/${vehicleId}/reservations`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });

                const data = await res.json();

                if (res.ok) {
                    let recurrenceWarning: string | null = null;
                    if (data.skipped && data.skipped.length > 0) {
                        const skippedFormatted = data.skipped
                            .map((d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }))
                            .join(', ');
                        recurrenceWarning =
                            `✅ ${data.created} créneau(x) créé(s). ⚠️ ${data.skipped.length} créneau(x) ignoré(s) car déjà réservé(s) : ${skippedFormatted}`;
                    }
                    onSuccess({ recurrenceWarning });
                } else {
                    alert(data.error || 'Erreur lors de la création des réservations récurrentes');
                }
            } else {
                const startISO = new Date(`${startDate}T${startTime}`).toISOString();
                const endISO = new Date(`${endDate}T${endTime}`).toISOString();

                const bodyPayload: Record<string, unknown> = { startTime: startISO, endTime: endISO, reason };

                if (canManageDriver) {
                    if (driverSelection === 'UNASSIGNED') bodyPayload.isUnassignedDriver = true;
                    else if (driverSelection) bodyPayload.onBehalfOfUserId = driverSelection;
                }

                const res = await fetch(`/api/vehicles/${vehicleId}/reservations`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(bodyPayload),
                });

                if (res.ok) {
                    onSuccess({ recurrenceWarning: null });
                } else {
                    const data = await res.json();
                    alert(data.error || 'Erreur lors de la réservation');
                }
            }
        } catch {
            alert('Erreur réseau');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000 }}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: showOccupancy ? 560 : 480 }}>
                <h3>{title}</h3>
                {!canValidate && (
                    <p className={styles.pendingNotice}>
                        Votre demande sera soumise à validation par un responsable.
                    </p>
                )}
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
                    {canManageDriver && (
                        <div className={styles.formGroup}>
                            <label>Chauffeur (Pour)</label>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <div style={{ flex: 1 }}>
                                    <UserCombobox
                                        users={users}
                                        value={driverSelection}
                                        onChange={setDriverSelection}
                                        excludeEmail={currentUserEmail ?? undefined}
                                        defaultLabel="Moi-même"
                                    />
                                </div>
                                <button
                                    type="button"
                                    className={`${styles.quickChBtn} ${driverSelection === 'UNASSIGNED' ? styles.quickChBtnActive : ''}`}
                                    onClick={() => setDriverSelection(driverSelection === 'UNASSIGNED' ? '' : 'UNASSIGNED')}
                                    title={`Indiquer ${UNASSIGNED_DRIVER_NAME}`}
                                >
                                    {UNASSIGNED_DRIVER_NAME}
                                </button>
                            </div>
                            {driverSelection === 'UNASSIGNED' && (
                                <p className={styles.pendingNotice} style={{ marginTop: 4 }}>
                                    Cette réservation sera enregistrée sans chauffeur attribué.
                                </p>
                            )}
                        </div>
                    )}

                    {/* Toggle récurrence */}
                    <div className={styles.formGroup}>
                        <div className={styles.recurrenceToggleRow}>
                            <label htmlFor="recurrence-toggle" className={styles.recurrenceToggleLabel}>
                                🔁 Réservation récurrente
                            </label>
                            <button
                                id="recurrence-toggle"
                                type="button"
                                role="switch"
                                aria-checked={recurrence.enabled}
                                className={`${styles.toggleSwitch} ${recurrence.enabled ? styles.toggleSwitchOn : ''}`}
                                onClick={() => setRecurrence(prev => ({ ...prev, enabled: !prev.enabled }))}
                            >
                                <span className={styles.toggleThumb} />
                            </button>
                        </div>
                    </div>

                    {recurrence.enabled ? (
                        <RecurrencePanel state={recurrence} onChange={setRecurrence} />
                    ) : (
                        <>
                            {showOccupancy && (
                                <ReservationSlotPicker
                                    vehicleId={vehicleId}
                                    startDate={startDate}
                                    endDate={endDate}
                                    onSelectRange={(nextStart, nextEnd) => {
                                        setStartDate(nextStart);
                                        setEndDate(nextEnd);
                                    }}
                                />
                            )}
                            <div className={styles.formRow}>
                                <div className={styles.formGroup}>
                                    <label>Date de début</label>
                                    <input type="date" required value={startDate} onChange={e => setStartDate(e.target.value)} className="form-input" />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Heure</label>
                                    <input type="time" required value={startTime} onChange={e => setStartTime(e.target.value)} className="form-input" />
                                </div>
                            </div>
                            <div className={styles.formRow}>
                                <div className={styles.formGroup}>
                                    <label>Date de fin</label>
                                    <input type="date" required value={endDate} onChange={e => setEndDate(e.target.value)} className="form-input" min={startDate} />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Heure</label>
                                    <input type="time" required value={endTime} onChange={e => setEndTime(e.target.value)} className="form-input" />
                                </div>
                            </div>
                        </>
                    )}

                    <div className={styles.formGroup}>
                        <label>Motif / Mission (Optionnel)</label>
                        <input type="text" value={reason} onChange={e => setReason(e.target.value)} className="form-input" placeholder="Ex: Réserve pour une maraude" />
                    </div>
                    <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                        <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={submitting}>
                            {submitting ? '...' : canValidate
                                ? (recurrence.enabled ? '🔁 Créer les réservations' : 'Valider')
                                : (recurrence.enabled ? '🔁 Soumettre la récurrence' : 'Soumettre la demande')}
                        </button>
                        <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>
                            Annuler
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
