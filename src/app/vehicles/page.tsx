'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { RenaultVehicleData } from '@/lib/renault';
import AddVehicleModal from '@/components/vehicle/modals/AddVehicleModal';
import FuelBar from '@/components/vehicle/FuelBar';

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
    trips: { id: string; driverName: string; missionType: string; checkOutAt: string }[];
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

function isElectric(vehicleName: string) {
    return vehicleName.toUpperCase().includes('VL186');
}


export default function VehiclesPage() {
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [renaultData, setRenaultData] = useState<Record<string, RenaultVehicleData>>({});
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('ALL');
    const [showAddModal, setShowAddModal] = useState(false);
    const { status } = useSession();
    const router = useRouter();

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/login');
        }
    }, [status, router]);

    useEffect(() => {
        if (status === 'authenticated') {
            fetchVehicles();
        }
    }, [status]);

    async function fetchVehicles() {
        try {
            const res = await fetch('/api/vehicles');
            const data = await res.json();
            setVehicles(data);

            // Fetch Renault data for supported vehicles
            const renaultVehicles = data.filter((v: Vehicle) => v.name.includes('VL186') || v.name.includes('VL188'));
            if (renaultVehicles.length > 0) {
                Promise.all(renaultVehicles.map(async (v: Vehicle) => {
                    try {
                        const rRes = await fetch(`/api/renault/${encodeURIComponent(v.name)}`);
                        const rData = await rRes.json();
                        if (!rData.error) {
                            setRenaultData(prev => ({ ...prev, [v.name]: rData }));
                        }
                    } catch (e) {
                        console.error('Failed to get Renault data for', v.name, e);
                    }
                }));
            }
        } catch (error) {
            console.error('Erreur:', error);
        } finally {
            setLoading(false);
        }
    }

    const filteredVehicles =
        filter === 'ALL'
            ? vehicles
            : vehicles.filter((v) => v.status === filter);

    if (loading || status === 'loading') {
        return (
            <div className="loading-container">
                <div className="loading-spinner" />
            </div>
        );
    }

    if (status === 'unauthenticated') return null;

    return (
        <>
            <div className="page-header">
                <h1 className="page-title">Véhicules</h1>
                <p className="page-description">
                    Gestion complète de la flotte
                </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
                <div className="filters-bar" style={{ marginBottom: 0 }}>
                    {[
                        { key: 'ALL', label: `Tous (${vehicles.length})` },
                        { key: 'AVAILABLE', label: `Disponibles (${vehicles.filter(v => v.status === 'AVAILABLE').length})` },
                        { key: 'IN_USE', label: `En mission (${vehicles.filter(v => v.status === 'IN_USE').length})` },
                        { key: 'MAINTENANCE', label: `Maintenance (${vehicles.filter(v => v.status === 'MAINTENANCE').length})` },
                    ].map((f) => (
                        <button
                            key={f.key}
                            className={`filter-btn ${filter === f.key ? 'active' : ''}`}
                            onClick={() => setFilter(f.key)}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
                <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                    + Ajouter un véhicule
                </button>
            </div>

            {filteredVehicles.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-icon">🚗</div>
                    <div className="empty-state-title">Aucun véhicule</div>
                </div>
            ) : (
                <div className="vehicle-grid">
                    {filteredVehicles.map((vehicle) => (
                        <Link
                            key={vehicle.id}
                            href={`/vehicles/${vehicle.name}`}
                            className="vehicle-card"
                        >
                            <div className="vehicle-card-header">
                                <div>
                                    <div className="vehicle-name">{vehicle.name}</div>
                                    <div className="vehicle-plate">{vehicle.plate}</div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                                    <span className="vehicle-type-badge">{vehicle.type}</span>
                                    <span className={`status-badge ${statusClass[vehicle.status]}`}>
                                        <span className="status-dot" />
                                        {statusLabels[vehicle.status]}
                                    </span>
                                </div>
                            </div>

                            {vehicle.status === 'IN_USE' && vehicle.trips[0] && (
                                <div style={{
                                    padding: '8px 12px',
                                    background: 'var(--status-inuse-bg)',
                                    borderRadius: 'var(--radius-sm)',
                                    fontSize: 13,
                                    color: 'var(--status-inuse)',
                                    marginBottom: 12,
                                }}>
                                    🧑‍✈️ {vehicle.trips[0].driverName} — {vehicle.trips[0].missionType}
                                </div>
                            )}

                            {vehicle.hasDSA && (
                                <div style={{ fontSize: 12, color: '#22C55E', marginBottom: 8, fontWeight: 600 }}>🫀 DSA</div>
                            )}

                            {isElectric(vehicle.name) ? (
                                <div style={{ fontSize: 12, color: '#3B82F6', marginBottom: 8, fontWeight: 600 }}>⚡ Électrique</div>
                            ) : (
                                <div style={{ fontSize: 12, color: '#F97316', marginBottom: 8, fontWeight: 600 }}>⛽ Essence</div>
                            )}

                            <div className="vehicle-meta">
                                <div className="meta-item">
                                    <span className="meta-label">Kilométrage</span>
                                    <span className="meta-value">
                                        {renaultData[vehicle.name]?.totalMileage
                                            ? <span>{renaultData[vehicle.name].totalMileage?.toLocaleString('fr-FR')} km</span>
                                            : `${vehicle.mileage.toLocaleString('fr-FR')} km`
                                        }
                                    </span>
                                </div>
                                <div className="meta-item">
                                    <span className="meta-label">Stationnement</span>
                                    <span className="meta-value">
                                        {vehicle.parkingSpot || '—'}
                                    </span>
                                </div>
                            </div>

                            {(() => {
                                const rData = renaultData[vehicle.name];

                                // Display Live Renault Data if available
                                if (rData) {
                                    const isElec = rData.isElectric;
                                    const val = isElec ? rData.batteryLevel : rData.fuelQuantity;
                                    const label = isElec ? '🔋 Batterie (live)' : '⛽ Essence (live)';
                                    const displayVal = isElec ? `${val}%` : `${val} L`;
                                    // For fuel quantity we map it roughly to percentage for the bar (assuming 50L tank roughly)
                                    const fillPct = isElec ? (val || 0) : Math.min(((val || 0) / 50) * 100, 100);

                                    return (
                                        <div className="fuel-bar-container">
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span className="meta-label" style={{ color: isElec ? '#2563EB' : '#EA580C', fontWeight: 600 }}>{label}</span>
                                                <span className="meta-label" style={{ fontWeight: 600 }}>{displayVal}</span>
                                            </div>
                                            <FuelBar level={fillPct} electric={isElec} style={{ marginTop: 4 }} />
                                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, textAlign: 'right' }}>
                                                Autonomie: {rData.batteryAutonomy || rData.fuelAutonomy || '—'} km
                                            </div>
                                        </div>
                                    );
                                }

                                // Fallback to manual manual data
                                return (
                                    <div className="fuel-bar-container">
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span className="meta-label">{isElectric(vehicle.name) ? 'Batterie' : 'Essence'}</span>
                                            <span className="meta-label">{vehicle.fuelLevel}%</span>
                                        </div>
                                        <FuelBar level={vehicle.fuelLevel} electric={isElectric(vehicle.name)} style={{ marginTop: 4 }} />
                                    </div>
                                );
                            })()}
                        </Link>
                    ))}
                </div>
            )}

            <AddVehicleModal
                isOpen={showAddModal}
                onClose={() => setShowAddModal(false)}
                onSuccess={() => {
                    setShowAddModal(false);
                    fetchVehicles();
                }}
            />
        </>
    );
}
