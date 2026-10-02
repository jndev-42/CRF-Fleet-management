'use client';

import Link from 'next/link';
import type { RenaultVehicleData } from '@/lib/renault';
import { DT_STATUS_META, formatDtDateTime, formatDtDay } from './dtFilters';
import type { DashboardVehicle } from './types';

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

interface VehicleCardProps {
  vehicle: DashboardVehicle;
  isDtView: boolean;
  renaultData: RenaultVehicleData | undefined;
  /** Porte l'ancre `data-tour="fuel-bar"` du tour guidé (première carte seulement). */
  isFirst: boolean;
}

/**
 * Carte véhicule du dashboard. En Vue DT, le badge suit `availability` (calculée par le
 * serveur sur la fenêtre choisie) et la carte détaille les réservations ; en Vue UL,
 * rendu historique inchangé.
 */
export default function VehicleCard({ vehicle, isDtView, renaultData: rData, isFirst }: VehicleCardProps) {
  const availability = isDtView ? vehicle.availability : undefined;
  const dtMeta = availability ? DT_STATUS_META[availability.status] : null;
  const showDriver = availability ? availability.status === 'IN_USE' : vehicle.status === 'IN_USE';

  return (
    <Link
      href={`/vehicles/${vehicle.name}${isDtView ? '?dtView=true' : ''}`}
      className="vehicle-card"
    >
      <div className="vehicle-card-header" style={{ gap: 12 }}>
        {/* Le nom revient à la ligne entre ses mots ; le badge d'UL, insécable, passe sous le nom
            quand la place manque au lieu d'être écrasé à côté (statut long, nom long). */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <span className="vehicle-name" style={{ overflowWrap: 'anywhere' }}>{vehicle.name}</span>
            {isDtView && vehicle.ulName && (
              <span style={{
                whiteSpace: 'nowrap',
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, maxWidth: '55%' }}>
          <span className="vehicle-type-badge">{vehicle.type}</span>
          {dtMeta ? (
            <span className={`status-badge ${dtMeta.className}`} style={{ textAlign: 'right' }} aria-label={`Statut : ${dtMeta.badge}`}>
              <span aria-hidden="true">{dtMeta.icon}</span>
              {dtMeta.badge}
            </span>
          ) : (
            <span
              className={`status-badge ${statusClass[vehicle.status]}`}
              aria-label={`Statut : ${statusLabels[vehicle.status]}`}
            >
              <span className="status-dot" aria-hidden="true" />
              {statusLabels[vehicle.status]}
            </span>
          )}
          {!availability && vehicle.hasActiveMaintenance && vehicle.status !== 'MAINTENANCE' && (
            <span className="status-badge maintenance" aria-label="Statut : Maintenance en cours">
              <span className="status-dot" aria-hidden="true" />
              🔧 Maintenance
            </span>
          )}
        </div>
      </div>

      {showDriver && vehicle.trips[0] && (
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

      {availability?.status === 'POTENTIAL' && availability.missionSince && (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
          🕓 En mission depuis le {formatDtDay(availability.missionSince)}
        </div>
      )}

      {availability && availability.reservations.length > 0 && (
        <ul
          aria-label="Réservations sur la période"
          style={{
            listStyle: 'none',
            padding: '8px 12px',
            margin: '0 0 12px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 13,
            color: 'var(--text-primary)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {availability.reservations.map((r) => (
            <li key={r.id}>
              <strong>📅 {formatDtDateTime(r.startTime)} → {formatDtDateTime(r.endTime)}</strong>
              <div style={{ color: 'var(--text-secondary)' }}>
                {r.userName || 'Réservant inconnu'} · {r.status === 'PENDING' ? 'en attente' : 'validée'}
                {r.reason ? ` · ${r.reason}` : ''}
              </div>
            </li>
          ))}
        </ul>
      )}

      {vehicle.hasDSA && (
        <div style={{ fontSize: 12, color: 'var(--status-available)', marginBottom: 8, fontWeight: 600 }}>🫀 DSA</div>
      )}

      {vehicle.fuelType === 'Électrique' ? (
        <div style={{ fontSize: 12, color: '#3B82F6', marginBottom: 8, fontWeight: 600 }}>⚡ Électrique</div>
      ) : vehicle.fuelType === 'Diesel' ? (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 600 }}>⛽ Diesel</div>
      ) : vehicle.fuelType === 'Essence' ? (
        <div style={{ fontSize: 12, color: 'var(--status-inuse)', marginBottom: 8, fontWeight: 600 }}>⛽ Essence</div>
      ) : null}

      {vehicle.transmission === 'Automatique' ? (
        <div style={{ fontSize: 12, color: '#14B8A6', marginBottom: 8, fontWeight: 600 }}>⚙️ Automatique</div>
      ) : vehicle.transmission === 'Manuelle' ? (
        <div style={{ fontSize: 12, color: '#8B5CF6', marginBottom: 8, fontWeight: 600 }}>⚙️ Manuelle</div>
      ) : null}

      <div className="vehicle-meta">
        <div className="meta-item">
          <span className="meta-label">Kilométrage</span>
          <span className="meta-value">
            {rData?.totalMileage
              ? <span>{rData.totalMileage?.toLocaleString('fr-FR')} km</span>
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
        // Display Live Renault Data if available
        if (rData) {
          const isElec = rData.isElectric;
          const val = isElec ? rData.batteryLevel : rData.fuelQuantity;
          const label = isElec ? '🔋 Batterie (live)' : (vehicle.fuelType === 'Diesel' ? '⛽ Diesel (live)' : '⛽ Essence (live)');
          const displayVal = isElec ? `${val}%` : `${val} L`;
          const fillPct = isElec ? (val || 0) : Math.min(((val || 0) / 50) * 100, 100);

          return (
            <div className="fuel-bar-container" {...(isFirst ? { 'data-tour': 'fuel-bar' } : {})}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="meta-label" style={{ color: isElec ? '#2563EB' : 'var(--status-inuse)', fontWeight: 600 }}>{label}</span>
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
          <div className="fuel-bar-container" {...(isFirst ? { 'data-tour': 'fuel-bar' } : {})}>
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
  );
}
