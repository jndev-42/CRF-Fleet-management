import React from 'react';

interface VehicleInteractiveSVGProps {
    selectedZones: string[];
    onZoneClick: (zoneId: string) => void;
    title?: string;
    width?: number | string;
}

/**
 * Interactive SVG for vehicle damage selection.
 * Simplified diagram with clickable zones.
 */
export default function VehicleInteractiveSVG({
    selectedZones,
    onZoneClick,
    title = "Zones de choc",
    width = "100%"
}: VehicleInteractiveSVGProps) {
    // Zones IDs: 'front', 'back', 'left-front', 'left-middle', 'left-back', 'right-front', 'right-middle', 'right-back', 'roof'
    const zones = [
        { id: 'front', label: 'Avant', d: 'M 40 10 L 60 10 L 70 25 L 30 25 Z' },
        { id: 'back', label: 'Arrière', d: 'M 30 85 L 70 85 L 60 100 L 40 100 Z' },
        { id: 'left-front', label: 'Aile AV Gauche', d: 'M 10 25 L 30 25 L 30 40 L 10 40 Z' },
        { id: 'left-middle', label: 'Portes Gauches', d: 'M 10 40 L 30 40 L 30 70 L 10 70 Z' },
        { id: 'left-back', label: 'Aile AR Gauche', d: 'M 10 70 L 30 70 L 30 85 L 10 85 Z' },
        { id: 'right-front', label: 'Aile AV Droite', d: 'M 70 25 L 90 25 L 90 40 L 70 40 Z' },
        { id: 'right-middle', label: 'Portes Droites', d: 'M 70 40 L 90 40 L 90 70 L 70 70 Z' },
        { id: 'right-back', label: 'Aile AR Droite', d: 'M 70 70 L 90 70 L 90 85 L 70 85 Z' },
        { id: 'roof', label: 'Toit / Pare-brise', d: 'M 30 25 L 70 25 L 70 85 L 30 85 Z' },
    ];

    return (
        <div style={{ width }}>
            {title && <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>{title}</div>}
            <svg
                viewBox="0 0 100 110"
                style={{ width: '100%', height: 'auto', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: 10 }}
            >
                {zones.map(zone => (
                    <path
                        key={zone.id}
                        d={zone.d}
                        fill={selectedZones.includes(zone.id) ? '#EF4444' : 'var(--bg-card)'}
                        stroke={selectedZones.includes(zone.id) ? '#B91C1C' : 'var(--border-primary)'}
                        strokeWidth="1"
                        onClick={() => onZoneClick(zone.id)}
                        style={{ cursor: 'pointer', transition: 'fill 0.2s' }}
                    >
                        <title>{zone.label}</title>
                    </path>
                ))}
                {/* Wheels for context */}
                <rect x="5" y="28" width="10" height="15" fill="#333" rx="2" />
                <rect x="85" y="28" width="10" height="15" fill="#333" rx="2" />
                <rect x="5" y="72" width="10" height="15" fill="#333" rx="2" />
                <rect x="85" y="72" width="10" height="15" fill="#333" rx="2" />
            </svg>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {zones.map(zone => (
                    <button
                        key={zone.id}
                        type="button"
                        onClick={() => onZoneClick(zone.id)}
                        style={{
                            fontSize: 10,
                            padding: '2px 6px',
                            borderRadius: 4,
                            border: '1px solid',
                            borderColor: selectedZones.includes(zone.id) ? '#EF4444' : 'var(--border-primary)',
                            background: selectedZones.includes(zone.id) ? 'rgba(239, 68, 68, 0.1)' : 'var(--bg-card)',
                            color: selectedZones.includes(zone.id) ? '#EF4444' : 'var(--text-secondary)',
                            cursor: 'pointer'
                        }}
                    >
                        {zone.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
