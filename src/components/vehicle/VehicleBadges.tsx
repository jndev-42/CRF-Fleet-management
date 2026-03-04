import React from 'react';
import { Vehicle } from '@/app/vehicles/[id]/types';
import { statusClass, statusLabels } from '@/app/vehicles/[id]/utils';

interface VehicleBadgesProps {
    vehicle: Vehicle;
    userRoles: string[];
    onToggleDSA: () => Promise<void>;
    onDelete: () => void;
}

/**
 * Renders badges for vehicle properties such as type, status, DSA equipment, and fuel type.
 * Also includes toggle buttons for DSA and deletion.
 */
export default function VehicleBadges({ vehicle, userRoles, onToggleDSA, onDelete }: VehicleBadgesProps) {
    return (
        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Type badge */}
            <span className="vehicle-type-badge">{vehicle.type}</span>

            {/* Status badge */}
            <span className={`status-badge ${statusClass[vehicle.status] || 'available'}`}>
                <span className="status-dot" />
                {statusLabels[vehicle.status] || vehicle.status}
            </span>

            {/* DSA badge */}
            {vehicle.hasDSA && (
                <span className="vehicle-type-badge" style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#22C55E' }}>
                    🫀 DSA
                </span>
            )}

            {/* Fuel type badge */}
            {vehicle.fuelType === 'Électrique' ? (
                <span className="vehicle-type-badge" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6' }}>
                    ⚡ Électrique
                </span>
            ) : vehicle.fuelType === 'Diesel' ? (
                <span className="vehicle-type-badge" style={{ background: 'rgba(107, 114, 128, 0.1)', color: '#374151' }}>
                    ⛽ Diesel
                </span>
            ) : vehicle.fuelType === 'Essence' ? (
                <span className="vehicle-type-badge" style={{ background: 'rgba(249, 115, 22, 0.1)', color: '#F97316' }}>
                    ⛽ Essence
                </span>
            ) : null}

            {/* Admin toggle DSA button */}
            {userRoles.includes('ADMIN') && (
                <button
                    onClick={onToggleDSA}
                    style={{
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-primary)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '4px 8px',
                        fontSize: 12,
                        cursor: 'pointer',
                        fontWeight: 500,
                        color: 'var(--text-secondary)'
                    }}
                >
                    {vehicle.hasDSA ? 'Retirer DSA' : 'Ajouter DSA'}
                </button>
            )}

            {/* Admin Delete button */}
            {userRoles.includes('ADMIN') && (
                <button
                    onClick={onDelete}
                    style={{
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '4px 8px',
                        fontSize: 12,
                        cursor: 'pointer',
                        fontWeight: 600,
                        color: '#EF4444'
                    }}
                >
                    🗑️ Supprimer
                </button>
            )}
        </div>
    );
}
