'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { RenaultVehicleData } from '@/lib/renault';

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

const vehicleIcons: Record<string, string> = {
  VL: '🚗',
  VPSP: '🚑',
  Utilitaire: '🚐',
};

function isElectric(vehicleName: string) {
  return vehicleName.toUpperCase().includes('VL186');
}

function isDiesel(vehicleName: string) {
  return vehicleName.toUpperCase().includes('182');
}

function getFuelClass(level: number) {
  if (level >= 50) return 'full';
  if (level >= 25) return 'mid';
  return 'low';
}

export default function DashboardPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [renaultData, setRenaultData] = useState<Record<string, RenaultVehicleData>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    fetchVehicles();
    fetch('/api/auth/session')
      .then(res => res.json())
      .then(session => {
        if (session?.user?.roles?.includes('ADMIN')) {
          setIsAdmin(true);
        }
      })
      .catch(console.error);
  }, []);

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

      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 className="section-title" style={{ margin: 0 }}>Véhicules</h2>
        {isAdmin && (
          <button
            className="btn btn-primary"
            onClick={() => setShowAddModal(true)}
          >
            ➕ Ajouter un véhicule
          </button>
        )}
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
                  🧑‍✈️ {vehicle.trips[0].driverName} {vehicle.trips[0].secondDriverName ? ` & ${vehicle.trips[0].secondDriverName}` : ''} — {vehicle.trips[0].missionType}
                </div>
              )}

              {vehicle.hasDSA && (
                <div style={{ fontSize: 12, color: '#22C55E', marginBottom: 8, fontWeight: 600 }}>🫀 DSA</div>
              )}

              {isElectric(vehicle.name) ? (
                <div style={{ fontSize: 12, color: '#3B82F6', marginBottom: 8, fontWeight: 600 }}>⚡ Électrique</div>
              ) : isDiesel(vehicle.name) ? (
                <div style={{ fontSize: 12, color: '#374151', marginBottom: 8, fontWeight: 600 }}>⛽ Diesel</div>
              ) : (
                <div style={{ fontSize: 12, color: '#F97316', marginBottom: 8, fontWeight: 600 }}>⛽ Essence</div>
              )}

              <div className="vehicle-meta">
                <div className="meta-item">
                  <span className="meta-label">Kilométrage</span>
                  <span className="meta-value">
                    {renaultData[vehicle.name]?.totalMileage
                      ? <span style={{ color: isElectric(vehicle.name) ? '#2563EB' : '#EA580C', fontWeight: 600 }}>{renaultData[vehicle.name].totalMileage?.toLocaleString('fr-FR')} km</span>
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
                  const label = isElec ? '🔋 Batterie (live)' : (isDiesel(vehicle.name) ? '⛽ Diesel (live)' : '⛽ Essence (live)');
                  const displayVal = isElec ? `${val}%` : `${val} L`;
                  // For fuel quantity we map it roughly to percentage for the bar (assuming 50L tank roughly)
                  const fillPct = isElec ? (val || 0) : Math.min(((val || 0) / 50) * 100, 100);

                  return (
                    <div className="fuel-bar-container">
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
                  <div className="fuel-bar-container">
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="meta-label">{isElectric(vehicle.name) ? 'Batterie' : (isDiesel(vehicle.name) ? 'Diesel' : 'Essence')}</span>
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
      )}

      {showAddModal && (
        <AddVehicleModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            fetchVehicles();
          }}
        />
      )}
    </>
  );
}

function AddVehicleModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    name: '',
    type: 'VL',
    plate: '',
    parkingSpot: 'Baigneur (devant l’UL)',
    fuelLevel: 100,
    mileage: 0,
    hasDSA: false,
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        onSuccess();
      } else {
        const data = await res.json();
        alert(data.error || 'Erreur lors de la création');
      }
    } catch {
      alert('Erreur de connexion');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 100 }}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">➕ Ajouter un véhicule</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Nom du véhicule * (ex: VL186)</label>
                <input
                  className="form-input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Type *</label>
                <select
                  className="form-select"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                >
                  <option value="VL">VL (Véhicule Léger)</option>
                  <option value="VPSP">VPSP (Ambulance)</option>
                  <option value="Utilitaire">Utilitaire</option>
                  <option value="Moto">Moto</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Immatriculation *</label>
                <input
                  className="form-input"
                  value={form.plate}
                  onChange={(e) => setForm({ ...form, plate: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Lieu de stationnement habituel</label>
                <input
                  className="form-input"
                  value={form.parkingSpot}
                  onChange={(e) => setForm({ ...form, parkingSpot: e.target.value })}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Kilométrage initial *</label>
                <input
                  type="number"
                  className="form-input"
                  value={form.mileage}
                  onChange={(e) => setForm({ ...form, mileage: parseInt(e.target.value) || 0 })}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Niveau de carburant/batterie (%) *</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  className="form-input"
                  value={form.fuelLevel}
                  onChange={(e) => setForm({ ...form, fuelLevel: parseInt(e.target.value) || 0 })}
                  required
                />
              </div>
            </div>
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 14px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)' }}>
                <input
                  type="checkbox"
                  checked={form.hasDSA}
                  onChange={(e) => setForm({ ...form, hasDSA: e.target.checked })}
                  style={{ width: 18, height: 18, accentColor: 'var(--crf-red)' }}
                />
                <span style={{ fontSize: 14, fontWeight: 500 }}>🫀 Le véhicule est équipé d&apos;un DSA</span>
              </label>
            </div>
            <div className="form-group">
              <label className="form-label">Notes (Optionnel)</label>
              <textarea
                className="form-textarea"
                rows={3}
                placeholder="Informations supplémentaires..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Création...' : 'Créer le véhicule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
