import FuelBar from '@/components/vehicle/FuelBar';
import type { QRVehicle } from './types';
import { formatDate } from './types';

export default function VehicleInfoCard({ vehicle }: { vehicle: QRVehicle }) {
    const activeTrip = vehicle.activeTrip;

    return (
        <>
            {/* Vehicle info card */}
            <div style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-primary)',
                borderRadius: 16,
                padding: '20px 24px',
                marginBottom: 20,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{vehicle.name}</h1>
                    <span style={{
                        fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                        background: vehicle.status === 'AVAILABLE'
                            ? 'rgba(16,185,129,0.15)' : vehicle.status === 'IN_USE'
                                ? 'rgba(245,158,11,0.15)' : 'rgba(100,116,139,0.15)',
                        color: vehicle.status === 'AVAILABLE'
                            ? 'var(--status-available)' : vehicle.status === 'IN_USE'
                                ? 'var(--status-inuse)' : '#64748B',
                    }}>
                        {vehicle.status === 'AVAILABLE' ? 'Disponible' :
                            vehicle.status === 'IN_USE' ? 'En mission' : 'Indisponible'}
                    </span>
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 16 }}>
                    {vehicle.plate} · {vehicle.type}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div style={{ background: 'var(--bg-primary)', borderRadius: 8, padding: '10px 14px' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Kilométrage</div>
                        <div style={{ fontWeight: 700 }}>{vehicle.mileage.toLocaleString('fr-FR')} km</div>
                    </div>
                    <div style={{ background: 'var(--bg-primary)', borderRadius: 8, padding: '10px 14px' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>
                            {vehicle.fuelType === 'Électrique' ? 'Batterie' : 'Carburant'}
                        </div>
                        <div style={{ fontWeight: 700 }}>{vehicle.fuelLevel}%</div>
                        <FuelBar level={vehicle.fuelLevel} electric={vehicle.fuelType === 'Électrique'} style={{ marginTop: 4 }} />
                    </div>
                </div>

                {vehicle.parkingSpot && (
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        📍 Stationnement : <strong>{vehicle.parkingSpot}</strong>
                    </div>
                )}
            </div>

            {/* Active trip info */}
            {activeTrip && (
                <div style={{
                    background: 'var(--status-inuse-bg)',
                    border: '1px solid var(--status-inuse)',
                    borderRadius: 12,
                    padding: '14px 18px',
                    marginBottom: 20,
                }}>
                    <div style={{ fontWeight: 700, color: 'var(--status-inuse)', marginBottom: 4 }}>
                        🧑‍✈️ En mission avec {activeTrip.driverName}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        Depuis le {formatDate(activeTrip.checkOutAt)} · {activeTrip.missionType}
                        {activeTrip.missionName && ` : ${activeTrip.missionName}`}
                    </div>
                </div>
            )}
        </>
    );
}
