'use client';

import { QrCode } from 'lucide-react';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { RenaultVehicleData } from '@/lib/renault';
import PhotoViewer from '@/components/PhotoViewer';

import { Vehicle, MaintenanceRecord } from './types';
import { formatDate } from './utils';
import FuelBar from '@/components/vehicle/FuelBar';
import VehicleBadges from '@/components/vehicle/VehicleBadges';
import DetailCard from '@/components/vehicle/DetailCard';
import VehicleNotes from '@/components/vehicle/VehicleNotes';
import TripItem from '@/components/vehicle/TripItem';
import CheckOutModal from '@/components/vehicle/modals/CheckOutModal';
import CheckInModal from '@/components/vehicle/modals/CheckInModal';
import DeleteConfirmationModal from '@/components/vehicle/modals/DeleteConfirmationModal';
import QRCodeModal from '@/components/vehicle/modals/QRCodeModal';
import ReservationBlock from '@/components/vehicle/ReservationBlock';
import ChecklistManager from '@/components/vehicle/ChecklistManager';
import EditMetricsModal from '@/components/vehicle/modals/EditMetricsModal';
import DesinfHistoryModal from '@/components/vehicle/modals/DesinfHistoryModal';
import DesinfPreCheckinModal from '@/components/vehicle/modals/DesinfPreCheckinModal';
import MaintenanceCard from '@/components/vehicle/MaintenanceCard';
import MaintenanceHistoryModal from '@/components/vehicle/modals/MaintenanceHistoryModal';
import EditRevisionIntervalsModal from '@/components/vehicle/modals/EditRevisionIntervalsModal';
import { VehicleDetailSkeleton } from '@/components/ui/VehicleDetailSkeleton';
import InventoryVehicleTab from '@/components/inventory/InventoryVehicleTab';
import { useModuleSettings } from '@/lib/contexts/ModuleSettingsContext';
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
    const [showChecklistManager, setShowChecklistManager] = useState(false);
    const [showEditMetricsModal, setShowEditMetricsModal] = useState(false);
    const [showDesinfHistoryModal, setShowDesinfHistoryModal] = useState(false);
    const [isReservedByOther, setIsReservedByOther] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: string } | null>(null);
    const [userRoles, setUserRoles] = useState<string[]>([]);
    const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [activeTab, setActiveTab] = useState<'details' | 'inventory'>('details');
    const [viewingPhotosFolderId, setViewingPhotosFolderId] = useState<string | null>(null);
    const [tripsPage, setTripsPage] = useState(1);
    const TRIPS_PER_PAGE = 3;
    const [users, setUsers] = useState<{ id: string, name: string, email: string }[]>([]);
    const [showAddSecondDriver, setShowAddSecondDriver] = useState(false);
    const [secondDriverEmail, setSecondDriverEmail] = useState('');
    const [submittingSecondDriver, setSubmittingSecondDriver] = useState(false);
    const [showDesinfPre, setShowDesinfPre] = useState(false);
    const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>([]);
    const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
    const [maintenanceRefreshKey, setMaintenanceRefreshKey] = useState(0);
    const [showEditRevisionModal, setShowEditRevisionModal] = useState(false);
    const [licenseBlocked, setLicenseBlocked] = useState(false);
    const router = useRouter();
    const { canAccess } = useModuleSettings();

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

        // Check license validity for drivers
        fetch('/api/me/license-check')
            .then(res => res.json())
            .then(data => { if (data.blocked) setLicenseBlocked(true); })
            .catch(console.error);
    }, []);

    const canSeeInventoryTab = canAccess('inventory', userRoles);

    useEffect(() => {
        if (!canSeeInventoryTab && activeTab === 'inventory') setActiveTab('details');
    }, [canSeeInventoryTab, activeTab]);

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

    useEffect(() => {
        if (!vehicle?.type) return;
        fetch(`/api/users?vehicleType=${encodeURIComponent(vehicle.type)}`)
            .then(res => res.json())
            .then(data => { if (data.users) setUsers(data.users); })
            .catch(console.error);
    }, [vehicle?.type]);

    // Fetch all maintenance records for the vehicle (used for CT/revision calculations)
    const fetchAllMaintenanceRecords = useCallback(async () => {
        const allRecords: MaintenanceRecord[] = [];
        const fetchPage = async (p: number): Promise<void> => {
            const res = await fetch(`/api/vehicles/${id}/maintenance?page=${p}`);
            if (!res.ok) return;
            const data = await res.json();
            allRecords.push(...data.records);
            if (p < data.totalPages) {
                await fetchPage(p + 1);
            }
        };
        await fetchPage(1);
        setMaintenanceRecords(allRecords);
    }, [id]);

    useEffect(() => {
        if (!vehicle?.firstRegistrationDate) return;
        fetchAllMaintenanceRecords().catch(console.error);
    }, [fetchAllMaintenanceRecords, vehicle?.firstRegistrationDate, maintenanceRefreshKey]);

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
    async function handleAddSecondDriver(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!activeTrip || !secondDriverEmail) return;

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

    // Fetch Renault Connect telemetry for connected vehicles (those with a VIN)
    useEffect(() => {
        if (vehicle?.vin && !renaultData) {
            setLoadingRenault(true);
            fetch(`/api/renault/${encodeURIComponent(vehicle.vin)}`)
                .then(r => r.json())
                .then(rData => {
                    if (!rData.error) setRenaultData(rData);
                })
                .catch(e => console.error('Failed to get Renault data:', e))
                .finally(() => setLoadingRenault(false));
        }
    }, [vehicle?.vin, renaultData]);

    // Trigger refresh of unvalidated Renault data for completed trips
    useEffect(() => {
        if (!vehicle) return;
        const unvalidatedTrip = vehicle.trips.find(t => t.checkInAt && t.renaultDataValidated === 0);
        if (!unvalidatedTrip) return;

        fetch(`/api/trips/${unvalidatedTrip.id}/refresh-renault`, { method: 'PATCH' })
            .then(r => r.json())
            .then(result => {
                if (result.validated) {
                    fetchVehicle();
                }
            })
            .catch(console.error);
    }, [vehicle, fetchVehicle]);



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
            <Link href="/" className="back-link" aria-label="Retour au tableau de bord">
                ← Retour au dashboard
            </Link>

            <div className="vehicle-detail-header">
                <div className="vehicle-detail-info">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <h1 style={{ margin: 0 }}>{vehicle.name}</h1>
                        <button
                            onClick={() => setShowQRModal(true)}
                            title="Générer un QR Code pour cette page"
                            aria-label="Afficher le QR code du véhicule"
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
                        showAdminDsaToggle={true}
                        onToggleDSA={async () => {
                            const newHasDSA = !vehicle.hasDSA;
                            // Optimistic update
                            setVehicle({ ...vehicle, hasDSA: newHasDSA });
                            try {
                                const res = await fetch(`/api/vehicles/${id}`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ hasDSA: newHasDSA })
                                });
                                if (!res.ok) throw new Error();
                                showToast(`DSA ${newHasDSA ? 'activé' : 'désactivé'}`);
                            } catch {
                                // Rollback on failure
                                setVehicle({ ...vehicle, hasDSA: !newHasDSA });
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

                        if (canBorrow && isReservedByOther && !isAdmin) {
                            canBorrow = false; // Block if there is an active reservation by another user, unless ADMIN
                        }

                        if (canBorrow && licenseBlocked && !isAdmin) {
                            canBorrow = false; // Block if license papers are not validated within grace period
                        }

                        let titleAttr = "";
                        if (!canBorrow) {
                            if (licenseBlocked && !isAdmin) {
                                titleAttr = "Vos papiers n'ont pas été validés — emprunt bloqué.";
                            } else if (isReservedByOther && !isAdmin) {
                                titleAttr = "Ce véhicule est actuellement réservé par quelqu'un d'autre.";
                            } else {
                                titleAttr = "Vous n'avez pas les droits pour emprunter ce véhicule";
                            }
                        }

                        return (
                            <button
                                className={`btn btn-primary btn-lg ${!canBorrow ? 'disabled' : ''}`}
                                onClick={() => { if (canBorrow) setShowCheckOut(true); }}
                                disabled={!canBorrow}
                                title={titleAttr}
                                aria-label={`Prendre le véhicule ${vehicle.name}`}
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
                    {userRoles.includes('ADMIN') && (
                        <button
                            className="btn btn-secondary"
                            onClick={() => setShowChecklistManager(true)}
                        >
                            ⚙️ Gérer la checklist
                        </button>
                    )}
                </div>
            </div>

            {activeTrip && (
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
                                    onClick={() => setShowDesinfPre(true)}
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

            <div className="tab-bar" role="tablist">
                <button
                    role="tab"
                    aria-selected={activeTab === 'details'}
                    className={`tab-btn${activeTab === 'details' ? ' active' : ''}`}
                    onClick={() => setActiveTab('details')}
                >
                    Détails
                </button>
                {canSeeInventoryTab && (
                    <button
                        role="tab"
                        aria-selected={activeTab === 'inventory'}
                        className={`tab-btn${activeTab === 'inventory' ? ' active' : ''}`}
                        onClick={() => setActiveTab('inventory')}
                    >
                        Inventaire
                    </button>
                )}
            </div>

            {activeTab === 'inventory' && canSeeInventoryTab && vehicle && (
                <InventoryVehicleTab vehicleId={vehicle.id} userRoles={userRoles} />
            )}

            {activeTab === 'details' && (
            <>
            {vehicle && (
                <ReservationBlock
                    vehicleId={vehicle.id}
                    vehicleType={vehicle.type}
                    currentUserEmail={currentUserEmail}
                    userRoles={userRoles}
                    onActiveReservationChange={setIsReservedByOther}
                    licenseBlocked={licenseBlocked}
                />
            )}

            <div className="detail-grid">
                <DetailCard
                    title="Kilométrage"
                    value={
                        loadingRenault
                            ? '...'
                            : renaultData?.totalMileage !== null && renaultData?.totalMileage !== undefined
                                ? `${renaultData.totalMileage.toLocaleString('fr-FR')} km`
                                : `${vehicle.mileage.toLocaleString('fr-FR')} km`
                    }
                    onEdit={(!vehicle.vin && (userRoles.includes('ADMIN') || userRoles.includes('RESPO'))) ? () => setShowEditMetricsModal(true) : undefined}
                />
                <DetailCard
                    title={vehicle.fuelType === 'Électrique' ? 'Batterie' : (vehicle.fuelType === 'Diesel' ? 'Diesel' : 'Essence')}
                    value={(() => {
                        if (loadingRenault) return '...';
                        if (vehicle.fuelType === 'Électrique') {
                            return renaultData?.batteryLevel !== null && renaultData?.batteryLevel !== undefined
                                ? `${renaultData.batteryLevel}%`
                                : `${vehicle.fuelLevel}%`;
                        }
                        if (renaultData?.fuelQuantity !== null && renaultData?.fuelQuantity !== undefined) {
                            return `${Math.min(Math.round((renaultData.fuelQuantity / (vehicle.maxFuelCapacity ?? 50)) * 100), 100)}%`;
                        }
                        return `${vehicle.fuelLevel}%`;
                    })()}
                    onEdit={(!vehicle.vin && (userRoles.includes('ADMIN') || userRoles.includes('RESPO'))) ? () => setShowEditMetricsModal(true) : undefined}
                >
                    <FuelBar
                        level={(() => {
                            if (vehicle.fuelType === 'Électrique') {
                                return renaultData?.batteryLevel !== null && renaultData?.batteryLevel !== undefined
                                    ? renaultData.batteryLevel
                                    : vehicle.fuelLevel;
                            }
                            if (renaultData?.fuelQuantity !== null && renaultData?.fuelQuantity !== undefined) {
                                return Math.min(Math.round((renaultData.fuelQuantity / (vehicle.maxFuelCapacity ?? 50)) * 100), 100);
                            }
                            return vehicle.fuelLevel;
                        })()}
                        electric={vehicle.fuelType === 'Électrique'}
                        style={{ marginTop: 8 }}
                    />
                </DetailCard>
                <DetailCard
                    title="Stationnement"
                    value={vehicle.parkingSpot || '—'}
                />
                <DetailCard
                    title="Nombre de sorties"
                    value={vehicle.trips.length}
                />
                {vehicle.firstRegistrationDate && (
                    <MaintenanceCard
                        vehicle={vehicle}
                        records={maintenanceRecords}
                        onClick={() => setShowMaintenanceModal(true)}
                        onEdit={userRoles.includes('ADMIN') ? () => setShowEditRevisionModal(true) : undefined}
                    />
                )}
                {vehicle.type.toUpperCase().includes('VPSP') && (() => {
                    let desinfValue: React.ReactNode = 'Non planifiée';
                    let bgColor: string | undefined;
                    let borderColor: string | undefined;
                    let valueColor: string | undefined;

                    if (vehicle.nextDesinfMaxDate) {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const deadline = new Date(vehicle.nextDesinfMaxDate);
                        deadline.setHours(0, 0, 0, 0);
                        const diffDays = Math.round((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

                        if (diffDays < 0) {
                            desinfValue = `En retard (${Math.abs(diffDays)}j)`;
                            bgColor = 'rgba(239, 68, 68, 0.07)';
                            borderColor = 'rgba(239, 68, 68, 0.4)';
                            valueColor = '#DC2626';
                        } else if (diffDays <= 14) {
                            desinfValue = `dans ${diffDays}j`;
                            bgColor = 'rgba(245, 158, 11, 0.07)';
                            borderColor = 'rgba(245, 158, 11, 0.4)';
                            valueColor = '#D97706';
                        } else {
                            desinfValue = `dans ${diffDays}j`;
                            bgColor = 'rgba(16, 185, 129, 0.07)';
                            borderColor = 'rgba(16, 185, 129, 0.3)';
                            valueColor = '#059669';
                        }
                    } else {
                        desinfValue = 'Non planifiée';
                    }

                    return (
                        <DetailCard
                            title="Prochaine désinf."
                            value={desinfValue}
                            subtitle="Voir l'historique"
                            backgroundColor={bgColor}
                            borderColor={borderColor}
                            valueStyle={valueColor ? { color: valueColor } : undefined}
                            onClick={() => setShowDesinfHistoryModal(true)}
                        />
                    );
                })()}
            </div>

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
                                    } catch {
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
            ) : (() => {
                const totalPages = Math.ceil(vehicle.trips.length / TRIPS_PER_PAGE);
                const visibleTrips = vehicle.trips.slice(
                    (tripsPage - 1) * TRIPS_PER_PAGE,
                    tripsPage * TRIPS_PER_PAGE
                );
                return (
                    <>
                        <ul role="list" aria-label="Historique des sorties" className="trip-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                            {visibleTrips.map((trip) => (
                                <li key={trip.id}>
                                    <TripItem
                                        trip={trip}
                                        vehicle={vehicle}
                                        userRoles={userRoles}
                                        onDelete={async (tripId: string) => {
                                            if (window.confirm("Voulez-vous vraiment supprimer cette sortie de l'historique ?")) {
                                                try {
                                                    const res = await fetch(`/api/trips/${tripId}`, { method: 'DELETE' });
                                                    if (res.ok) {
                                                        fetchVehicle();
                                                        // Stay on previous page if current page becomes empty after deletion
                                                        setTripsPage(p => Math.min(p, Math.ceil((vehicle.trips.length - 1) / TRIPS_PER_PAGE)));
                                                    } else {
                                                        const body = await res.json();
                                                        alert(body.error || "Erreur de suppression");
                                                    }
                                                } catch {
                                                    alert("Erreur de connexion");
                                                }
                                            }
                                        }}
                                        onViewPhotos={(folderId: string) => setViewingPhotosFolderId(folderId)}
                                    />
                                </li>
                            ))}
                        </ul>
                        {totalPages > 1 && (
                            <nav aria-label="Pagination de l'historique" style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 12,
                                marginTop: 16,
                                fontSize: 14,
                            }}>
                                <button
                                    className="btn btn-secondary"
                                    style={{ padding: '6px 14px' }}
                                    onClick={() => setTripsPage(p => p - 1)}
                                    disabled={tripsPage === 1}
                                    aria-label="Page précédente"
                                >
                                    ← Précédent
                                </button>
                                <span style={{ color: 'var(--text-secondary)' }} aria-live="polite">
                                    {tripsPage} / {totalPages}
                                </span>
                                <button
                                    className="btn btn-secondary"
                                    style={{ padding: '6px 14px' }}
                                    onClick={() => setTripsPage(p => p + 1)}
                                    disabled={tripsPage === totalPages}
                                    aria-label="Page suivante"
                                >
                                    Suivant →
                                </button>
                            </nav>
                        )}
                    </>
                );
            })()}

            {viewingPhotosFolderId && (
                <PhotoViewer
                    driveFolderId={viewingPhotosFolderId}
                    onClose={() => setViewingPhotosFolderId(null)}
                />
            )}
            </>
            )}

            {showCheckOut && (
                <CheckOutModal
                    vehicle={vehicle}
                    onClose={() => setShowCheckOut(false)}
                    onSuccess={() => {
                        setShowCheckOut(false);
                        showToast('Véhicule pris avec succès !');
                    }}
                    onRefetch={fetchVehicle}
                />
            )}

            {showCheckIn && activeTrip && (
                <CheckInModal
                    vehicle={vehicle}
                    trip={activeTrip}
                    onClose={() => setShowCheckIn(false)}
                    onSuccess={() => {
                        setShowCheckIn(false);
                        showToast('Véhicule rendu avec succès !');
                    }}
                    onRefetch={fetchVehicle}
                    initialDesinfResponsableId={activeTrip.desinfResponsableId ?? undefined}
                    initialDesinfLotNumber={activeTrip.desinfLotNumber ?? undefined}
                />
            )}

            {showDesinfPre && activeTrip && (
                <DesinfPreCheckinModal
                    tripId={activeTrip.id}
                    onClose={() => setShowDesinfPre(false)}
                    onConfirm={() => {
                        setShowDesinfPre(false);
                        fetchVehicle();
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

            {showChecklistManager && vehicle && (
                <ChecklistManager
                    vehicleId={vehicle.id}
                    vehicleName={vehicle.name}
                    onClose={() => setShowChecklistManager(false)}
                />
            )}

            {showEditMetricsModal && vehicle && (
                <EditMetricsModal
                    vehicle={vehicle}
                    onClose={() => setShowEditMetricsModal(false)}
                    onSuccess={(updatedVehicle) => {
                        setVehicle(prev => prev ? { ...prev, ...updatedVehicle } : updatedVehicle);
                        setShowEditMetricsModal(false);
                        showToast('Métriques mises à jour avec succès !');
                    }}
                />
            )}

            {showDesinfHistoryModal && vehicle && (
                <DesinfHistoryModal
                    vehicleId={vehicle.id}
                    vehicleName={vehicle.name}
                    onClose={() => setShowDesinfHistoryModal(false)}
                />
            )}

            {showMaintenanceModal && vehicle && (
                <MaintenanceHistoryModal
                    vehicle={vehicle}
                    isAdmin={userRoles.includes('ADMIN')}
                    onClose={() => {
                        setShowMaintenanceModal(false);
                        setMaintenanceRefreshKey(k => k + 1);
                    }}
                    onSuccess={() => setMaintenanceRefreshKey(k => k + 1)}
                />
            )}

            {showEditRevisionModal && vehicle && (
                <EditRevisionIntervalsModal
                    vehicle={vehicle}
                    onClose={() => setShowEditRevisionModal(false)}
                    onSuccess={(updatedVehicle) => {
                        setVehicle(prev => prev ? { ...prev, ...updatedVehicle } : updatedVehicle);
                        setShowEditRevisionModal(false);
                        showToast('Intervalles de révision mis à jour !');
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


