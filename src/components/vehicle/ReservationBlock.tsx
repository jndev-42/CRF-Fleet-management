import React, { useState, useEffect, useCallback } from 'react';
import styles from './Reservation.module.css';
import UserCombobox from '@/components/ui/UserCombobox';
import { canAccessAdminPanel } from '@/lib/roles';

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
    vehicleType: string;
    currentUserEmail: string | null;
    userRoles: string[];
    onActiveReservationChange?: (isReservedByOther: boolean) => void;
    licenseBlocked?: boolean;
}

export default function ReservationBlock({ vehicleId, vehicleType, currentUserEmail, userRoles, onActiveReservationChange, licenseBlocked = false }: ReservationBlockProps) {
    const [reservations, setReservations] = useState<Reservation[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingReservation, setEditingReservation] = useState<Reservation | null>(null);
    const [validating, setValidating] = useState<string | null>(null);

    // Form fields (Create)
    const [startDate, setStartDate] = useState('');
    const [startTime, setStartTime] = useState('');
    const [endDate, setEndDate] = useState('');
    const [endTime, setEndTime] = useState('');
    const [reason, setReason] = useState('');
    const [driverSelection, setDriverSelection] = useState(''); // '' = self, 'UNASSIGNED' = Chauffeur non décidé, or userId
    const [submitting, setSubmitting] = useState(false);

    // Form fields (Edit)
    const [editStartDate, setEditStartDate] = useState('');
    const [editStartTime, setEditStartTime] = useState('');
    const [editEndDate, setEditEndDate] = useState('');
    const [editEndTime, setEditEndTime] = useState('');
    const [editReason, setEditReason] = useState('');
    const [editDriverSelection, setEditDriverSelection] = useState('');
    const [editingSubmitting, setEditingSubmitting] = useState(false);

    // On-behalf fields (Managers / Admins / Cadres / Présidents)
    const [users, setUsers] = useState<{ id: string; name: string | null; email: string }[]>([]);

    const isAdmin = userRoles.includes('ADMIN');
    const isRespo = userRoles.includes('RESPO');
    const canValidate = isAdmin || isRespo;
    const canManageDriver = canAccessAdminPanel(userRoles) || isRespo;

    const fetchReservations = useCallback(async () => {
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
    }, [vehicleId, currentUserEmail, onActiveReservationChange]);

    useEffect(() => {
        fetchReservations();
    }, [fetchReservations]);

    useEffect(() => {
        if (!canManageDriver) return;
        fetch(`/api/users?vehicleType=${encodeURIComponent(vehicleType)}`)
            .then(res => res.json())
            .then(data => { if (data.users) setUsers(data.users); })
            .catch(console.error);
    }, [canManageDriver, vehicleType]);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const startISO = new Date(`${startDate}T${startTime}`).toISOString();
            const endISO = new Date(`${endDate}T${endTime}`).toISOString();

            const bodyPayload: Record<string, unknown> = {
                startTime: startISO,
                endTime: endISO,
                reason,
            };

            if (canManageDriver) {
                if (driverSelection === 'UNASSIGNED') {
                    bodyPayload.isUnassignedDriver = true;
                } else if (driverSelection) {
                    bodyPayload.onBehalfOfUserId = driverSelection;
                }
            }

            const res = await fetch(`/api/vehicles/${vehicleId}/reservations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyPayload)
            });

            if (res.ok) {
                setShowModal(false);
                setStartDate(''); setStartTime(''); setEndDate(''); setEndTime(''); setReason('');
                setDriverSelection('');
                fetchReservations();
            } else {
                const data = await res.json();
                alert(data.error || 'Erreur lors de la réservation');
            }
        } catch {
            alert('Erreur réseau');
        } finally {
            setSubmitting(false);
        }
    };

    const handleOpenEdit = (res: Reservation) => {
        setEditingReservation(res);
        const start = new Date(res.startTime);
        const end = new Date(res.endTime);

        // Format dates YYYY-MM-DD and times HH:mm in local time
        const pad = (n: number) => String(n).padStart(2, '0');
        setEditStartDate(`${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`);
        setEditStartTime(`${pad(start.getHours())}:${pad(start.getMinutes())}`);
        setEditEndDate(`${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`);
        setEditEndTime(`${pad(end.getHours())}:${pad(end.getMinutes())}`);
        setEditReason(res.reason || '');

        if (res.userName === 'Chauffeur non décidé') {
            setEditDriverSelection('UNASSIGNED');
        } else {
            const match = users.find(u => u.email === res.userEmail);
            setEditDriverSelection(match ? match.id : '');
        }
    };

    const handleEditSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!editingReservation) return;
        setEditingSubmitting(true);
        try {
            const startISO = new Date(`${editStartDate}T${editStartTime}`).toISOString();
            const endISO = new Date(`${editEndDate}T${editEndTime}`).toISOString();

            const bodyPayload: Record<string, unknown> = {
                action: 'update',
                startTime: startISO,
                endTime: endISO,
                reason: editReason,
            };

            if (canManageDriver) {
                if (editDriverSelection === 'UNASSIGNED') {
                    bodyPayload.isUnassignedDriver = true;
                    bodyPayload.onBehalfOfUserId = 'UNASSIGNED';
                } else if (editDriverSelection) {
                    bodyPayload.onBehalfOfUserId = editDriverSelection;
                } else {
                    const selfUser = users.find(u => u.email === currentUserEmail);
                    if (selfUser) {
                        bodyPayload.onBehalfOfUserId = selfUser.id;
                    }
                }
            }

            const res = await fetch(`/api/reservations/${editingReservation.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyPayload)
            });

            if (res.ok) {
                setEditingReservation(null);
                fetchReservations();
            } else {
                const data = await res.json();
                alert(data.error || 'Erreur lors de la modification');
            }
        } catch {
            alert('Erreur réseau');
        } finally {
            setEditingSubmitting(false);
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
        } catch {
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
        } catch {
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
                <button
                    className={`btn btn-secondary ${styles.addBtn}`}
                    onClick={() => {
                        if (!licenseBlocked || isAdmin) {
                            setDriverSelection('');
                            setShowModal(true);
                        }
                    }}
                    disabled={licenseBlocked && !isAdmin}
                    title={licenseBlocked && !isAdmin ? "Vos papiers n'ont pas été validés — réservation bloquée." : undefined}
                >
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
                        const canEdit = canManageDriver || res.userEmail === currentUserEmail;
                        const isPending = res.status === 'PENDING';
                        const isUnassigned = res.userName === 'Chauffeur non décidé';

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
                                        Par {isUnassigned ? (
                                            <span className={styles.badgeUnassigned}>Chauffeur non décidé</span>
                                        ) : (
                                            <strong>{res.userName}</strong>
                                        )}
                                        {res.reason && <span className={styles.itemReason}> - {res.reason}</span>}
                                    </div>
                                </div>
                                <div className={styles.itemActions}>
                                    {canEdit && (
                                        <button
                                            onClick={() => handleOpenEdit(res)}
                                            className={styles.editBtn}
                                            aria-label="Modifier la réservation"
                                            title="Modifier la réservation"
                                        >
                                            ✏️ Modifier
                                        </button>
                                    )}
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

            {/* Modal de création */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)} style={{ zIndex: 1000 }}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
                        <h3>Réserver ce véhicule</h3>
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
                                                value={driverSelection === 'UNASSIGNED' ? '' : driverSelection}
                                                onChange={setDriverSelection}
                                                excludeEmail={currentUserEmail ?? undefined}
                                                defaultLabel={driverSelection === 'UNASSIGNED' ? 'Chauffeur non décidé' : 'Moi-même'}
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            className={`${styles.quickChBtn} ${driverSelection === 'UNASSIGNED' ? styles.quickChBtnActive : ''}`}
                                            onClick={() => setDriverSelection(driverSelection === 'UNASSIGNED' ? '' : 'UNASSIGNED')}
                                            title="Indiquer Chauffeur non décidé"
                                        >
                                            Chauffeur non décidé
                                        </button>
                                    </div>
                                    {driverSelection === 'UNASSIGNED' && (
                                        <p className={styles.pendingNotice} style={{ marginTop: 4 }}>
                                            Cette réservation sera enregistrée sans chauffeur attribué.
                                        </p>
                                    )}
                                </div>
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
                            <div className={styles.formGroup}>
                                <label>Motif / Mission (Optionnel)</label>
                                <input type="text" value={reason} onChange={e => setReason(e.target.value)} className="form-input" placeholder="Ex: Réserve pour une maraude" />
                            </div>
                            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={submitting}>
                                    {submitting ? '...' : canValidate ? 'Valider' : 'Soumettre la demande'}
                                </button>
                                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => {
                                    setShowModal(false);
                                    setDriverSelection('');
                                }}>
                                    Annuler
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal de modification */}
            {editingReservation && (
                <div className="modal-overlay" onClick={() => setEditingReservation(null)} style={{ zIndex: 1000 }}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
                        <h3>Modifier la réservation</h3>
                        <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
                            {canManageDriver ? (
                                <div className={styles.formGroup}>
                                    <label>Chauffeur</label>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <div style={{ flex: 1 }}>
                                            <UserCombobox
                                                users={users}
                                                value={editDriverSelection === 'UNASSIGNED' ? '' : editDriverSelection}
                                                onChange={setEditDriverSelection}
                                                excludeEmail={currentUserEmail ?? undefined}
                                                defaultLabel={editDriverSelection === 'UNASSIGNED' ? 'Chauffeur non décidé' : 'Chauffeur initial'}
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            className={`${styles.quickChBtn} ${editDriverSelection === 'UNASSIGNED' ? styles.quickChBtnActive : ''}`}
                                            onClick={() => setEditDriverSelection(editDriverSelection === 'UNASSIGNED' ? '' : 'UNASSIGNED')}
                                            title="Indiquer Chauffeur non décidé"
                                        >
                                            Chauffeur non décidé
                                        </button>
                                    </div>
                                    {editDriverSelection === 'UNASSIGNED' && (
                                        <p className={styles.pendingNotice} style={{ marginTop: 4 }}>
                                            Réservation configurée sans chauffeur désigné.
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <div className={styles.formGroup}>
                                    <label>Chauffeur</label>
                                    <div className="form-input" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', cursor: 'not-allowed' }}>
                                        {editingReservation.userName}
                                    </div>
                                </div>
                            )}
                            <div className={styles.formRow}>
                                <div className={styles.formGroup}>
                                    <label>Date de début</label>
                                    <input type="date" required value={editStartDate} onChange={e => setEditStartDate(e.target.value)} className="form-input" />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Heure</label>
                                    <input type="time" required value={editStartTime} onChange={e => setEditStartTime(e.target.value)} className="form-input" />
                                </div>
                            </div>
                            <div className={styles.formRow}>
                                <div className={styles.formGroup}>
                                    <label>Date de fin</label>
                                    <input type="date" required value={editEndDate} onChange={e => setEditEndDate(e.target.value)} className="form-input" min={editStartDate} />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Heure</label>
                                    <input type="time" required value={editEndTime} onChange={e => setEditEndTime(e.target.value)} className="form-input" />
                                </div>
                            </div>
                            <div className={styles.formGroup}>
                                <label>Motif / Mission (Optionnel)</label>
                                <input type="text" value={editReason} onChange={e => setEditReason(e.target.value)} className="form-input" placeholder="Ex: Réserve pour une maraude" />
                            </div>
                            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={editingSubmitting}>
                                    {editingSubmitting ? '...' : 'Enregistrer les modifications'}
                                </button>
                                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setEditingReservation(null)}>
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


