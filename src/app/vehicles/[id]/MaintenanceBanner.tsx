import { formatDate } from './utils';
import type { Vehicle } from './types';

interface MaintenanceBannerProps {
    vehicle: Vehicle;
    userRoles: string[];
    onEndMaintenance: () => void;
}

export default function MaintenanceBanner({ vehicle, userRoles, onEndMaintenance }: MaintenanceBannerProps) {
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
                {vehicle.activeMaintenance ? (
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
                ) : (
                    <div style={{ fontSize: 13, color: 'var(--text-secondary, #64748b)' }}>
                        Indisponible pour les sorties.
                    </div>
                )}
            </div>
            {userRoles.includes('ADMIN') && (
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
