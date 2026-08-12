import type { RenaultVehicleData } from '@/lib/renault';
import FuelBar from '@/components/vehicle/FuelBar';
import DetailCard from '@/components/vehicle/DetailCard';
import MaintenanceCard from '@/components/vehicle/MaintenanceCard';
import type { MaintenanceRecord, Vehicle } from './types';

interface VehicleDetailGridProps {
    vehicle: Vehicle;
    renaultData: RenaultVehicleData | null;
    loadingRenault: boolean;
    userRoles: string[];
    maintenanceRecords: MaintenanceRecord[];
    onEditMetrics: () => void;
    onShowMaintenance: () => void;
    onEditRevision: () => void;
    onShowDesinfHistory: () => void;
}

export default function VehicleDetailGrid({
    vehicle,
    renaultData,
    loadingRenault,
    userRoles,
    maintenanceRecords,
    onEditMetrics,
    onShowMaintenance,
    onEditRevision,
    onShowDesinfHistory,
}: VehicleDetailGridProps) {
    return (
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
                onEdit={(!vehicle.vin && (userRoles.includes('ADMIN') || userRoles.includes('RESPO'))) ? onEditMetrics : undefined}
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
                onEdit={(!vehicle.vin && (userRoles.includes('ADMIN') || userRoles.includes('RESPO'))) ? onEditMetrics : undefined}
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
                    onClick={onShowMaintenance}
                    onEdit={userRoles.includes('ADMIN') ? onEditRevision : undefined}
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
                        onClick={onShowDesinfHistory}
                    />
                );
            })()}
            {vehicle.desinfTracking && !vehicle.type.toUpperCase().includes('VPSP') && (
                <DetailCard
                    title="Désinfections"
                    value="Voir l'historique"
                    subtitle="Suivi activé"
                    backgroundColor="rgba(16, 185, 129, 0.05)"
                    borderColor="rgba(16, 185, 129, 0.3)"
                    valueStyle={{ color: '#059669', fontSize: 13 }}
                    onClick={onShowDesinfHistory}
                />
            )}
        </div>
    );
}
