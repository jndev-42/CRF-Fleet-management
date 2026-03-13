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

  function getFuelDisplay(vehicle: StatsData['byVehicle'][0]): string {
    if (vehicle.avgLPer100km > 0) return `${vehicle.avgLPer100km.toFixed(1)} L/100`;
    if (vehicle.avgFuelDelta > 0) return `−${Math.round(vehicle.avgFuelDelta)}%`;
    return '—';
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
            <th scope="col">Véhicule</th>
            <th scope="col">Emprunts</th>
            <th scope="col">% total</th>
            <th scope="col">Km totaux</th>
            <th scope="col">L/100km</th>
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
              <td>{getFuelDisplay(vehicle)}</td>
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
