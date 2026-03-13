'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { StatsData } from './types';

interface DriverBreakdownProps {
  byDriver: StatsData['byDriver'];
}

export default function DriverBreakdown({ byDriver }: DriverBreakdownProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  function getPctBadgeClass(pct: number): string {
    if (pct > 30) return 'pct-badge pct-high';
    if (pct > 15) return 'pct-badge pct-mid';
    return 'pct-badge pct-low';
  }

  return (
    <div className="breakdown-card">
      <div className="breakdown-title">
        Par chauffeur
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>détail par conducteur</span>
      </div>
      <table>
        <thead>
          <tr>
            <th scope="col" aria-label="Détails"></th>
            <th scope="col">Chauffeur</th>
            <th scope="col">Emprunts</th>
            <th scope="col">% total</th>
            <th scope="col">Km</th>
            <th scope="col">Incidents</th>
            <th scope="col">% retour</th>
            <th scope="col">L/100km</th>
          </tr>
        </thead>
        <tbody>
          {byDriver.map((driver) => {
            const isExpanded = expanded === driver.driverEmail;

            return (
              <React.Fragment key={driver.driverEmail}>
                <tr
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
                  <td>
                    {driver.incidents > 0 ? (
                      <>
                        {driver.incidents}
                        {' '}
                        <span className="incident-dot" />
                      </>
                    ) : '0'}
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    {driver.avgFuelAtReturn > 0 ? `${driver.avgFuelAtReturn}%` : '—'}
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    {driver.avgLPer100km > 0 ? `${driver.avgLPer100km.toFixed(1)}` : '—'}
                  </td>
                </tr>
                {isExpanded && driver.byVehicle.map((veh) => (
                  <tr key={`${driver.driverEmail}-${veh.vehicleId}`} style={{ background: 'rgba(255,255,255,0.015)' }}>
                    <td></td>
                    <td colSpan={2} style={{ paddingLeft: 20, color: 'var(--text-muted)', fontSize: 11 }}>
                      ↳ {veh.vehicleName}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{veh.tripCount} sorties</td>
                    <td colSpan={4}>
                      <span className={getPctBadgeClass(veh.percentOfVehicleTotal)} style={{ fontSize: 10 }}>
                        {veh.percentOfVehicleTotal}% du véhicule
                      </span>
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            );
          })}
          {byDriver.length === 0 && (
            <tr>
              <td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 8px' }}>
                Aucune sortie sur cette période
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
