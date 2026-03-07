'use client';

import React from 'react';

function getFuelColor(level: number): string {
    if (level >= 50) return 'var(--fuel-full)';
    if (level >= 25) return 'var(--fuel-mid)';
    return 'var(--fuel-low)';
}

interface FuelBarProps {
    level: number;
    electric: boolean;
    style?: React.CSSProperties;
}

const LABELS = ['E', '1/4', '1/2', '3/4', 'F'];
const TICK_POSITIONS = [25, 50, 75];

export default function FuelBar({ level, electric, style }: FuelBarProps) {
    const color = getFuelColor(level);

    if (electric) {
        return (
            <div style={{
                width: '100%',
                height: 6,
                background: 'var(--bg-input)',
                borderRadius: 3,
                overflow: 'hidden',
                ...style,
            }}>
                <div style={{
                    height: '100%',
                    width: `${level}%`,
                    background: color,
                    borderRadius: 3,
                    transition: 'width 0.5s ease',
                }} />
            </div>
        );
    }

    return (
        <div style={{ position: 'relative', ...style }}>
            <div style={{
                width: '100%',
                height: 8,
                background: 'var(--bg-input)',
                borderRadius: 4,
                overflow: 'hidden',
            }}>
                <div style={{
                    height: '100%',
                    width: `${level}%`,
                    background: color,
                    borderRadius: 4,
                    transition: 'width 0.5s ease',
                }} />
            </div>
            {TICK_POSITIONS.map(pct => (
                <div key={pct} style={{
                    position: 'absolute',
                    left: `${pct}%`,
                    top: 0,
                    height: 8,
                    width: 1,
                    background: 'var(--border-primary)',
                    transform: 'translateX(-50%)',
                    opacity: 0.8,
                }} />
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                {LABELS.map(label => (
                    <span key={label} style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1 }}>
                        {label}
                    </span>
                ))}
            </div>
        </div>
    );
}
