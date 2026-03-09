'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { StatsData } from './types';

interface DriverBreakdownProps {
  byDriver: StatsData['byDriver'];
  totalKm: number;
  completedTrips: number;
}

export default function DriverBreakdown({ byDriver, totalKm, completedTrips }: DriverBreakdownProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const globalAvgKm = completedTrips > 0 ? totalKm / completedTrips : 0;

  function getPctBadgeClass(pct: number): string {
    if (pct > 30) return 'pct-badge pct-high';
    if (pct > 15) return 'pct-badge pct-mid';
    return 'pct-badge pct-low';
  }

  function getVsStyle(vsAvg: number): { color: string } {
    if (vsAvg > 20) return { color: 'var(--status-maintenance)' };
    if (vsAvg < -20) return { color: 'var(--status-available)' };
    return { color: 'var(--text-muted)' };
  }

  return (
    <div className="breakdown-card">
      <div className="breakdown-title">
        Par chauffeur
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>vs. moyenne globale</span>
      </div>
      <table>
        <thead>
          <tr>
            <th></th>
            <th>Chauffeur</th>
            <th>Emprunts</th>
            <th>% total</th>
            <th>Km</th>
            <th>vs. moy.</th>
            <th>Incidents</th>
          </tr>
        </thead>
        <tbody>
          {byDriver.map((driver) => {
            const driverAvgKm = driver.tripCount > 0 ? driver.totalKm / driver.tripCount : 0;
            const vsAvg = globalAvgKm > 0 ? Math.round(((driverAvgKm / globalAvgKm) - 1) * 100) : 0;
            const vsStr = vsAvg >= 0 ? `+${vsAvg}%` : `${vsAvg}%`;
            const isExpanded = expanded === driver.driverEmail;

            return (
              <>
                <tr
                  key={driver.driverEmail}
                  style={{ cursor: driver.byVehicle.length > 0 ? 'pointer' : 'default' }}
                  onClick={() => driver.byVehicle.length > 0 && setExpanded(isExpanded ? null : driver.driverEmail)}
                >
                  <td style={{ width: 20, paddingRight: 4 }}>
                    {driver.byVehicle.length > 0 && (
                      isExpanded
                        ? <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
                        : <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
                    )}
                  </td>
                  <td className="driver-name">{driver.driverName}</td>
                  <td>{driver.tripCount}</td>
                  <td>
                    <span className={getPctBadgeClass(driver.percentOfTotal)}>
                      {driver.percentOfTotal}%
                    </span>
                  </td>
                  <td>{driver.totalKm.toLocaleString('fr-FR')} km</td>
                  <td className="vs-avg" style={getVsStyle(vsAvg)}>{vsStr}</td>
                  <td>
                    {driver.incidents > 0 ? (
                      <>
                        {driver.incidents}
                        {' '}
                        <span className="incident-dot" />
                      </>
                    ) : '0'}
                  </td>
                </tr>
                {isExpanded && driver.byVehicle.map((veh) => (
                  <tr key={`${driver.driverEmail}-${veh.vehicleId}`} style={{ background: 'rgba(255,255,255,0.015)' }}>
                    <td></td>
                    <td colSpan={2} style={{ paddingLeft: 20, color: 'var(--text-muted)', fontSize: 11 }}>
                      ↳ {veh.vehicleName}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{veh.tripCount} sorties</td>
                    <td colSpan={3}>
                      <span className={getPctBadgeClass(veh.percentOfVehicleTotal)} style={{ fontSize: 10 }}>
                        {veh.percentOfVehicleTotal}% du véhicule
                      </span>
                    </td>
                  </tr>
                ))}
              </>
            );
          })}
          {byDriver.length === 0 && (
            <tr>
              <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 8px' }}>
                Aucune sortie sur cette période
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
