import React, { useState, useEffect } from 'react';
import styles from './Reservation.module.css';

interface Reservation {
    id: string;
    vehicleId: string;
    userEmail: string;
    userName: string;
    startTime: string;
    endTime: string;
    reason: string | null;
    status: 'PENDING' | 'VALIDATED';
    createdAt: string;
}

interface ReservationBlockProps {
    vehicleId: string;
    currentUserEmail: string | null;
    userRoles: string[];
    onActiveReservationChange?: (isReservedByOther: boolean) => void;
}

export default function ReservationBlock({ vehicleId, currentUserEmail, userRoles, onActiveReservationChange }: ReservationBlockProps) {
    const [reservations, setReservations] = useState<Reservation[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [validating, setValidating] = useState<string | null>(null);

    // Form fields
    const [startDate, setStartDate] = useState('');
    const [startTime, setStartTime] = useState('');
    const [endDate, setEndDate] = useState('');
    const [endTime, setEndTime] = useState('');
    const [reason, setReason] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const isAdmin = userRoles.includes('ADMIN');
    const isRespo = userRoles.includes('RESPO');
    const canValidate = isAdmin || isRespo;

    const fetchReservations = async () => {
        try {
            const res = await fetch(`/api/vehicles/${vehicleId}/reservations`);
            if (res.ok) {
                const data: Reservation[] = await res.json();
                setReservations(data);

                if (onActiveReservationChange) {
                    const now = new Date();
                    // Seules les réservations VALIDÉES bloquent l'emprunt
                    const activeRes = data.find(r =>
                        r.status === 'VALIDATED' &&
                        new Date(r.startTime) <= now &&
                        new Date(r.endTime) >= now
                    );
                    onActiveReservationChange(!!activeRes && activeRes.userEmail !== currentUserEmail);
                }
            }
        } catch (e) {
            console.error('Failed to fetch reservations', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReservations();
    }, [vehicleId]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const startISO = new Date(`${startDate}T${startTime}`).toISOString();
            const endISO = new Date(`${endDate}T${endTime}`).toISOString();

            const res = await fetch(`/api/vehicles/${vehicleId}/reservations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ startTime: startISO, endTime: endISO, reason })
            });

            if (res.ok) {
                setShowModal(false);
                setStartDate(''); setStartTime(''); setEndDate(''); setEndTime(''); setReason('');
                fetchReservations();
            } else {
                const data = await res.json();
                alert(data.error || 'Erreur lors de la réservation');
            }
        } catch (e) {
            alert('Erreur réseau');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Voulez-vous vraiment annuler cette réservation ?')) return;
        try {
            const res = await fetch(`/api/reservations/${id}`, { method: 'DELETE' });
            if (res.ok) {
                fetchReservations();
            } else {
                alert('Erreur lors de la suppression');
            }
        } catch (e) {
            alert('Erreur réseau');
        }
    };

    const handleValidate = async (id: string) => {
        setValidating(id);
        try {
            const res = await fetch(`/api/reservations/${id}`, { method: 'PATCH' });
            if (res.ok) {
                fetchReservations();
            } else {
                const data = await res.json();
                alert(data.error || 'Erreur lors de la validation');
            }
        } catch (e) {
            alert('Erreur réseau');
        } finally {
            setValidating(null);
        }
    };

    // Filter out reservations that have already strictly passed
    const upcomingReservations = reservations.filter(r => new Date(r.endTime) >= new Date());

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h2 className={styles.title}>Réservations prévues</h2>
                <button className={`btn btn-secondary ${styles.addBtn}`} onClick={() => setShowModal(true)}>
                    + Réserver
                </button>
            </div>

            {loading ? (
                <div className={styles.loading}>Chargement des réservations...</div>
            ) : upcomingReservations.length === 0 ? (
                <div className={styles.empty}>Aucune réservation prévue pour le moment.</div>
            ) : (
                <div className={styles.list}>
                    {upcomingReservations.map(res => {
                        const start = new Date(res.startTime);
                        const end = new Date(res.endTime);
                        const canDelete = isAdmin || res.userEmail === currentUserEmail;
                        const isPending = res.status === 'PENDING';

                        return (
                            <div key={res.id} className={`${styles.item} ${isPending ? styles.itemPending : ''}`}>
                                <div className={styles.itemInfo}>
                                    <div className={styles.itemDateRow}>
                                        <div className={styles.itemDate}>
                                            Du <strong>{start.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })} à {start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })}</strong>
                                            {' '}au <strong>{end.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })} à {end.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })}</strong>
                                        </div>
                                        <span className={isPending ? styles.badgePending : styles.badgeValidated}>
                                            {isPending ? 'En attente' : 'Validée'}
                                        </span>
                                    </div>
                                    <div className={styles.itemUser}>
                                        Par {res.userName}{res.reason && <span className={styles.itemReason}> - {res.reason}</span>}
                                    </div>
                                </div>
                                <div className={styles.itemActions}>
                                    {canValidate && isPending && (
                                        <button
                                            onClick={() => handleValidate(res.id)}
                                            className={styles.validateBtn}
                                            disabled={validating === res.id}
                                            aria-label="Valider la réservation"
                                        >
                                            {validating === res.id ? '...' : '✓ Valider'}
                                        </button>
                                    )}
                                    {canDelete && (
                                        <button onClick={() => handleDelete(res.id)} className={styles.deleteBtn} aria-label="Supprimer la réservation">
                                            ✕
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)} style={{ zIndex: 1000 }}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
                        <h3>Réserver ce véhicule</h3>
                        {!canValidate && (
                            <p className={styles.pendingNotice}>
                                Votre demande sera soumise à validation par un responsable.
                            </p>
                        )}
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
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
                            <div className={styles.formGroup}>
                                <label>Motif (Optionnel)</label>
                                <input type="text" value={reason} onChange={e => setReason(e.target.value)} className="form-input" placeholder="Ex: Réserve pour une maraude" />
                            </div>
                            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={submitting}>
                                    {submitting ? '...' : canValidate ? 'Valider' : 'Soumettre la demande'}
                                </button>
                                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowModal(false)}>
                                    Annuler
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
