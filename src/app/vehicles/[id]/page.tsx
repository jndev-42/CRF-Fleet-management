'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { RenaultVehicleData } from '@/lib/renault';

interface Trip {
    id: string;
    driverName: string;
    driverEmail: string | null;
    missionType: string;
    missionName: string | null;
    checkOutAt: string;
    checkInAt: string | null;
    mileageOut: number;
    mileageIn: number | null;
    fuelOut: number;
    fuelIn: number | null;
    parkingOut: string | null;
    parkingIn: string | null;
    conditionOut: string;
    conditionIn: string | null;
    dsaChecked: boolean;
    dsaUsed: boolean | null;
    commentsOut: string | null;
    commentsIn: string | null;
    windowsClosed: boolean | null;
    vehicleInspected: boolean | null;
    incident: string | null;
    parkingPhoto: string | null;
}

interface Vehicle {
    id: string;
    name: string;
    type: string;
    plate: string;
    status: string;
    parkingSpot: string | null;
    fuelLevel: number;
    mileage: number;
    hasDSA: boolean;
    notes: string | null;
    trips: Trip[];
}

const statusLabels: Record<string, string> = {
    AVAILABLE: 'Disponible',
    IN_USE: 'En mission',
    MAINTENANCE: 'Maintenance',
};

const statusClass: Record<string, string> = {
    AVAILABLE: 'available',
    IN_USE: 'inuse',
    MAINTENANCE: 'maintenance',
};

function getFuelClass(level: number) {
    if (level >= 50) return 'full';
    if (level >= 25) return 'mid';
    return 'low';
}

function isElectric(vehicleName: string) {
    return vehicleName.toUpperCase().includes('VL186');
}

function isDiesel(vehicleName: string) {
    return vehicleName.toUpperCase().includes('182');
}

function isConnected(vehicleName: string) {
    const upper = vehicleName.toUpperCase();
    return upper.includes('VL186') || upper.includes('VL188');
}

