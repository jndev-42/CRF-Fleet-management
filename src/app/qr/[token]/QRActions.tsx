import type { QRVehicle } from './types';

export default function QRActions({
    vehicle,
    canCheckIn,
    licenseBlocked = false,
    onCheckOut,
    onCheckIn,
    onDeclareIncident,
}: {
    vehicle: QRVehicle;
    canCheckIn: boolean | null;
    /** Papiers bloqués : l'emprunt est refusé (le serveur répond 403 de toute façon). */
    licenseBlocked?: boolean;
    onCheckOut: () => void;
    onCheckIn: () => void;
    onDeclareIncident: () => void;
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {vehicle.status === 'AVAILABLE' && (
                <button
                    className={`btn btn-primary btn-lg ${licenseBlocked ? 'disabled' : ''}`}
                    onClick={() => { if (!licenseBlocked) onCheckOut(); }}
                    disabled={licenseBlocked}
                    title={licenseBlocked ? "Vos papiers n'ont pas été validés — emprunt bloqué." : ''}
                    style={{ width: '100%' }}
                >
                    🚗 Emprunter ce véhicule
                </button>
            )}

            {vehicle.status === 'AVAILABLE' && licenseBlocked && (
                <div role="alert" style={{
                    textAlign: 'center', padding: '12px 16px',
                    background: 'var(--bg-card)', border: '1px solid var(--border-primary)',
                    borderRadius: 12, fontSize: 13, color: 'var(--status-maintenance)'
                }}>
                    Vos papiers n&apos;ont pas été validés dans les délais — emprunt impossible.
                    Présentez vos papiers à votre DLUS/DLAS.
                </div>
            )}

            {vehicle.status === 'IN_USE' && canCheckIn && (
                <button
                    className="btn btn-success btn-lg"
                    onClick={onCheckIn}
                    style={{ width: '100%' }}
                >
                    ✅ Rendre ce véhicule
                </button>
            )}

            {vehicle.status === 'IN_USE' && !canCheckIn && (
                <div style={{
                    textAlign: 'center', padding: '16px 20px',
                    background: 'var(--bg-card)', border: '1px solid var(--border-primary)',
                    borderRadius: 12, fontSize: 14, color: 'var(--text-secondary)'
                }}>
                    Ce véhicule est actuellement en mission.<br />
                    Seul l&apos;emprunteur peut le rendre via ce QR Code.
                </div>
            )}

            {vehicle.status === 'MAINTENANCE' && (
                <div style={{
                    textAlign: 'center', padding: '16px 20px',
                    background: 'var(--bg-card)', border: '1px solid var(--border-primary)',
                    borderRadius: 12, fontSize: 14, color: 'var(--text-secondary)'
                }}>
                    🔧 Ce véhicule est en maintenance et n&apos;est pas disponible.
                </div>
            )}

            <button
                className="btn btn-secondary"
                onClick={onDeclareIncident}
                style={{ color: 'var(--status-maintenance)', borderColor: 'rgba(220, 38, 38, 0.3)', width: '100%' }}
            >
                🚨 Déclarer un incident
            </button>
        </div>
    );
}
