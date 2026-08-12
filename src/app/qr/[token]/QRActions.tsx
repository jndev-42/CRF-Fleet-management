import type { QRVehicle } from './types';

export default function QRActions({
    vehicle,
    canCheckIn,
    onCheckOut,
    onCheckIn,
    onDeclareIncident,
}: {
    vehicle: QRVehicle;
    canCheckIn: boolean | null;
    onCheckOut: () => void;
    onCheckIn: () => void;
    onDeclareIncident: () => void;
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {vehicle.status === 'AVAILABLE' && (
                <button
                    className="btn btn-primary btn-lg"
                    onClick={onCheckOut}
                    style={{ width: '100%' }}
                >
                    🚗 Emprunter ce véhicule
                </button>
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
                style={{ color: '#DC2626', borderColor: 'rgba(220, 38, 38, 0.3)', width: '100%' }}
            >
                🚨 Déclarer un incident
            </button>
        </div>
    );
}
