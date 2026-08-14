'use client';

import { Suspense, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

import { Trip } from './types';
import { useVehicleDetail } from './useVehicleDetail';
import VehicleDetailHeader from './VehicleDetailHeader';
import ActiveTripBanner from './ActiveTripBanner';
import MaintenanceBanner from './MaintenanceBanner';
import VehicleDetailGrid from './VehicleDetailGrid';
import TripHistoryList from './TripHistoryList';
import VehicleNotes from '@/components/vehicle/VehicleNotes';
import CheckOutModal from '@/components/vehicle/modals/CheckOutModal';
import CheckInModal from '@/components/vehicle/modals/CheckInModal';
import DeleteConfirmationModal from '@/components/vehicle/modals/DeleteConfirmationModal';
import QRCodeModal from '@/components/vehicle/modals/QRCodeModal';
import ReservationBlock from '@/components/vehicle/ReservationBlock';
import ChecklistManager from '@/components/vehicle/ChecklistManager';
import EditMetricsModal from '@/components/vehicle/modals/EditMetricsModal';
import DesinfHistoryModal from '@/components/vehicle/modals/DesinfHistoryModal';
import DesinfPreCheckinModal from '@/components/vehicle/modals/DesinfPreCheckinModal';
import MaintenanceHistoryModal from '@/components/vehicle/modals/MaintenanceHistoryModal';
import PutInMaintenanceModal from '@/components/vehicle/modals/PutInMaintenanceModal';
import EditRevisionIntervalsModal from '@/components/vehicle/modals/EditRevisionIntervalsModal';
import IncidentReportModal from '@/components/vehicle/modals/IncidentReportModal';
import IncidentHistoryModal from '@/components/vehicle/modals/IncidentHistoryModal';
import EditCheckOutModal from '@/components/vehicle/modals/EditCheckOutModal';
import EditVehicleModal from '@/components/vehicle/modals/EditVehicleModal';
import { VehicleDetailSkeleton } from '@/components/ui/VehicleDetailSkeleton';

/**
 * VehicleDetailPage Component
 *
 * Main page for viewing a single vehicle's full details.
 * Data-fetching lives in useVehicleDetail(); distinct UI sections (header,
 * active-trip banner, maintenance banner, detail grid, trip history) are
 * extracted into sibling components. This page owns modal-visibility state
 * and wires everything together.
 */
export default function VehicleDetailPage() {
    return (
        <Suspense fallback={<div style={{ padding: '24px 0' }}><VehicleDetailSkeleton /></div>}>
            <VehicleDetailPageContent />
        </Suspense>
    );
}

// useSearchParams() below requires a Suspense boundary (Next.js App Router) — the wrapper above provides it.
function VehicleDetailPageContent() {
    const params = useParams();
    const id = params.id as string;
    const router = useRouter();
    const searchParams = useSearchParams();

    const {
        vehicle,
        setVehicle,
        renaultData,
        loading,
        loadingRenault,
        userRoles,
        currentUserEmail,
        currentUserUlId,
        licenseBlocked,
        users,
        maintenanceRecords,
        fetchVehicle,
        bumpMaintenanceRefresh,
    } = useVehicleDetail(id);

    const [showCheckOut, setShowCheckOut] = useState(false);
    const [showCheckIn, setShowCheckIn] = useState(false);
    const [showQRModal, setShowQRModal] = useState(false);
    const [showChecklistManager, setShowChecklistManager] = useState(false);
    const [showEditMetricsModal, setShowEditMetricsModal] = useState(false);
    const [showDesinfHistoryModal, setShowDesinfHistoryModal] = useState(false);
    const [isReservedByOther, setIsReservedByOther] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: string } | null>(null);
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [showDesinfPre, setShowDesinfPre] = useState(false);
    const [showIncidentReport, setShowIncidentReport] = useState(false);
    const [editingIncidentId, setEditingIncidentId] = useState<string | null>(null);
    const [showIncidentHistory, setShowIncidentHistory] = useState(false);
    const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
    const [showPutInMaintenanceModal, setShowPutInMaintenanceModal] = useState(false);
    const [showEditRevisionModal, setShowEditRevisionModal] = useState(false);
    const [showEditVehicleModal, setShowEditVehicleModal] = useState(false);
    const [editingCheckOutTrip, setEditingCheckOutTrip] = useState<Trip | null>(null);

    /**
     * Reusable toast notification triggered from child components or modal callbacks
     */
    function showToast(message: string, type: string = 'success') {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        setToast({ message, type });
        toastTimerRef.current = setTimeout(() => setToast(null), 4000);
    }

    /**
     * Admin capability to end vehicle maintenance mode and return to service.
     */
    async function handleEndMaintenance() {
        if (!vehicle) return;
        try {
            const res = await fetch(`/api/vehicles/${encodeURIComponent(id)}/maintenance-events`, {
                method: 'PATCH',
            });
            if (!res.ok) throw new Error('Erreur lors de la remise en service');
            showToast('Véhicule remis en service');
            fetchVehicle();
        } catch {
            showToast('Erreur lors de la remise en service', 'error');
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

    const isDtViewParam = searchParams.get('dtView') === 'true';
    const isCrossUl = Boolean(vehicle?.ulId) && Boolean(currentUserUlId) && vehicle?.ulId !== currentUserUlId;
    const isDtView = isDtViewParam || isCrossUl;

    // Determine whether there's an active (un-checked-in) trip to render Check-In UI
    const activeTrip = vehicle?.trips.find((t) => !t.checkInAt);
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

            {isDtView && (
                <div style={{
                    padding: '12px 16px',
                    marginBottom: 20,
                    background: 'rgba(139, 92, 246, 0.12)',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    color: 'var(--text-primary)',
                }}>
                    <span style={{ fontSize: 22 }}>ℹ️</span>
                    <div>
                        <strong style={{ display: 'block', fontSize: 14 }}>Mode Vue DT (Lecture seule)</strong>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            Vous consultez ce véhicule en mode lecture seule dans le cadre de la vision DT. Les actions d&apos;emprunt, restitution et modifications sont désactivées.
                        </span>
                    </div>
                </div>
            )}

            <VehicleDetailHeader
                vehicle={vehicle}
                userRoles={userRoles}
                isDtView={isDtView}
                isReservedByOther={isReservedByOther}
                licenseBlocked={licenseBlocked}
                activeTrip={activeTrip}
                canCheckIn={canCheckIn}
                onShowQR={() => setShowQRModal(true)}
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
                onCheckOut={() => setShowCheckOut(true)}
                onCheckIn={() => setShowCheckIn(true)}
                onDeclareIncident={() => {
                    setEditingIncidentId(null);
                    setShowIncidentReport(true);
                }}
                onShowIncidentHistory={() => setShowIncidentHistory(true)}
                onToggleMaintenance={() => {
                    if (vehicle.status === 'MAINTENANCE') {
                        handleEndMaintenance();
                    } else {
                        setShowPutInMaintenanceModal(true);
                    }
                }}
                onEditVehicle={() => setShowEditVehicleModal(true)}
                onManageChecklist={() => setShowChecklistManager(true)}
            />

            {activeTrip && (
                <ActiveTripBanner
                    activeTrip={activeTrip}
                    userRoles={userRoles}
                    currentUserEmail={currentUserEmail}
                    users={users}
                    canCheckIn={canCheckIn}
                    onShowDesinfPre={() => setShowDesinfPre(true)}
                    onEditCheckOut={(trip) => setEditingCheckOutTrip(trip)}
                    onCheckIn={() => setShowCheckIn(true)}
                    onSecondDriverAdded={fetchVehicle}
                    showToast={showToast}
                />
            )}

            {vehicle?.status === 'MAINTENANCE' && (
                <MaintenanceBanner vehicle={vehicle} userRoles={userRoles} onEndMaintenance={handleEndMaintenance} />
            )}

            <div style={{ marginTop: 24 }}>
                {vehicle && (
                    <ReservationBlock
                        vehicleId={vehicle.id}
                        vehicleType={vehicle.type}
                        currentUserEmail={currentUserEmail}
                        userRoles={userRoles}
                        onActiveReservationChange={setIsReservedByOther}
                        licenseBlocked={licenseBlocked}
                        readOnly={isDtView}
                    />
                )}

                <VehicleDetailGrid
                    vehicle={vehicle}
                    renaultData={renaultData}
                    loadingRenault={loadingRenault}
                    userRoles={userRoles}
                    maintenanceRecords={maintenanceRecords}
                    onEditMetrics={() => setShowEditMetricsModal(true)}
                    onShowMaintenance={() => setShowMaintenanceModal(true)}
                    onEditRevision={() => setShowEditRevisionModal(true)}
                    onShowDesinfHistory={() => setShowDesinfHistoryModal(true)}
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

                <TripHistoryList
                    vehicle={vehicle}
                    userRoles={userRoles}
                    onClearHistory={async () => {
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
                    }}
                    onDeleteTrip={async (tripId: string) => {
                        try {
                            const res = await fetch(`/api/trips/${tripId}`, { method: 'DELETE' });
                            if (res.ok) {
                                fetchVehicle();
                            } else {
                                const body = await res.json();
                                alert(body.error || "Erreur de suppression");
                            }
                        } catch {
                            alert("Erreur de connexion");
                        }
                    }}
                    onEditCheckOut={(trip) => setEditingCheckOutTrip(trip)}
                />
            </div>

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
                    currentUserUlId={currentUserUlId ?? undefined}
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

            {showIncidentReport && vehicle && (
                <IncidentReportModal
                    vehicle={vehicle}
                    tripId={activeTrip?.id}
                    existingDraftId={editingIncidentId || undefined}
                    onClose={() => {
                        setShowIncidentReport(false);
                        setEditingIncidentId(null);
                    }}
                    onSuccess={() => {
                        showToast('Incident déclaré avec succès !');
                        fetchVehicle();
                    }}
                />
            )}

            {showIncidentHistory && vehicle && (
                <IncidentHistoryModal
                    vehicle={vehicle}
                    onClose={() => setShowIncidentHistory(false)}
                    onEditDraft={(draftId) => {
                        setShowIncidentHistory(false);
                        setEditingIncidentId(draftId);
                        setShowIncidentReport(true);
                    }}
                />
            )}

            {showQRModal && (
                <QRCodeModal
                    vehicleName={vehicle.name}
                    vehicleId={vehicle.id}
                    userRoles={userRoles}
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
                        bumpMaintenanceRefresh();
                    }}
                    onSuccess={() => bumpMaintenanceRefresh()}
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

            {showEditVehicleModal && vehicle && (
                <EditVehicleModal
                    vehicle={vehicle}
                    isOpen={showEditVehicleModal}
                    onClose={() => setShowEditVehicleModal(false)}
                    onSuccess={(updatedData) => {
                        showToast('Véhicule modifié avec succès !');
                        setShowEditVehicleModal(false);
                        if (updatedData.name && updatedData.name !== vehicle.name) {
                            router.push(`/vehicles/${encodeURIComponent(updatedData.name)}`);
                        } else {
                            fetchVehicle();
                        }
                    }}
                />
            )}

            {editingCheckOutTrip && vehicle && (
                <EditCheckOutModal
                    trip={editingCheckOutTrip}
                    vehicle={vehicle}
                    onClose={() => setEditingCheckOutTrip(null)}
                    onSuccess={() => {
                        setEditingCheckOutTrip(null);
                        fetchVehicle();
                        showToast('Informations de prise modifiées avec succès');
                    }}
                />
            )}

            {showPutInMaintenanceModal && vehicle && (
                <PutInMaintenanceModal
                    vehicleName={vehicle.name}
                    onClose={() => setShowPutInMaintenanceModal(false)}
                    onSuccess={() => fetchVehicle()}
                    showToast={showToast}
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
