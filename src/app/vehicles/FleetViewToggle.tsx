'use client';

interface Props {
    isTracking: boolean;
    onChange: (tracking: boolean) => void;
}

/** Bascule « 🚗 Flotte / 🔧 Suivi technique » de `/vehicles`, réservée aux gestionnaires véhicules. */
export default function FleetViewToggle({ isTracking, onChange }: Props) {
    return (
        <div
            role="group"
            aria-label="Vue de la page Véhicules"
            style={{ display: 'flex', gap: 8, background: 'var(--bg-secondary)', padding: 4, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)' }}
        >
            <button
                type="button"
                className={`btn ${!isTracking ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: 13, padding: '6px 14px' }}
                aria-pressed={!isTracking}
                onClick={() => onChange(false)}
            >
                🚗 Flotte
            </button>
            <button
                type="button"
                className={`btn ${isTracking ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: 13, padding: '6px 14px' }}
                aria-pressed={isTracking}
                onClick={() => onChange(true)}
            >
                🔧 Suivi technique
            </button>
        </div>
    );
}
