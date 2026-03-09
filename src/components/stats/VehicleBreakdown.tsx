import { StatsData } from './types';

interface VehicleBreakdownProps {
  byVehicle: StatsData['byVehicle'];
}

export default function VehicleBreakdown({ byVehicle }: VehicleBreakdownProps) {
  function getPctBadgeClass(pct: number): string {
    if (pct > 30) return 'pct-badge pct-high';
    if (pct > 15) return 'pct-badge pct-mid';
    return 'pct-badge pct-low';
  }

  function getDominanceColor(pct: number): string {
    if (pct > 30) return 'var(--crf-red)';
    if (pct > 15) return 'var(--status-inuse)';
    return 'var(--status-available)';
  }

  return (
    <div className="breakdown-card">
      <div className="breakdown-title">
        Par véhicule
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>% des emprunts</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Véhicule</th>
            <th>Emprunts</th>
            <th>% total</th>
            <th>Km totaux</th>
            <th>Conso. moy.</th>
          </tr>
        </thead>
        <tbody>
          {byVehicle.map((vehicle) => (
            <tr key={vehicle.vehicleId}>
              <td className="driver-name">{vehicle.vehicleName}</td>
              <td>{vehicle.tripCount}</td>
              <td>
                <div>
                  <span className={getPctBadgeClass(vehicle.percentOfTotal)}>
                    {vehicle.percentOfTotal}%
                  </span>
                </div>
                <div className="dominance-bar">
                  <div
                    className="dominance-fill"
                    style={{
                      width: `${vehicle.percentOfTotal}%`,
                      background: getDominanceColor(vehicle.percentOfTotal),
                    }}
                  />
                </div>
              </td>
              <td>{vehicle.totalKm.toLocaleString('fr-FR')} km</td>
              <td>{vehicle.avgFuelDelta > 0 ? `−${Math.round(vehicle.avgFuelDelta)}%` : '—'}</td>
            </tr>
          ))}
          {byVehicle.length === 0 && (
            <tr>
              <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 8px' }}>
                Aucune sortie sur cette période
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
