'use client';

import { QrCode } from 'lucide-react';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { RenaultVehicleData } from '@/lib/renault';
import PhotoViewer from '@/components/PhotoViewer';

import { Vehicle, Trip } from './types';
import { formatDate, isConnected, getFuelClass, statusClass, statusLabels } from './utils';
import VehicleBadges from '@/components/vehicle/VehicleBadges';
import DetailCard from '@/components/vehicle/DetailCard';
import RenaultConnectBlock from '@/components/vehicle/RenaultConnectBlock';
import VehicleNotes from '@/components/vehicle/VehicleNotes';
import TripItem from '@/components/vehicle/TripItem';
import CheckOutModal from '@/components/vehicle/modals/CheckOutModal';
import CheckInModal from '@/components/vehicle/modals/CheckInModal';
import DeleteConfirmationModal from '@/components/vehicle/modals/DeleteConfirmationModal';
import QRCodeModal from '@/components/vehicle/modals/QRCodeModal';
import ReservationBlock from '@/components/vehicle/ReservationBlock';
import { VehicleDetailSkeleton } from '@/components/ui/VehicleDetailSkeleton';
/**
 * VehicleDetailPage Component
 * 
 * Main page for viewing a single vehicle's full details. 
 * This component handles data fetching for the vehicle entity itself, its trips,
 * and external data (e.g., Renault Connect telemetry).
 * 
 * It manages several distinct modal states (checkout, check-in, deletion) and renders
 * smaller sub-components (VehicleBadges, DetailCard, RenaultConnectBlock, VehicleNotes, TripItem)
 * to keep the UI modular and maintainable.
 */
