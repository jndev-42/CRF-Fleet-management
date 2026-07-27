'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RenaultVehicleData } from '@/lib/renault';
import { DashboardSkeletons } from '@/components/ui/Skeleton';
import AddVehicleModal from '@/components/vehicle/modals/AddVehicleModal';
import VehicleCalendar from '@/components/vehicle/VehicleCalendar';
import { useUL } from '@/lib/contexts/ULContext';
import { isAdminOrAbove, hasDTRole } from '@/lib/roles';

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
  vin: string | null;
  fuelType: string | null;
  ulId?: string | null;
  ulName?: string | null;
  trips: {
    id: string;
    driverName: string;
    secondDriverName?: string | null;
    missionType: string;
    checkOutAt: string;
  }[];
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

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [renaultData, setRenaultData] = useState<Record<string, RenaultVehicleData>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isDtView, setIsDtView] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const { data: session, status } = useSession();
  const router = useRouter();
  const { activeUL } = useUL();

  const userRoles = session?.user?.roles || [];
  const canAccessDtView = hasDTRole(userRoles) && Boolean(activeUL?.dtCode);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchVehicles(isDtView);
      if (isAdminOrAbove(session?.user?.roles || [])) {
        setIsAdmin(true);
      }
    }
  }, [status, session, isDtView]);

  async function fetchVehicles(dtMode = false) {
    setLoading(true);
    try {
      const url = dtMode ? `/api/vehicles?view=dt&t=${Date.now()}` : `/api/vehicles?t=${Date.now()}`;
      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur lors de la récupération');
      setVehicles(data);

      // Fetch Renault data for supported vehicles
      const renaultVehicles = data.filter((v: Vehicle) => v.vin);
      if (renaultVehicles.length > 0) {
        Promise.all(renaultVehicles.map(async (v: Vehicle) => {
          try {
            const rRes = await fetch(`/api/renault/${encodeURIComponent(v.vin || v.name)}`);
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

  const stats = {
    total: vehicles.length,
    available: vehicles.filter((v) => v.status === 'AVAILABLE').length,
    inUse: vehicles.filter((v) => v.status === 'IN_USE').length,
    maintenance: vehicles.filter((v) => v.status === 'MAINTENANCE').length,
  };

  if (status === 'unauthenticated') return null;

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 className="page-title">Véhicules</h1>
          <p className="page-description">
            {isDtView ? `Vision DT de la flotte — ${activeUL?.dtCode}` : `Vue d'ensemble de la flotte — Croix-Rouge${activeUL ? ` ${activeUL.name}` : ''}`}
          </p>
        </div>

        {canAccessDtView && (
          <div style={{ display: 'flex', gap: 8, background: 'var(--bg-secondary)', padding: 4, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)' }}>
            <button
              className={`btn ${!isDtView ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: 13, padding: '6px 14px' }}
              onClick={() => setIsDtView(false)}
            >
              🏢 Vue UL ({activeUL?.name})
            </button>
            <button
              className={`btn ${isDtView ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: 13, padding: '6px 14px' }}
              onClick={() => setIsDtView(true)}
            >
              🌐 Vue DT ({activeUL?.dtCode})
            </button>
          </div>
        )}
      </div>

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
          <span style={{ fontSize: 22 }}>🌐</span>
          <div>
            <strong style={{ display: 'block', fontSize: 14 }}>Vision DT — {activeUL?.dtCode} (Lecture seule)</strong>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Vous consultez l&apos;ensemble de la flotte de toutes les Unités Locales associées à la {activeUL?.dtCode}. La liste et le calendrier sont en lecture seule.
            </span>
          </div>
        </div>
      )}

      <div className="stats-grid" data-tour="stats">
        <div className="stat-card total">
          <div className="stat-label">Total véhicules</div>
          <div className="stat-value">{stats.total}</div>
        </div>
        <div className="stat-card available">
          <div className="stat-label">Disponibles</div>
          <div className="stat-value">{stats.available}</div>
        </div>
        <div className="stat-card inuse">
          <div className="stat-label">En mission</div>
          <div className="stat-value">{stats.inUse}</div>
        </div>
        <div className="stat-card maintenance">
          <div className="stat-label">Maintenance</div>
          <div className="stat-value">{stats.maintenance}</div>
        </div>
      </div>

      <VehicleCalendar dtView={isDtView} />

      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 className="section-title" style={{ margin: 0 }}>
          {isDtView ? `Véhicules de la DT (${stats.total})` : 'Véhicules'}
        </h2>
        {isAdmin && !isDtView && (
          <button
            className="btn btn-primary"
            onClick={() => setShowAddModal(true)}
            aria-label="Ajouter un nouveau véhicule"
          >
            ➕ Ajouter un véhicule
          </button>
        )}
      </div>

      <div className="filters-bar" data-tour="filters" role="group" aria-label="Filtrer les véhicules par statut">
        {[
          { key: 'ALL', label: 'Tous' },
          { key: 'AVAILABLE', label: '🟢 Disponibles' },
          { key: 'IN_USE', label: '🟡 En mission' },
          { key: 'MAINTENANCE', label: '🔴 Maintenance' },
        ].map((f) => (
          <button
            key={f.key}
            className={`filter-btn ${filter === f.key ? 'active' : ''}`}
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading || status === 'loading' ? (
        <div role="status" aria-label="Chargement des véhicules…">
          <DashboardSkeletons count={6} />
        </div>
      ) : (() => {
        const filteredVehicles =
          filter === 'ALL'
            ? vehicles
            : vehicles.filter((v) => v.status === filter);

        if (filteredVehicles.length === 0) {
          return (
            <div className="empty-state">
              <div className="empty-state-icon">🚗</div>
              <div className="empty-state-title">Aucun véhicule trouvé</div>
              <p>Aucun véhicule ne correspond au filtre sélectionné.</p>
            </div>
          );
        }

        return (
          <div className="vehicle-grid" data-tour="vehicle-card">
            {filteredVehicles.map((vehicle) => (
              <Link
                key={vehicle.id}
                href={`/vehicles/${vehicle.name}${isDtView ? '?dtView=true' : ''}`}
                className="vehicle-card"
              >
                <div className="vehicle-card-header">
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="vehicle-name">{vehicle.name}</span>
                      {isDtView && vehicle.ulName && (
                        <span style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: '1px 6px',
                          borderRadius: 4,
                          background: 'rgba(255, 255, 255, 0.08)',
                          border: '1px solid var(--border-primary)',
                          color: 'var(--text-secondary)'
                        }}>
                          UL {vehicle.ulName}
                        </span>
                      )}
                    </div>
                    <div className="vehicle-plate">{vehicle.plate}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                    <span className="vehicle-type-badge">{vehicle.type}</span>
                    <span
                      className={`status-badge ${statusClass[vehicle.status]}`}
                      aria-label={`Statut : ${statusLabels[vehicle.status]}`}
                    >
                      <span className="status-dot" aria-hidden="true" />
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
                    🧑‍✈️ {vehicle.trips[0].driverName} {vehicle.trips[0].secondDriverName ? ` & ${vehicle.trips[0].secondDriverName}` : ''} — {vehicle.trips[0].missionType}
                  </div>
                )}

                {vehicle.hasDSA && (
                  <div style={{ fontSize: 12, color: '#22C55E', marginBottom: 8, fontWeight: 600 }}>🫀 DSA</div>
                )}

                {vehicle.fuelType === 'Électrique' ? (
                  <div style={{ fontSize: 12, color: '#3B82F6', marginBottom: 8, fontWeight: 600 }}>⚡ Électrique</div>
                ) : vehicle.fuelType === 'Diesel' ? (
                  <div style={{ fontSize: 12, color: '#374151', marginBottom: 8, fontWeight: 600 }}>⛽ Diesel</div>
                ) : vehicle.fuelType === 'Essence' ? (
                  <div style={{ fontSize: 12, color: '#F97316', marginBottom: 8, fontWeight: 600 }}>⛽ Essence</div>
                ) : null}

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
                  const isFirstVehicle = filteredVehicles.indexOf(vehicle) === 0;
                  const rData = renaultData[vehicle.name];

                  // Display Live Renault Data if available
                  if (rData) {
                    const isElec = rData.isElectric;
                    const val = isElec ? rData.batteryLevel : rData.fuelQuantity;
                    const label = isElec ? '🔋 Batterie (live)' : (vehicle.fuelType === 'Diesel' ? '⛽ Diesel (live)' : '⛽ Essence (live)');
                    const displayVal = isElec ? `${val}%` : `${val} L`;
                    const fillPct = isElec ? (val || 0) : Math.min(((val || 0) / 50) * 100, 100);

                    return (
                      <div className="fuel-bar-container" {...(isFirstVehicle ? { 'data-tour': 'fuel-bar' } : {})}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span className="meta-label" style={{ color: isElec ? '#2563EB' : '#EA580C', fontWeight: 600 }}>{label}</span>
                          <span className="meta-label" style={{ fontWeight: 600 }}>{displayVal}</span>
                        </div>
                        <div className="fuel-bar">
                          <div
                            className={`fuel-bar-fill ${getFuelClass(fillPct)}`}
                            style={{ width: `${fillPct}%` }}
                          />
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, textAlign: 'right' }}>
                          Autonomie: {rData.batteryAutonomy || rData.fuelAutonomy || '—'} km
                        </div>
                      </div>
                    );
                  }

                  // Fallback to manual manual data
                  return (
                    <div className="fuel-bar-container" {...(isFirstVehicle ? { 'data-tour': 'fuel-bar' } : {})}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="meta-label">{vehicle.fuelType === 'Électrique' ? 'Batterie' : (vehicle.fuelType === 'Diesel' ? 'Diesel' : 'Essence')}</span>
                        <span className="meta-label">{vehicle.fuelLevel}%</span>
                      </div>
                      <div className="fuel-bar">
                        <div
                          className={`fuel-bar-fill ${getFuelClass(vehicle.fuelLevel)}`}
                          style={{ width: `${vehicle.fuelLevel}%` }}
                        />
                      </div>
                    </div>
                  );
                })()}
              </Link>
            ))}
          </div>
        );
      })()}

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
