import { formatDate } from './utils';
import type { Vehicle } from './types';

interface MaintenanceBannerProps {
    vehicle: Vehicle;
    userRoles: string[];
    /**
     * Autorise le bouton « Remettre en service ». Requis (non optionnel) : chaque
     * call-site doit trancher explicitement — remettre en service un véhicule
     * physiquement dehors (`Trip` ouvert) autoriserait un second check-out concurrent.
     */
    canEndMaintenance: boolean;
    onEndMaintenance: () => void;
}

export default function MaintenanceBanner({ vehicle, userRoles, canEndMaintenance, onEndMaintenance }: MaintenanceBannerProps) {
    return (
        <div
            role="status"
            aria-live="polite"
            style={{
                background: 'var(--status-maintenance-bg, rgba(239, 68, 68, 0.12))',
                border: '1px solid var(--status-maintenance, #EF4444)',
                borderRadius: 'var(--radius-md, 8px)',
                padding: '16px 20px',
                marginBottom: 24,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
            }}
        >
            <div>
                <div style={{ fontWeight: 700, color: 'var(--status-maintenance, #EF4444)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>🔧 Ce véhicule est actuellement en maintenance</span>
                </div>
                {/* `&&` et non un ternaire : le seul call-site (`VehicleDetailBanners`) gate
                    déjà sur `vehicle.activeMaintenance`, le repli était inatteignable. */}
                {vehicle.activeMaintenance && (
                    <div style={{ fontSize: 13, color: 'var(--text-primary, #334155)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <div>
                            <strong>Début :</strong> {formatDate(vehicle.activeMaintenance.startDate)}
                            {' — '}
                            <strong>Fin :</strong> {vehicle.activeMaintenance.endDate ? formatDate(vehicle.activeMaintenance.endDate) : 'Date de fin inconnue'}
                        </div>
                        <div>
                            <strong>Raison :</strong> {vehicle.activeMaintenance.reason}
                        </div>
                    </div>
                )}
            </div>
            {canEndMaintenance && userRoles.includes('ADMIN') && (
                <button
                    className="btn btn-primary"
                    style={{ backgroundColor: 'var(--status-available)', borderColor: 'var(--status-available)' }}
                    onClick={onEndMaintenance}
                >
                    ✅ Remettre en service
                </button>
            )}
        </div>
    );
}
