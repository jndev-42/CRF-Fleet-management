import { QrCode } from 'lucide-react';
import VehicleBadges from '@/components/vehicle/VehicleBadges';
import { isAdminOrAbove } from '@/lib/roles';
import { getBorrowEligibility, getBorrowDenialTitle } from '@/lib/vehicleBorrowEligibility';
import type { Trip, Vehicle } from './types';

interface VehicleDetailHeaderProps {
    vehicle: Vehicle;
    userRoles: string[];
    isDtView: boolean;
    isReservedByOther: boolean;
    licenseBlocked: boolean;
    activeTrip: Trip | undefined;
    canCheckIn: boolean;
    onShowQR: () => void;
    onToggleDSA: () => void;
    onDelete: () => void;
    onCheckOut: () => void;
    onCheckIn: () => void;
    onDeclareIncident: () => void;
    onShowIncidentHistory: () => void;
    onToggleMaintenance: () => void;
    onEditVehicle: () => void;
    onManageChecklist: () => void;
}

export default function VehicleDetailHeader({
    vehicle,
    userRoles,
    isDtView,
    isReservedByOther,
    licenseBlocked,
    activeTrip,
    canCheckIn,
    onShowQR,
    onToggleDSA,
    onDelete,
    onCheckOut,
    onCheckIn,
    onDeclareIncident,
    onShowIncidentHistory,
    onToggleMaintenance,
    onEditVehicle,
    onManageChecklist,
}: VehicleDetailHeaderProps) {
    return (
        <div className="vehicle-detail-header">
            <div className="vehicle-detail-info">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h1 style={{ margin: 0 }}>{vehicle.name}</h1>
                    <button
                        onClick={onShowQR}
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
                    showAdminDsaToggle={!isDtView}
                    onToggleDSA={async () => {
                        if (isDtView) return;
                        onToggleDSA();
                    }}
                    onDelete={!isDtView ? onDelete : undefined}
                />
            </div>
            <div className="vehicle-detail-actions">
                {!isDtView && vehicle.status === 'AVAILABLE' && (() => {
                    const eligibilityInput = {
                        vehicleStatus: vehicle.status,
                        vehicleType: vehicle.type,
                        userRoles,
                        isReservedByOther,
                        licenseBlocked,
                        isDtView,
                    };
                    const { canBorrow } = getBorrowEligibility(eligibilityInput);
                    const titleAttr = getBorrowDenialTitle(eligibilityInput);

                    return (
                        <button
                            className={`btn btn-primary btn-lg ${!canBorrow ? 'disabled' : ''}`}
                            onClick={() => { if (canBorrow) onCheckOut(); }}
                            disabled={!canBorrow}
                            title={titleAttr}
                            aria-label={`Prendre le véhicule ${vehicle.name}`}
                        >
                            🚗 Prendre le véhicule
                        </button>
                    );
                })()}
                {!isDtView && vehicle.status === 'IN_USE' && activeTrip && (
                    <button
                        className={`btn btn-success btn-lg ${!canCheckIn ? 'disabled' : ''}`}
                        onClick={() => { if (canCheckIn) onCheckIn(); }}
                        disabled={!canCheckIn}
                        title={!canCheckIn ? "Seul l'emprunteur ou un admin peut rendre ce véhicule" : ""}
                    >
                        ✅ Rendre le véhicule
                    </button>
                )}
                {!isDtView && (
                    <button
                        className="btn btn-secondary"
                        onClick={onDeclareIncident}
                        style={{ color: 'var(--status-maintenance)', borderColor: 'rgba(220, 38, 38, 0.3)' }}
                    >
                        🚨 Déclarer un incident
                    </button>
                )}
                <button
                    className="btn btn-secondary"
                    onClick={onShowIncidentHistory}
                >
                    📋 Historique des incidents
                </button>
                {!isDtView && vehicle.status !== 'IN_USE' && userRoles.includes('ADMIN') && (
                    <button
                        className="btn btn-secondary"
                        onClick={onToggleMaintenance}
                    >
                        {vehicle.status === 'MAINTENANCE' ? '✅ Remettre en service' : '🔧 Maintenance'}
                    </button>
                )}
                {!isDtView && isAdminOrAbove(userRoles) && (
                    <button
                        className="btn btn-secondary"
                        onClick={onEditVehicle}
                    >
                        ✏️ Éditer le véhicule
                    </button>
                )}
                {!isDtView && isAdminOrAbove(userRoles) && (
                    <button
                        className="btn btn-secondary"
                        onClick={onManageChecklist}
                    >
                        ⚙️ Gérer la checklist
                    </button>
                )}
            </div>
        </div>
    );
}