function formatDate(d: string) {
    return new Date(d).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export default function VehicleDetailPage() {
    const params = useParams();
    const id = params.id as string;
    const [vehicle, setVehicle] = useState<Vehicle | null>(null);
    const [renaultData, setRenaultData] = useState<RenaultVehicleData | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingRenault, setLoadingRenault] = useState(false);
    const [showCheckOut, setShowCheckOut] = useState(false);
    const [showCheckIn, setShowCheckIn] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: string } | null>(null);
    const [userRole, setUserRole] = useState<'ADMIN' | 'USER' | null>(null);

    useEffect(() => {
        // Fetch session to determine Admin role
        fetch('/api/auth/session')
            .then(res => res.json())
            .then(session => {
                if (session?.user?.role) {
                    setUserRole(session.user.role);
                }
            })
            .catch(console.error);
    }, []);

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

    // Fetch Renault data separately, only once when vehicle name is known
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

    function showToast(message: string, type: string = 'success') {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    }

    async function toggleMaintenance() {
        if (!vehicle) return;
        const newStatus = vehicle.status === 'MAINTENANCE' ? 'AVAILABLE' : 'MAINTENANCE';
        try {
            await fetch(`/api/vehicles/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            });
            fetchVehicle();
            showToast(
                newStatus === 'MAINTENANCE'
                    ? 'Véhicule mis en maintenance'
                    : 'Véhicule remis en service'
            );
        } catch {
            showToast('Erreur', 'error');
        }
    }

    if (loading) {
        return (
            <div className="loading-container">
                <div className="loading-spinner" />
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

    const activeTrip = vehicle.trips.find((t) => !t.checkInAt);

    return (
        <>
            <Link href="/" className="back-link">
                ← Retour au dashboard
            </Link>

            <div className="vehicle-detail-header">
                <div className="vehicle-detail-info">
                    <h1>{vehicle.name}</h1>
                    <div className="vehicle-detail-plate">{vehicle.plate}</div>
                    <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span className="vehicle-type-badge">{vehicle.type}</span>
                        <span className={`status-badge ${statusClass[vehicle.status]}`}>
                            <span className="status-dot" />
                            {statusLabels[vehicle.status]}
                        </span>
                        {vehicle.hasDSA && (
                            <span className="vehicle-type-badge" style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#22C55E' }}>
                                🫀 DSA
                            </span>
                        )}
                        {isElectric(vehicle.name) ? (
                            <span className="vehicle-type-badge" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6' }}>
                                ⚡ Électrique
                            </span>
                        ) : isDiesel(vehicle.name) ? (
                            <span className="vehicle-type-badge" style={{ background: 'rgba(107, 114, 128, 0.1)', color: '#374151' }}>
                                ⛽ Diesel
                            </span>
                        ) : (
                            <span className="vehicle-type-badge" style={{ background: 'rgba(249, 115, 22, 0.1)', color: '#F97316' }}>
                                ⛽ Essence
                            </span>
                        )}
                        {userRole === 'ADMIN' && (
                            <button
                                onClick={async () => {
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
                                style={{
                                    background: 'var(--bg-secondary)',
                                    border: '1px solid var(--border-primary)',
                                    borderRadius: 'var(--radius-sm)',
                                    padding: '4px 8px',
                                    fontSize: 12,
                                    cursor: 'pointer',
                                    fontWeight: 500,
                                    color: 'var(--text-secondary)'
                                }}
                            >
                                {vehicle.hasDSA ? 'Retirer DSA' : 'Ajouter DSA'}
                            </button>
                        )}
                    </div>
                </div>
                <div className="vehicle-detail-actions">
                    {vehicle.status === 'AVAILABLE' && (
                        <button
                            className="btn btn-primary btn-lg"
                            onClick={() => setShowCheckOut(true)}
                        >
                            🚗 Prendre le véhicule
                        </button>
                    )}
                    {vehicle.status === 'IN_USE' && activeTrip && (
                        <button
                            className="btn btn-success btn-lg"
                            onClick={() => setShowCheckIn(true)}
                        >
                            ✅ Rendre le véhicule
                        </button>
                    )}
                    {vehicle.status !== 'IN_USE' && userRole === 'ADMIN' && (
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
                            🧑‍✈️ En mission avec {activeTrip.driverName}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                            Depuis le {formatDate(activeTrip.checkOutAt)}
                            {' — '}{activeTrip.missionType}
                            {activeTrip.missionName && ` : ${activeTrip.missionName}`}
                        </div>
                    </div>
                    <button
                        className="btn btn-success"
                        onClick={() => setShowCheckIn(true)}
                    >
                        ✅ Rendre
                    </button>
                </div>
            )}

            <div className="detail-grid">
                {!isConnected(vehicle.name) && (
                    <div className="detail-card">
                        <div className="detail-card-title">Kilométrage</div>
                        <div className="detail-card-value">
                            {vehicle.mileage.toLocaleString('fr-FR')} km
                        </div>
                    </div>
                )}
                {!isConnected(vehicle.name) && (
                    <div className="detail-card">
                        <div className="detail-card-title">{isElectric(vehicle.name) ? 'Batterie' : (isDiesel(vehicle.name) ? 'Diesel' : 'Essence')}</div>
                        <div className="detail-card-value">{vehicle.fuelLevel}%</div>
                        <div className="fuel-bar" style={{ marginTop: 8 }}>
                            <div
                                className={`fuel-bar-fill ${getFuelClass(vehicle.fuelLevel)}`}
                                style={{ width: `${vehicle.fuelLevel}%` }}
                            />
                        </div>
                    </div>
                )}
                <div className="detail-card">
                    <div className="detail-card-title">Stationnement</div>
                    <div className="detail-card-value">
                        {vehicle.parkingSpot || '—'}
                    </div>
                </div>
                <div className="detail-card">
                    <div className="detail-card-title">Nombre de sorties</div>
                    <div className="detail-card-value">{vehicle.trips.length}</div>
                </div>
            </div>

            {/* Renault Connect Section */}
            {(renaultData || loadingRenault) && (
                <div style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <h2 className="section-title" style={{ margin: 0 }}>Renault Connect</h2>
                        {loadingRenault && <div className="loading-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />}
                        {!loadingRenault && renaultData && (
                            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                Actualisé le {formatDate(renaultData.batteryTimestamp || renaultData.cockpitTimestamp || new Date().toISOString())}
                            </span>
                        )}
                    </div>

                    {!loadingRenault && renaultData && (
                        <div className="detail-grid">
                            {(renaultData.totalMileage !== null) && (
                                <div className="detail-card" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
                                    <div className="detail-card-title">Kilométrage (réel)</div>
                                    <div className="detail-card-value">{renaultData.totalMileage.toLocaleString('fr-FR')} km</div>
                                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                                        Remonte par la télématique
                                    </div>
                                </div>
                            )}

                            {renaultData.isElectric ? (
                                <>
                                    <div className="detail-card" style={{ background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                                        <div className="detail-card-title" style={{ color: '#2563EB' }}>Batterie (réelle)</div>
                                        <div className="detail-card-value">{renaultData.batteryLevel}%</div>
                                        <div className="fuel-bar" style={{ marginTop: 8 }}>
                                            <div
                                                className={`fuel-bar-fill ${getFuelClass(renaultData.batteryLevel || 0)}`}
                                                style={{ width: `${renaultData.batteryLevel}%` }}
                                            />
                                        </div>
                                    </div>
                                    <div className="detail-card" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
                                        <div className="detail-card-title">Autonomie estimée</div>
                                        <div className="detail-card-value">{renaultData.batteryAutonomy} km</div>
                                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                                            Liée à la charge actuelle
                                        </div>
                                    </div>
                                    <div className="detail-card" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
                                        <div className="detail-card-title">État de charge</div>
                                        <div className="detail-card-value" style={{ fontSize: 16, marginTop: 4 }}>
                                            {renaultData.plugStatus === 1 ? '🔌 Branché' : '⚡ Non branché'}
                                            {renaultData.chargingStatus === 1 && ' (En charge)'}
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="detail-card" style={{ background: 'rgba(249, 115, 22, 0.05)', border: '1px solid rgba(249, 115, 22, 0.2)' }}>
                                        <div className="detail-card-title" style={{ color: '#EA580C' }}>Carburant estimé</div>
                                        <div className="detail-card-value">{renaultData.fuelQuantity} L</div>
                                    </div>
                                    <div className="detail-card" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
                                        <div className="detail-card-title">Autonomie estimée</div>
                                        <div className="detail-card-value">{renaultData.fuelAutonomy} km</div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}

            {vehicle.notes && (
                <div className="detail-card" style={{ marginBottom: 24 }}>
                    <div className="detail-card-title">Notes</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                        {vehicle.notes}
                    </div>
                </div>
            )}

            <div className="section-header">
                <h2 className="section-title">Historique des sorties</h2>
            </div>

            {vehicle.trips.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon">📋</div>
                    <div className="empty-state-title">Aucune sortie enregistrée</div>
                </div>
            ) : (
                <div className="trip-list">
                    {vehicle.trips.map((trip) => (
                        <div
                            key={trip.id}
                            className={`trip-item ${!trip.checkInAt ? 'active' : ''}`}
                        >
                            <div className="trip-header">
                                <div>
                                    <span className="trip-driver">🧑‍✈️ {trip.driverName}</span>
                                    <span style={{ marginLeft: 12, fontSize: 13, color: 'var(--text-secondary)' }}>
                                        {trip.missionType}{trip.missionName ? ` — ${trip.missionName}` : ''}
                                    </span>
                                </div>
                                <span className={`status-badge ${trip.checkInAt ? 'available' : 'inuse'}`}>
                                    {trip.checkInAt ? 'Terminé' : 'En cours'}
                                </span>
                            </div>
                            <div className="trip-details">
                                <div className="trip-detail-item">
                                    <span className="trip-detail-label">Départ</span>
                                    <span className="trip-detail-value">{formatDate(trip.checkOutAt)}</span>
                                </div>
                                <div className="trip-detail-item">
                                    <span className="trip-detail-label">Retour</span>
                                    <span className="trip-detail-value">
                                        {trip.checkInAt ? formatDate(trip.checkInAt) : '—'}
                                    </span>
                                </div>
                                <div className="trip-detail-item">
                                    <span className="trip-detail-label">Km départ</span>
                                    <span className="trip-detail-value">
                                        {trip.mileageOut.toLocaleString('fr-FR')} km
                                    </span>
                                </div>
                                <div className="trip-detail-item">
                                    <span className="trip-detail-label">Km retour</span>
                                    <span className="trip-detail-value">
                                        {trip.mileageIn
                                            ? `${trip.mileageIn.toLocaleString('fr-FR')} km`
                                            : '—'}
                                    </span>
                                </div>
                                <div className="trip-detail-item">
                                    <span className="trip-detail-label">{isElectric(vehicle.name) ? 'Batterie' : (isDiesel(vehicle.name) ? 'Diesel' : 'Essence')} départ</span>
                                    <span className="trip-detail-value">{trip.fuelOut}%</span>
                                </div>
                                <div className="trip-detail-item">
                                    <span className="trip-detail-label">{isElectric(vehicle.name) ? 'Batterie' : (isDiesel(vehicle.name) ? 'Diesel' : 'Essence')} retour</span>
                                    <span className="trip-detail-value">
                                        {trip.fuelIn !== null ? `${trip.fuelIn}%` : '—'}
                                    </span>
                                </div>
                                <div className="trip-detail-item">
                                    <span className="trip-detail-label">État départ</span>
                                    <span className="trip-detail-value">{trip.conditionOut}</span>
                                </div>
                                <div className="trip-detail-item">
                                    <span className="trip-detail-label">État retour</span>
                                    <span className="trip-detail-value">
                                        {trip.conditionIn || '—'}
                                    </span>
                                </div>
                            </div>

                            {/* Extra info row */}
                            <div className="trip-details" style={{ marginTop: 8 }}>
                                {trip.dsaChecked && (
                                    <div className="trip-detail-item">
                                        <span className="trip-detail-label">DSA vérifié</span>
                                        <span className="trip-detail-value">✅ Oui</span>
                                    </div>
                                )}
                                {trip.dsaUsed && (
                                    <div className="trip-detail-item">
                                        <span className="trip-detail-label">DSA utilisé</span>
                                        <span className="trip-detail-value">⚠️ Oui</span>
                                    </div>
                                )}
                                {trip.windowsClosed !== null && (
                                    <div className="trip-detail-item">
                                        <span className="trip-detail-label">Vitres / Radios</span>
                                        <span className="trip-detail-value">{trip.windowsClosed ? '✅ Fermées' : '❌ Non'}</span>
                                    </div>
                                )}
                                {trip.vehicleInspected !== null && (
                                    <div className="trip-detail-item">
                                        <span className="trip-detail-label">Tour véhicule</span>
                                        <span className="trip-detail-value">{trip.vehicleInspected ? '✅ Effectué' : '❌ Non'}</span>
                                    </div>
                                )}
                            </div>

                            {trip.incident && (
                                <div
                                    style={{
                                        marginTop: 12,
                                        padding: '10px 14px',
                                        background: 'var(--status-maintenance-bg)',
                                        borderRadius: 'var(--radius-sm)',
                                        border: '1px solid rgba(239, 68, 68, 0.3)',
                                        fontSize: 13,
                                        color: 'var(--status-maintenance)',
                                    }}
                                >
                                    ⚠️ <strong>Incident :</strong> {trip.incident}
                                </div>
                            )}

                            {(trip.commentsOut || trip.commentsIn) && (
                                <div
                                    style={{
                                        marginTop: 12,
                                        paddingTop: 12,
                                        borderTop: '1px solid var(--border-primary)',
                                        fontSize: 13,
                                        color: 'var(--text-secondary)',
                                    }}
                                >
                                    {trip.commentsOut && <div>📝 <strong>Avant :</strong> {trip.commentsOut}</div>}
                                    {trip.commentsIn && <div style={{ marginTop: 4 }}>📝 <strong>Après :</strong> {trip.commentsIn}</div>}
                                </div>
                            )}

                            {trip.parkingPhoto && (
                                <div style={{ marginTop: 12 }}>
                                    <img
                                        src={trip.parkingPhoto}
                                        alt="Photo stationnement"
                                        style={{
                                            maxWidth: '100%',
                                            maxHeight: 200,
                                            borderRadius: 'var(--radius-sm)',
                                            border: '1px solid var(--border-primary)',
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
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

            {toast && (
                <div className="toast-container">
                    <div className={`toast ${toast.type}`}>{toast.message}</div>
                </div>
            )}
        </>
    );
}

/* ===== CHECK-OUT MODAL ===== */
function CheckOutModal({
    vehicle,
    onClose,
    onSuccess,
}: {
    vehicle: Vehicle;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const [form, setForm] = useState({
        driverName: '',
        driverEmail: '',
        missionType: 'DPS',
        missionName: '',
        conditionOut: 'Bon état',
        parkingOutSelection: 'Baigneur (devant l’UL)',
        parkingOutCustom: '',
        dsaChecked: false,
        commentsOut: '',
    });
    const [submitting, setSubmitting] = useState(false);
    const [sessionLoading, setSessionLoading] = useState(true);

    useEffect(() => {
        fetch('/api/auth/session')
            .then(res => res.json())
            .then(session => {
                if (session?.user) {
                    setForm(f => ({
                        ...f,
                        driverName: session.user.name || '',
                        driverEmail: session.user.email || '',
                    }));
                }
            })
            .catch(console.error)
            .finally(() => setSessionLoading(false));
    }, []);
    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);
        const finalParkingOut = form.parkingOutSelection === 'Autre'
            ? form.parkingOutCustom
            : form.parkingOutSelection;

        try {
            const res = await fetch('/api/trips', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vehicleId: vehicle.id,
                    ...form,
                    parkingOut: finalParkingOut
                }),
            });
            if (res.ok) {
                onSuccess();
            } else {
                const data = await res.json();
                alert(data.error || 'Erreur');
            }
        } catch {
            alert('Erreur de connexion');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">🚗 Prendre {vehicle.name}</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <div
                            style={{
                                background: 'var(--bg-card)',
                                borderRadius: 'var(--radius-sm)',
                                padding: 12,
                                marginBottom: 20,
                                fontSize: 13,
                                color: 'var(--text-secondary)',
                            }}
                        >
                            <div><strong>Immatriculation :</strong> {vehicle.plate}</div>
                            <div><strong>Kilométrage :</strong> {vehicle.mileage.toLocaleString('fr-FR')} km</div>
                            <div><strong>{isElectric(vehicle.name) ? 'Batterie' : (isDiesel(vehicle.name) ? 'Diesel' : 'Essence')} :</strong> {vehicle.fuelLevel}%</div>
                            {vehicle.hasDSA && <div><strong>DSA :</strong> Équipé</div>}
                        </div>

                        {/* Identité */}
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Votre nom * <span style={{ fontSize: 12, fontWeight: 'normal', color: 'var(--text-secondary)' }}>🔒 Rempli via Google</span></label>
                                <input
                                    className="form-input"
                                    placeholder={sessionLoading ? "Chargement..." : "Prénom NOM"}
                                    value={form.driverName}
                                    readOnly
                                    required
                                    style={{
                                        background: 'var(--bg-card)',
                                        color: 'var(--text-secondary)',
                                        cursor: 'not-allowed'
                                    }}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Email <span style={{ fontSize: 12, fontWeight: 'normal', color: 'var(--text-secondary)' }}>🔒 Rempli via Google</span></label>
                                <input
                                    className="form-input"
                                    type="email"
                                    placeholder={sessionLoading ? "Chargement..." : "pour recevoir le rapport"}
                                    value={form.driverEmail}
                                    readOnly
                                    style={{
                                        background: 'var(--bg-card)',
                                        color: 'var(--text-secondary)',
                                        cursor: 'not-allowed'
                                    }}
                                />
                            </div>
                        </div>

                        {/* Mission */}
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Type de mission *</label>
                                <select
                                    className="form-select"
                                    value={form.missionType}
                                    onChange={(e) => setForm({ ...form, missionType: e.target.value })}
                                >
                                    <option value="DPS">DPS</option>
                                    <option value="PAPS">PAPS</option>
                                    <option value="Réseaux">Réseaux</option>
                                    <option value="Logistique">Logistique</option>
                                    <option value="Maraude">Maraude</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Nom de la mission</label>
                                <input
                                    className="form-input"
                                    placeholder="si applicable"
                                    value={form.missionName}
                                    onChange={(e) => setForm({ ...form, missionName: e.target.value })}
                                />
                            </div>
                        </div>

                        {/* État véhicule */}
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">État du véhicule *</label>
                                <select
                                    className="form-select"
                                    value={form.conditionOut}
                                    onChange={(e) => setForm({ ...form, conditionOut: e.target.value })}
                                >
                                    <option value="Bon état">✅ Bon état</option>
                                    <option value="Correct">👍 Correct</option>
                                    <option value="Dégradé">⚠️ Dégradé</option>
                                    <option value="Problème signalé">❌ Problème à signaler</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Place de stationnement</label>
                                <select
                                    className="form-select"
                                    value={form.parkingOutSelection}
                                    onChange={(e) => setForm({ ...form, parkingOutSelection: e.target.value })}
                                >
                                    <option value="Baigneur (devant l’UL)">Baigneur (devant l’UL)</option>
                                    <option value="Parking Aubervillers">Parking Aubervillers</option>
                                    <option value="Autre">Autre</option>
                                </select>
                                {form.parkingOutSelection === 'Autre' && (
                                    <input
                                        style={{ marginTop: 8 }}
                                        className="form-input"
                                        placeholder="Précisez la place..."
                                        value={form.parkingOutCustom}
                                        onChange={(e) => setForm({ ...form, parkingOutCustom: e.target.value })}
                                        required
                                    />
                                )}
                            </div>
                        </div>

                        {/* DSA */}
                        {vehicle.hasDSA && (
                            <div className="form-group">
                                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 14px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)' }}>
                                    <input
                                        type="checkbox"
                                        checked={form.dsaChecked}
                                        onChange={(e) => setForm({ ...form, dsaChecked: e.target.checked })}
                                        style={{ width: 18, height: 18, accentColor: 'var(--crf-red)' }}
                                    />
                                    <span style={{ fontSize: 14, fontWeight: 500 }}>🫀 J&apos;ai vérifié le DSA du véhicule</span>
                                </label>
                            </div>
                        )}

                        {/* Commentaires */}
                        <div className="form-group">
                            <label className="form-label">Commentaires avant le poste</label>
                            <textarea
                                className="form-textarea"
                                placeholder="Remarques sur le véhicule..."
                                value={form.commentsOut}
                                onChange={(e) => setForm({ ...form, commentsOut: e.target.value })}
                            />
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Annuler
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? 'En cours...' : '🚗 Prendre le véhicule'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

/* ===== CHECK-IN MODAL ===== */
function CheckInModal({
    vehicle,
    trip,
    onClose,
    onSuccess,
}: {
    vehicle: Vehicle;
    trip: Trip;
    onClose: () => void;
    onSuccess: () => void;
}) {
    const [form, setForm] = useState({
        mileageIn: vehicle.mileage,
        fuelIn: vehicle.fuelLevel,
        parkingInSelection: 'Baigneur (devant l’UL)',
        parkingInCustom: '',
        conditionIn: 'Bon état',
        windowsClosed: false,
        vehicleInspected: false,
        incident: '',
        dsaUsed: false,
        commentsIn: '',
        parkingPhoto: '',
    });
    const [submitting, setSubmitting] = useState(false);

    function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        // We accept up to 10MB now, because we will compress it down anyway
        if (file.size > 10 * 1024 * 1024) {
            alert('La photo ne doit pas dépasser 10 Mo');
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            const img = new Image();
            img.src = reader.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Max dimensions to keep the image size < 1MB
                const MAX_SIZE = 1080;
                if (width > height) {
                    if (width > MAX_SIZE) {
                        height *= MAX_SIZE / width;
                        width = MAX_SIZE;
                    }
                } else {
                    if (height > MAX_SIZE) {
                        width *= MAX_SIZE / height;
                        height = MAX_SIZE;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(img, 0, 0, width, height);
                    // Export as compressed JPEG (70% quality)
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                    setForm({ ...form, parkingPhoto: dataUrl });
                } else {
                    // Fallback to uncompressed if canvas fails
                    setForm({ ...form, parkingPhoto: reader.result as string });
                }
            };
        };
        reader.readAsDataURL(file);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);
        try {
            const finalParkingIn = form.parkingInSelection === 'Autre'
                ? form.parkingInCustom
                : form.parkingInSelection;

            const payload = { ...form, parkingIn: finalParkingIn };

            // Remove manual metrics if connected, otherwise parse them
            if (isConnected(vehicle.name)) {
                delete (payload as any).mileageIn;
                delete (payload as any).fuelIn;
            } else {
                payload.mileageIn = Number(form.mileageIn);
                payload.fuelIn = Number(form.fuelIn);
            }

            const res = await fetch(`/api/trips/${trip.id}/checkin`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                onSuccess();
            } else {
                const data = await res.json();
                alert(data.error || 'Erreur');
            }
        } catch {
            alert('Erreur de connexion');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">✅ Rendre {vehicle.name}</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <div
                            style={{
                                background: 'var(--bg-card)',
                                borderRadius: 'var(--radius-sm)',
                                padding: 12,
                                marginBottom: 20,
                                fontSize: 13,
                                color: 'var(--text-secondary)',
                            }}
                        >
                            <div><strong>Chauffeur :</strong> {trip.driverName}</div>
                            <div><strong>Mission :</strong> {trip.missionType}{trip.missionName ? ` — ${trip.missionName}` : ''}</div>
                            <div><strong>Départ :</strong> {formatDate(trip.checkOutAt)}</div>
                            <div><strong>Km au départ :</strong> {trip.mileageOut.toLocaleString('fr-FR')} km</div>
                        </div>

                        {/* Km et parking */}
                        <div className="form-row">
                            {!isConnected(vehicle.name) && (
                                <div className="form-group">
                                    <label className="form-label">Kilométrage actuel *</label>
                                    <input
                                        className="form-input"
                                        type="number"
                                        min={trip.mileageOut}
                                        value={form.mileageIn}
                                        onChange={(e) => setForm({ ...form, mileageIn: Number(e.target.value) })}
                                        required
                                    />
                                    <div className="form-hint">
                                        Min: {trip.mileageOut.toLocaleString('fr-FR')} km
                                    </div>
                                </div>
                            )}
                            <div className="form-group">
                                <label className="form-label">Place de stationnement</label>
                                <select
                                    className="form-select"
                                    value={form.parkingInSelection}
                                    onChange={(e) => setForm({ ...form, parkingInSelection: e.target.value })}
                                >
                                    <option value="Baigneur (devant l’UL)">Baigneur (devant l’UL)</option>
                                    <option value="Parking Aubervillers">Parking Aubervillers</option>
                                    <option value="Autre">Autre</option>
                                </select>
                                {form.parkingInSelection === 'Autre' && (
                                    <input
                                        style={{ marginTop: 8 }}
                                        className="form-input"
                                        placeholder="Précisez la place..."
                                        value={form.parkingInCustom}
                                        onChange={(e) => setForm({ ...form, parkingInCustom: e.target.value })}
                                        required
                                    />
                                )}
                            </div>
                        </div>

                        {/* Essence */}
                        {!isConnected(vehicle.name) && (
                            <div className="form-group">
                                <label className="form-label">{isElectric(vehicle.name) ? 'Batterie' : 'Essence'} ({form.fuelIn}%)</label>
                                <input
                                    type="range"
                                    className="fuel-slider"
                                    min={0}
                                    max={100}
                                    value={form.fuelIn}
                                    onChange={(e) => setForm({ ...form, fuelIn: Number(e.target.value) })}
                                />
                                <div className="fuel-bar" style={{ marginTop: 8 }}>
                                    <div
                                        className={`fuel-bar-fill ${getFuelClass(form.fuelIn)}`}
                                        style={{ width: `${form.fuelIn}%` }}
                                    />
                                </div>
                            </div>
                        )}

                        {isConnected(vehicle.name) && (
                            <div style={{ marginBottom: 20, padding: 12, background: 'rgba(59, 130, 246, 0.05)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(59, 130, 246, 0.2)', fontSize: 13, color: '#1E40AF' }}>
                                ℹ️ <strong>Données connectées :</strong> Le kilométrage et le niveau de {isElectric(vehicle.name) ? 'batterie' : 'carburant'} remontent automatiquement depuis le véhicule. Il n'est pas nécessaire de les saisir.
                            </div>
                        )}

                        {/* État */}
                        <div className="form-group">
                            <label className="form-label">État du véhicule au retour *</label>
                            <select
                                className="form-select"
                                value={form.conditionIn}
                                onChange={(e) => setForm({ ...form, conditionIn: e.target.value })}
                            >
                                <option value="Bon état">✅ Bon état</option>
                                <option value="Correct">👍 Correct</option>
                                <option value="Dégradé">⚠️ Dégradé</option>
                                <option value="Problème signalé">❌ Problème à signaler</option>
                            </select>
                        </div>

                        {/* Checklists */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 14px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)' }}>
                                <input
                                    type="checkbox"
                                    checked={form.windowsClosed}
                                    onChange={(e) => setForm({ ...form, windowsClosed: e.target.checked })}
                                    style={{ width: 18, height: 18, accentColor: 'var(--crf-red)' }}
                                />
                                <span style={{ fontSize: 14, fontWeight: 500 }}>🪟 J&apos;ai fermé les vitres et éteint les radios</span>
                            </label>

                            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 14px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)' }}>
                                <input
                                    type="checkbox"
                                    checked={form.vehicleInspected}
                                    onChange={(e) => setForm({ ...form, vehicleInspected: e.target.checked })}
                                    style={{ width: 18, height: 18, accentColor: 'var(--crf-red)' }}
                                />
                                <span style={{ fontSize: 14, fontWeight: 500 }}>🔍 J&apos;ai effectué un tour du véhicule</span>
                            </label>

                            {vehicle.hasDSA && (
                                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 14px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)' }}>
                                    <input
                                        type="checkbox"
                                        checked={form.dsaUsed}
                                        onChange={(e) => setForm({ ...form, dsaUsed: e.target.checked })}
                                        style={{ width: 18, height: 18, accentColor: 'var(--status-inuse)' }}
                                    />
                                    <span style={{ fontSize: 14, fontWeight: 500 }}>🫀 J&apos;ai utilisé le DSA du véhicule</span>
                                </label>
                            )}
                        </div>

                        {/* Incident */}
                        <div className="form-group">
                            <label className="form-label">Incident sur véhicule</label>
                            <textarea
                                className="form-textarea"
                                placeholder="Décrire l'incident si applicable..."
                                value={form.incident}
                                onChange={(e) => setForm({ ...form, incident: e.target.value })}
                                style={{ minHeight: 60 }}
                            />
                        </div>

                        {/* Commentaires */}
                        <div className="form-group">
                            <label className="form-label">Commentaires après le poste</label>
                            <textarea
                                className="form-textarea"
                                placeholder="Remarques sur le véhicule..."
                                value={form.commentsIn}
                                onChange={(e) => setForm({ ...form, commentsIn: e.target.value })}
                                style={{ minHeight: 60 }}
                            />
                        </div>

                        {/* Photo */}
                        <div className="form-group">
                            <label className="form-label">📸 Photo du véhicule (stationnement)</label>
                            <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={handlePhotoChange}
                                style={{
                                    width: '100%',
                                    padding: '10px 14px',
                                    background: 'var(--bg-input)',
                                    border: '1px solid var(--border-primary)',
                                    borderRadius: 'var(--radius-sm)',
                                    color: 'var(--text-primary)',
                                    fontSize: 14,
                                }}
                            />
                            <div className="form-hint">Max 5 Mo — photo montrant le stationnement du véhicule</div>
                            {form.parkingPhoto && (
                                <img
                                    src={form.parkingPhoto}
                                    alt="Aperçu"
                                    style={{
                                        marginTop: 8,
                                        maxWidth: '100%',
                                        maxHeight: 150,
                                        borderRadius: 'var(--radius-sm)',
                                        border: '1px solid var(--border-primary)',
                                    }}
                                />
                            )}
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Annuler
                        </button>
                        <button type="submit" className="btn btn-success" disabled={submitting}>
                            {submitting ? 'En cours...' : '✅ Rendre le véhicule'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
