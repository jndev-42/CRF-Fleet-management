import { useState } from 'react';
import { isAdminOrAbove } from '@/lib/roles';
import { formatDate } from './utils';
import type { Trip } from './types';

interface ActiveTripBannerProps {
    activeTrip: Trip;
    userRoles: string[];
    currentUserEmail: string | null;
    users: { id: string; name: string; email: string }[];
    canCheckIn: boolean;
    onShowDesinfPre: () => void;
    onEditCheckOut: (trip: Trip) => void;
    onCheckIn: () => void;
    onSecondDriverAdded: () => void;
    showToast: (message: string, type?: string) => void;
}

export default function ActiveTripBanner({
    activeTrip,
    userRoles,
    currentUserEmail,
    users,
    canCheckIn,
    onShowDesinfPre,
    onEditCheckOut,
    onCheckIn,
    onSecondDriverAdded,
    showToast,
}: ActiveTripBannerProps) {
    const [showAddSecondDriver, setShowAddSecondDriver] = useState(false);
    const [secondDriverEmail, setSecondDriverEmail] = useState('');
    const [submittingSecondDriver, setSubmittingSecondDriver] = useState(false);

    async function handleAddSecondDriver(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!secondDriverEmail) return;

        setSubmittingSecondDriver(true);
        const match = users.find(u => u.email === secondDriverEmail);
        if (!match) {
            alert('Utilisateur introuvable');
            setSubmittingSecondDriver(false);
            return;
        }

        try {
            const res = await fetch(`/api/trips/${activeTrip.id}/second-driver`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ secondDriverId: match.id }),
            });

            if (res.ok) {
                setShowAddSecondDriver(false);
                setSecondDriverEmail('');
                onSecondDriverAdded();
                showToast('2ème conducteur ajouté avec succès !');
            } else {
                const data = await res.json();
                alert(data.error || 'Erreur lors de l\'ajout du 2ème conducteur');
            }
        } catch (error) {
            console.error('Erreur:', error);
            alert('Erreur de connexion');
        } finally {
            setSubmittingSecondDriver(false);
        }
    }

    return (
        <div
            role="status"
            aria-live="polite"
            style={{
                background: 'var(--status-inuse-bg)',
                border: '1px solid var(--status-inuse)',
                borderRadius: 'var(--radius-md)',
                padding: '16px 20px',
                marginBottom: 24,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
            }}
        >
            <div>
                <div style={{ fontWeight: 700, color: 'var(--status-inuse)', marginBottom: 2 }}>
                    🧑‍✈️ En mission avec {activeTrip.driverName} {activeTrip.secondDriverName && ` & ${activeTrip.secondDriverName}`}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    Depuis le {formatDate(activeTrip.checkOutAt)}
                    {' — '}{activeTrip.missionType}
                    {activeTrip.missionName && ` : ${activeTrip.missionName}`}
                </div>

                {activeTrip.missionType === 'Désinfection' && userRoles.includes('ADMIN') && (
                    <div style={{ marginTop: 12 }}>
                        <button
                            className="btn btn-secondary"
                            style={{ fontSize: 13, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 6, borderColor: 'rgba(16, 185, 129, 0.4)', color: '#059669' }}
                            onClick={onShowDesinfPre}
                        >
                            🧴 {activeTrip.desinfResponsable ? '✅ Infos désinf. saisies' : 'Saisir infos désinf.'}
                        </button>
                    </div>
                )}

                {!activeTrip.secondDriverName && (currentUserEmail === activeTrip.driverEmail || userRoles.includes('ADMIN')) && (
                    <div style={{ marginTop: 12 }}>
                        {!showAddSecondDriver ? (
                            <button
                                className="btn btn-secondary"
                                style={{ fontSize: 13, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 6 }}
                                onClick={() => setShowAddSecondDriver(true)}
                            >
                                ➕ Ajouter 2nd cond.
                            </button>
                        ) : (
                            <form onSubmit={handleAddSecondDriver} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                <div>
                                    <input
                                        list="user-list-inline"
                                        className="form-input"
                                        placeholder="Sélectionner un utilisateur..."
                                        value={secondDriverEmail}
                                        onChange={(e) => setSecondDriverEmail(e.target.value)}
                                        style={{ fontSize: 13, padding: '6px 10px', width: '220px' }}
                                        required
                                    />
                                    <datalist id="user-list-inline">
                                        {users.map(u => (
                                            <option key={u.email} value={u.email}>{u.name}</option>
                                        ))}
                                    </datalist>
                                </div>
                                <button type="submit" className="btn btn-primary" style={{ fontSize: 13, padding: '6px 12px' }} disabled={submittingSecondDriver}>
                                    {submittingSecondDriver ? '...' : 'Valider'}
                                </button>
                                <button type="button" className="btn btn-secondary" style={{ fontSize: 13, padding: '6px 12px' }} onClick={() => setShowAddSecondDriver(false)}>
                                    Annuler
                                </button>
                            </form>
                        )}
                    </div>
                )}
                {isAdminOrAbove(userRoles) && (
                    <div style={{ marginTop: 12 }}>
                        <button
                            className="btn btn-secondary"
                            style={{ fontSize: 13, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 6, borderColor: 'rgba(59, 130, 246, 0.4)', color: '#2563EB' }}
                            onClick={() => onEditCheckOut(activeTrip)}
                        >
                            ✏️ Modifier la prise
                        </button>
                    </div>
                )}
            </div>
            <button
                className={`btn btn-success ${!canCheckIn ? 'disabled' : ''}`}
                onClick={() => { if (canCheckIn) onCheckIn(); }}
                disabled={!canCheckIn}
                title={!canCheckIn ? "Seul l'emprunteur ou un admin peut rendre ce véhicule" : ""}
            >
                ✅ Rendre
            </button>
        </div>
    );
}
