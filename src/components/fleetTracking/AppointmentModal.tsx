'use client';

import { useState, type FormEvent } from 'react';
import {
    CONTROL_TYPE_LABELS,
    MAX_APPOINTMENT_NOTES,
    MAX_APPOINTMENT_YEARS,
    addYears,
    appointmentDateError,
    appointmentTaskTitle,
    dueLabel,
    type ControlRow,
} from '@/lib/fleetTracking/controls';
import { APPOINTMENTS_URL } from './useFleetControls';
import { readError, useFleetContacts } from './useFleetContacts';
import { useModalFocus } from './useModalFocus';
import styles from './tasks.module.css';
import controlStyles from './controls.module.css';

export interface AppointmentSaved {
    deleted: boolean;
    /** Une tâche liée vient d'être créée. */
    taskCreated: boolean;
}

interface Props {
    row: ControlRow;
    /** Jour de référence (Europe/Paris) : bornes du sélecteur de date. */
    today: string;
    onClose: () => void;
    /** Rendez-vous enregistré ou supprimé : la modale se ferme. */
    onSaved: (result: AppointmentSaved) => void;
    /** Rendez-vous enregistré mais tâche non créée : la modale reste ouverte avec le message. */
    onPartiallySaved: () => void;
}

/**
 * Modale « Fixer un rendez-vous » / « Modifier » d'une échéance de contrôle : date,
 * garage pris dans les contacts (de l'UL ou proposés par d'autres UL), notes,
 * option « Créer une tâche » (remplacée par « Tâche liée » quand elle existe déjà),
 * suppression du rendez-vous existant.
 */
export default function AppointmentModal({ row, today, onClose, onSaved, onPartiallySaved }: Props) {
    const existing = row.appointment;
    const [date, setDate] = useState(existing && !row.appointmentPast ? existing.appointmentDate : '');
    const [contactId, setContactId] = useState(existing?.contactId ?? '');
    const [notes, setNotes] = useState(existing?.notes ?? '');
    const [createTask, setCreateTask] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { own, shared } = useFleetContacts();
    const requestClose = () => {
        if (!busy) onClose();
    };
    const dialogRef = useModalFocus<HTMLDivElement>(requestClose);
    const label = CONTROL_TYPE_LABELS[row.controlType];
    const linkedTaskId = existing?.taskId ?? null;
    const maxDate = addYears(today, MAX_APPOINTMENT_YEARS);

    const send = async (url: string, init: RequestInit, fallback: string, deleted: boolean) => {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(url, init);
            if (!res.ok) {
                setError(await readError(res, fallback));
                return;
            }
            const body = await res.json().catch(() => ({})) as { taskCreated?: boolean; taskError?: string | null };
            if (body.taskError) {
                setError(body.taskError);
                setCreateTask(false);
                onPartiallySaved();
                return;
            }
            onSaved({ deleted, taskCreated: !!body.taskCreated });
        } catch {
            setError(fallback);
        } finally {
            setBusy(false);
        }
    };

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!date) return setError('La date du rendez-vous est requise');
        const rangeError = appointmentDateError(date, today);
        if (rangeError) return setError(rangeError);
        void send(APPOINTMENTS_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                vehicleId: row.vehicle.id,
                controlType: row.controlType,
                appointmentDate: date,
                contactId: contactId || null,
                notes: notes.trim() || null,
                createTask: createTask && !linkedTaskId,
            }),
        }, 'Enregistrement impossible', false);
    };

    const handleDelete = () => {
        if (!existing || !window.confirm('Supprimer ce rendez-vous ?')) return;
        void send(`${APPOINTMENTS_URL}/${encodeURIComponent(existing.id)}`, { method: 'DELETE' }, 'Suppression impossible', true);
    };

    // Garage d'origine devenu invisible (partage retiré) : gardé sélectionnable.
    const knownIds = new Set([...own, ...shared].map(c => c.id));

    return (
        <div className="modal-overlay" onClick={requestClose}>
            <div ref={dialogRef} className={`modal ${styles.modal}`} role="dialog" aria-modal="true" aria-labelledby="appointment-modal-title" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 id="appointment-modal-title" className="modal-title">
                        {existing && !row.appointmentPast ? 'Modifier le rendez-vous' : 'Fixer un rendez-vous'}
                    </h2>
                    <button type="button" className="modal-close" onClick={requestClose} disabled={busy} aria-label="Fermer la modale">✕</button>
                </div>
                <form onSubmit={handleSubmit} noValidate>
                    <div className="modal-body">
                        <p className={styles.dim}>{label} du {row.vehicle.name} — échéance {dueLabel(row)}</p>
                        <div className="form-group">
                            <label className="form-label" htmlFor="appointment-date">Date du rendez-vous *</label>
                            <input id="appointment-date" data-autofocus type="date" className="form-input" value={date} required
                                min={today} max={maxDate}
                                onChange={e => setDate(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label className="form-label" htmlFor="appointment-contact">Garage</label>
                            <select id="appointment-contact" className="form-select" value={contactId} onChange={e => setContactId(e.target.value)}>
                                <option value="">Aucun</option>
                                {contactId && !knownIds.has(contactId) && <option value={contactId}>{existing?.contactName ?? 'Contact indisponible'}</option>}
                                {own.length > 0 && (
                                    <optgroup label="Contacts de l'UL">
                                        {own.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </optgroup>
                                )}
                                {shared.length > 0 && (
                                    <optgroup label="Proposés par d'autres UL">
                                        {shared.map(c => <option key={c.id} value={c.id}>{c.ulName ? `${c.name} (UL ${c.ulName})` : c.name}</option>)}
                                    </optgroup>
                                )}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label" htmlFor="appointment-notes">Notes</label>
                            <textarea id="appointment-notes" className="form-input" rows={3} value={notes} maxLength={MAX_APPOINTMENT_NOTES}
                                onChange={e => setNotes(e.target.value)} />
                        </div>
                        {linkedTaskId ? (
                            <p className={styles.dim}>Tâche liée : son échéance suit la date du rendez-vous.</p>
                        ) : (
                            <label className={controlStyles.checkbox}>
                                <input type="checkbox" checked={createTask} onChange={e => setCreateTask(e.target.checked)} />
                                Créer une tâche « {appointmentTaskTitle(row.controlType, row.vehicle.name)} »
                            </label>
                        )}
                        {error && <p role="alert" className={styles.error}>{error}</p>}
                    </div>
                    <div className={`modal-footer ${controlStyles.modalFooter}`}>
                        {existing && (
                            <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={busy}>Supprimer le rendez-vous</button>
                        )}
                        <div className={controlStyles.footerEnd}>
                            <button type="button" className="btn btn-secondary" onClick={requestClose} disabled={busy}>Annuler</button>
                            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
