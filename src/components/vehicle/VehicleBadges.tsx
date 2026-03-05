import React from 'react';
import { Vehicle } from '@/app/vehicles/[id]/types';
import { statusClass, statusLabels } from '@/app/vehicles/[id]/utils';

interface VehicleBadgesProps {
    vehicle: Vehicle;
    userRoles: string[];
    onToggleDSA: () => Promise<void>;
    onDelete: () => void;
    /**
     * When true (vehicle detail page only), the DSA badge becomes clickable for admins
     * and a grayed-out badge is shown when DSA is absent.
     * On the dashboard card this should be false/omitted.
     */
    showAdminDsaToggle?: boolean;
}

/**
 * Renders badges for vehicle properties: type, status, DSA, fuel type.
 * For admins on the detail page, the DSA badge itself is the toggle.
 * - Green badge: DSA present (visible to all, clickable by admin on detail page)
 * - Gray dashed badge: DSA absent (only shown to admins on the detail page)
 * - Nothing: DSA absent, regular user
 */
export default function VehicleBadges({ vehicle, userRoles, onToggleDSA, onDelete, showAdminDsaToggle = false }: VehicleBadgesProps) {
    const isAdmin = userRoles.includes('ADMIN');

    /** Renders the DSA badge depending on state + role */
    function renderDSABadge() {
        if (vehicle.hasDSA) {
            // DSA present → colored badge, clickable for admin on detail page
            return (
                <span
                    className="vehicle-type-badge"
                    onClick={isAdmin && showAdminDsaToggle ? onToggleDSA : undefined}
                    title={isAdmin && showAdminDsaToggle ? 'Cliquer pour retirer le DSA' : undefined}
                    style={{
                        background: 'rgba(34, 197, 94, 0.1)',
                        color: '#22C55E',
                        cursor: isAdmin && showAdminDsaToggle ? 'pointer' : 'default',
                        userSelect: 'none',
                        transition: 'opacity 0.15s',
                    }}
                    onMouseOver={e => { if (isAdmin && showAdminDsaToggle) (e.currentTarget as HTMLElement).style.opacity = '0.7'; }}
                    onMouseOut={e => { if (isAdmin && showAdminDsaToggle) (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                >
                    🫀 DSA
                </span>
            );
        }

        // DSA absent → grayed dashed badge, only for admins on the detail page
        if (isAdmin && showAdminDsaToggle) {
            return (
                <span
                    className="vehicle-type-badge"
                    onClick={onToggleDSA}
                    title="Cliquer pour ajouter le DSA"
                    style={{
                        background: 'rgba(107, 114, 128, 0.08)',
                        color: 'var(--text-tertiary)',
                        border: '1px dashed var(--border-secondary)',
                        cursor: 'pointer',
                        userSelect: 'none',
                        transition: 'opacity 0.15s',
                    }}
                    onMouseOver={e => { (e.currentTarget as HTMLElement).style.opacity = '0.7'; }}
                    onMouseOut={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                >
                    🫀 DSA
                </span>
            );
        }

        // Regular user + no DSA → nothing
        return null;
    }

    return (
        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Type badge */}
            <span className="vehicle-type-badge">{vehicle.type}</span>

            {/* Status badge */}
            <span className={`status-badge ${statusClass[vehicle.status] || 'available'}`}>
                <span className="status-dot" />
                {statusLabels[vehicle.status] || vehicle.status}
            </span>

            {/* DSA badge — active (green) or inactive (gray, admin-only, detail page only) */}
            {renderDSABadge()}

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

            {/* Admin-only: delete vehicle button */}
            {isAdmin && (
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
