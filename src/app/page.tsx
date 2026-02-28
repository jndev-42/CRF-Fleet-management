'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

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

const vehicleIcons: Record<string, string> = {
  VL: '🚗',
  VPSP: '🚑',
  Utilitaire: '🚐',
};

function getFuelClass(level: number) {
  if (level >= 50) return 'full';
  if (level >= 25) return 'mid';
  return 'low';
}

export default function DashboardPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');

  useEffect(() => {
    fetchVehicles();
  }, []);

  async function fetchVehicles() {
    try {
      const res = await fetch('/api/vehicles');
      const data = await res.json();
      setVehicles(data);
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

  const filteredVehicles =
    filter === 'ALL'
      ? vehicles
      : vehicles.filter((v) => v.status === filter);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Tableau de bord</h1>
        <p className="page-description">
          Vue d&apos;ensemble de la flotte — Croix-Rouge Paris 18
        </p>
      </div>

      <div className="stats-grid">
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

      <div className="section-header">
        <h2 className="section-title">Véhicules</h2>
      </div>

      <div className="filters-bar">
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
          >
            {f.label}
          </button>
        ))}
      </div>

      {filteredVehicles.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🚗</div>
          <div className="empty-state-title">Aucun véhicule trouvé</div>
          <p>Aucun véhicule ne correspond au filtre sélectionné.</p>
        </div>
      ) : (
        <div className="vehicle-grid">
          {filteredVehicles.map((vehicle) => (
            <Link
              key={vehicle.id}
              href={`/vehicles/${vehicle.id}`}
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

              <div className="vehicle-meta">
                <div className="meta-item">
                  <span className="meta-label">Kilométrage</span>
                  <span className="meta-value">
                    {vehicle.mileage.toLocaleString('fr-FR')} km
                  </span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Stationnement</span>
                  <span className="meta-value">
                    {vehicle.parkingSpot || '—'}
                  </span>
                </div>
              </div>

              <div className="fuel-bar-container">
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="meta-label">Essence</span>
                  <span className="meta-label">{vehicle.fuelLevel}%</span>
                </div>
                <div className="fuel-bar">
                  <div
                    className={`fuel-bar-fill ${getFuelClass(vehicle.fuelLevel)}`}
                    style={{ width: `${vehicle.fuelLevel}%` }}
                  />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