export default function VehicleDetailPage() {
    const params = useParams();
    const id = params.id as string;
    const [vehicle, setVehicle] = useState<Vehicle | null>(null);
    const [renaultData, setRenaultData] = useState<RenaultVehicleData | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingRenault, setLoadingRenault] = useState(false);
    const [showCheckOut, setShowCheckOut] = useState(false);
    const [showCheckIn, setShowCheckIn] = useState(false);
    const [showQRModal, setShowQRModal] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: string } | null>(null);
    const [userRoles, setUserRoles] = useState<string[]>([]);
    const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [viewingPhotosFolderId, setViewingPhotosFolderId] = useState<string | null>(null);
    const [users, setUsers] = useState<{ name: string, email: string }[]>([]);
    const [showAddSecondDriver, setShowAddSecondDriver] = useState(false);
    const [secondDriverEmail, setSecondDriverEmail] = useState('');
    const [submittingSecondDriver, setSubmittingSecondDriver] = useState(false);
    const router = useRouter();

    useEffect(() => {
        // Fetch the current session to determine if the user has specific roles (e.g., ADMIN)
        fetch('/api/auth/session')
            .then(res => res.json())
            .then(session => {
                if (session?.user?.roles) {
                    setUserRoles(session.user.roles);
                }
                if (session?.user?.email) {
                    setCurrentUserEmail(session.user.email);
                }
            })
            .catch(console.error);

        // Fetch user list so that it can be used for assigning the second driver dropdown
        fetch('/api/users')
            .then(res => res.json())
            .then(data => {
                if (data.users) setUsers(data.users);
            })
            .catch(console.error);
    }, []);

    /**
     * Fetches the detailed vehicle data from the database.
     * Re-runs whenever the page is refreshed or immediately after modifying a trip.
     */
    const fetchVehicle = useCallback(async () => {
        try {
            const res = await fetch(`/api/vehicles/${id}`);
            const data = await res.json();
            setVehicle(data);
        } catch (error) {
            console.error('Erreur:', error);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchVehicle();
    }, [fetchVehicle]);

    /**
     * Reusable toast notification triggered from child components or modal callbacks
     */
    function showToast(message: string, type: string = 'success') {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    }

    /**
     * Add a second driver dynamically to the currently active checkout trip
     */
    async function handleAddSecondDriver(e: React.FormEvent) {
        e.preventDefault();
        if (!activeTrip || !secondDriverEmail) return;

        setSubmittingSecondDriver(true);
        let secondDriverName = '';
        const match = users.find(u => u.email === secondDriverEmail);
        secondDriverName = match?.name || secondDriverEmail;

        try {
            const res = await fetch(`/api/trips/${activeTrip.id}/second-driver`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ secondDriverName, secondDriverEmail }),
            });

            if (res.ok) {
                setShowAddSecondDriver(false);
                setSecondDriverEmail('');
                fetchVehicle();
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

    // Fetch Renault Connect telemetry specifically for VL186/VL188 models
    // Triggered once the base vehicle data has loaded and we know it's connected
    useEffect(() => {
        if (vehicle?.name && (vehicle.name.includes('VL186') || vehicle.name.includes('VL188')) && !renaultData) {
            setLoadingRenault(true);
            fetch(`/api/renault/${encodeURIComponent(vehicle.name)}`)
                .then(r => r.json())
                .then(rData => {
                    if (!rData.error) setRenaultData(rData);
                })
                .catch(e => console.error('Failed to get Renault data:', e))
                .finally(() => setLoadingRenault(false));
        }
    }, [vehicle?.name, renaultData]);



    /**
     * Admin capability to toggle vehicle maintenance mode, preventing regular usage.
     * Uses Optimistic UI for immediate feedback.
     */
    async function toggleMaintenance() {
        if (!vehicle) return;

        const previousStatus = vehicle.status;
        const newStatus = previousStatus === 'MAINTENANCE' ? 'AVAILABLE' : 'MAINTENANCE';

        // Optimistic update
        setVehicle({ ...vehicle, status: newStatus });

        try {
            const res = await fetch(`/api/vehicles/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            });

            if (!res.ok) throw new Error('Failed to update status');

            showToast(
                newStatus === 'MAINTENANCE'
                    ? 'Véhicule mis en maintenance'
                    : 'Véhicule remis en service'
            );
        } catch {
            // Revert on failure
            setVehicle({ ...vehicle, status: previousStatus });
            showToast('Erreur', 'error');
        }
    }



    if (loading) {
        return (
            <div style={{ padding: '24px 0' }}>
                <VehicleDetailSkeleton />
            </div>
        );
    }

    if (!vehicle) {
        return (
            <div className="empty-state">
                <div className="empty-state-icon">❌</div>
                <div className="empty-state-title">Véhicule non trouvé</div>
                <Link href="/" className="btn btn-primary" style={{ marginTop: 16 }}>
                    Retour au dashboard
                </Link>
            </div>
        );
    }

    // Determine whether there's an active (un-checked-in) trip to render Check-In UI
    const activeTrip = vehicle.trips.find((t) => !t.checkInAt);
    const canCheckIn = activeTrip ? (
        userRoles.includes('ADMIN') ||
        activeTrip.driverEmail === currentUserEmail ||
        activeTrip.secondDriverEmail === currentUserEmail
    ) : false;

    return (
        <>
            <Link href="/" className="back-link">
                ← Retour au dashboard
            </Link>

            <div className="vehicle-detail-header">
                <div className="vehicle-detail-info">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <h1 style={{ margin: 0 }}>{vehicle.name}</h1>
                        <button
                            onClick={() => setShowQRModal(true)}
                            title="Générer un QR Code pour cette page"
                            style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '6px',
                                display: 'flex',
                                alignItems: 'center',
                                color: 'var(--text-secondary)',
                                borderRadius: 'var(--radius-md)',
                                transition: 'all 0.2s'
                            }}
                            onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                            onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                        >
                            <QrCode size={20} />
                        </button>
                    </div>
                    <div className="vehicle-detail-plate" style={{ marginTop: '8px' }}>{vehicle.plate}</div>
                    <VehicleBadges
                        vehicle={vehicle}
                        userRoles={userRoles}
                        onToggleDSA={async () => {
                            try {
                                await fetch(`/api/vehicles/${id}`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ hasDSA: !vehicle.hasDSA })
                                });
                                fetchVehicle();
                                showToast(`DSA ${!vehicle.hasDSA ? 'activé' : 'désactivé'}`);
                            } catch (e) {
                                showToast('Erreur lors de la modification du DSA', 'error');
                            }
                        }}
                        onDelete={() => setShowDeleteModal(true)}
                    />
                </div>
                <div className="vehicle-detail-actions">
                    {vehicle.status === 'AVAILABLE' && (() => {
                        const isAdmin = userRoles.includes('ADMIN');
                        const isCHVL = userRoles.includes('CHVL');
                        const isCHVPSP = userRoles.includes('CHVPSP');
                        // VPSP vehicle if type contains VPSP
                        const isVPSP = vehicle.type.toUpperCase().includes('VPSP');

                        let canBorrow = false;
                        if (isAdmin) canBorrow = true;
                        else if (isCHVPSP) canBorrow = true; // Can borrow both VL and VPSP
                        else if (isCHVL && !isVPSP) canBorrow = true; // Can borrow only VL

                        return (
                            <button
                                className={`btn btn-primary btn-lg ${!canBorrow ? 'disabled' : ''}`}
                                onClick={() => { if (canBorrow) setShowCheckOut(true); }}
                                disabled={!canBorrow}
                                title={!canBorrow ? "Vous n'avez pas les droits pour emprunter ce véhicule" : ""}
                            >
                                🚗 Prendre le véhicule
                            </button>
                        );
                    })()}
                    {vehicle.status === 'IN_USE' && activeTrip && (
                        <button
                            className={`btn btn-success btn-lg ${!canCheckIn ? 'disabled' : ''}`}
                            onClick={() => { if (canCheckIn) setShowCheckIn(true); }}
                            disabled={!canCheckIn}
                            title={!canCheckIn ? "Seul l'emprunteur ou un admin peut rendre ce véhicule" : ""}
                        >
                            ✅ Rendre le véhicule
                        </button>
                    )}
                    {vehicle.status !== 'IN_USE' && userRoles.includes('ADMIN') && (
                        <button
                            className="btn btn-secondary"
                            onClick={toggleMaintenance}
                        >
                            {vehicle.status === 'MAINTENANCE' ? '✅ Remettre en service' : '🔧 Maintenance'}
                        </button>
                    )}
                </div>
            </div>

            {activeTrip && (
                <div
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
                    </div>
                    <button
                        className={`btn btn-success ${!canCheckIn ? 'disabled' : ''}`}
                        onClick={() => { if (canCheckIn) setShowCheckIn(true); }}
                        disabled={!canCheckIn}
                        title={!canCheckIn ? "Seul l'emprunteur ou un admin peut rendre ce véhicule" : ""}
                    >
                        ✅ Rendre
                    </button>
                </div>
            )}

            <ReservationBlock
                vehicleId={vehicle.id}
                currentUserEmail={currentUserEmail}
                userRoles={userRoles}
            />

            <div className="detail-grid">
                {!isConnected(vehicle.name) && (
                    <DetailCard
                        title="Kilométrage"
                        value={`${vehicle.mileage.toLocaleString('fr-FR')} km`}
                    />
                )}
                {!isConnected(vehicle.name) && (
                    <DetailCard
                        title={vehicle.fuelType === 'Électrique' ? 'Batterie' : (vehicle.fuelType === 'Diesel' ? 'Diesel' : 'Essence')}
                        value={`${vehicle.fuelLevel}%`}
                    >
                        <div className="fuel-bar" style={{ marginTop: 8 }}>
                            <div
                                className={`fuel-bar-fill ${getFuelClass(vehicle.fuelLevel)}`}
                                style={{ width: `${vehicle.fuelLevel}%` }}
                            />
                        </div>
                    </DetailCard>
                )}
                <DetailCard
                    title="Stationnement"
                    value={vehicle.parkingSpot || '—'}
                />
                <DetailCard
                    title="Nombre de sorties"
                    value={vehicle.trips.length}
                />
            </div>

            {/* Renault Connect Section */}
            <RenaultConnectBlock
                renaultData={renaultData}
                loadingRenault={loadingRenault}
            />

            <VehicleNotes
                vehicle={vehicle}
                userRoles={userRoles}
                onSaveNotes={async (notes: string) => {
                    try {
                        await fetch(`/api/vehicles/${id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ notes }),
                        });
                        setVehicle({ ...vehicle, notes });
                        showToast('Notes mises à jour');
                    } catch {
                        showToast('Erreur lors de la mise à jour des notes', 'error');
                    }
                }}
            />

            <div className="section-header">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <h2 className="section-title" style={{ margin: 0 }}>Historique des sorties</h2>
                    {userRoles.includes('ADMIN') && vehicle.trips.length > 0 && (
                        <button
                            className="btn btn-secondary"
                            style={{ color: '#EF4444', borderColor: 'rgba(239, 68, 68, 0.3)', padding: '4px 10px', fontSize: 13 }}
                            onClick={async () => {
                                if (window.confirm("Voulez-vous vraiment effacer TOUT l'historique de ce véhicule ? Cette action est irréversible.")) {
                                    try {
                                        const res = await fetch(`/api/vehicles/${vehicle.id}/trips`, { method: 'DELETE' });
                                        if (res.ok) {
                                            fetchVehicle();
                                            showToast("L'historique a été vidé avec succès.");
                                        } else {
                                            const body = await res.json();
                                            alert(body.error || "Erreur de suppression");
                                        }
                                    } catch (e) {
                                        alert("Erreur de connexion");
                                    }
                                }
                            }}
                        >
                            🗑️ Vider
                        </button>
                    )}
                </div>
            </div>

            {vehicle.trips.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon">📋</div>
                    <div className="empty-state-title">Aucune sortie enregistrée</div>
                </div>
            ) : (
                <div className="trip-list">
                    {vehicle.trips.map((trip) => (
                        <TripItem
                            key={trip.id}
                            trip={trip}
                            vehicle={vehicle}
                            userRoles={userRoles}
                            onDelete={async (tripId: string) => {
                                if (window.confirm("Voulez-vous vraiment supprimer cette sortie de l'historique ?")) {
                                    try {
                                        const res = await fetch(`/api/trips/${tripId}`, { method: 'DELETE' });
                                        if (res.ok) {
                                            fetchVehicle();
                                        } else {
                                            const body = await res.json();
                                            alert(body.error || "Erreur de suppression");
                                        }
                                    } catch (e) {
                                        alert("Erreur de connexion");
                                    }
                                }
                            }}
                            onViewPhotos={(folderId: string) => setViewingPhotosFolderId(folderId)}
                        />
                    ))}
                </div>
            )}

            {viewingPhotosFolderId && (
                <PhotoViewer
                    driveFolderId={viewingPhotosFolderId}
                    onClose={() => setViewingPhotosFolderId(null)}
                />
            )}

            {showCheckOut && (
                <CheckOutModal
                    vehicle={vehicle}
                    onClose={() => setShowCheckOut(false)}
                    onSuccess={() => {
                        setShowCheckOut(false);
                        fetchVehicle();
                        showToast('Véhicule pris avec succès !');
                    }}
                />
            )}

            {showCheckIn && activeTrip && (
                <CheckInModal
                    vehicle={vehicle}
                    trip={activeTrip}
                    onClose={() => setShowCheckIn(false)}
                    onSuccess={() => {
                        setShowCheckIn(false);
                        fetchVehicle();
                        showToast('Véhicule rendu avec succès !');
                    }}
                />
            )}

            {showQRModal && (
                <QRCodeModal
                    vehicleName={vehicle.name}
                    onClose={() => setShowQRModal(false)}
                />
            )}

            {showDeleteModal && (
                <DeleteConfirmationModal
                    vehicle={vehicle}
                    onClose={() => setShowDeleteModal(false)}
                    onSuccess={() => {
                        router.push('/');
                    }}
                />
            )}

            {toast && (
                <div className="toast-container">
                    <div className={`toast ${toast.type}`}>{toast.message}</div>
                </div>
            )}
        </>
    );
}


