'use client';

import React from 'react';
import { useEscapeKey } from '@/lib/hooks/useEscapeKey';
import type { DashboardVehicle } from '@/app/vehicles/types';
import styles from '@/app/vehicles/QuickBorrow.module.css';

interface VehiclePickerModalProps {
    /** Uniquement les véhicules réellement empruntables — le modal ne filtre rien. */
    eligibleVehicles: DashboardVehicle[];
    /** `id` du véhicule en cours d'hydratation, ou `null`. */
    pendingVehicleId: string | null;
    onSelect: (vehicle: { id: string; name: string }) => void;
    onClose: () => void;
    /** Titre du modal. Défaut : parcours d'emprunt. */
    title?: string;
    /** Message affiché quand la liste est vide. Défaut : parcours d'emprunt. */
    emptyLabel?: string;
}

/**
 * Sélection d'un véhicule depuis le dashboard — emprunt (`QuickBorrowSection`) comme
 * retour (`QuickReturnSection`), les deux parcours ne différant que par les libellés.
 * Ne fetch pas : la liste et l'état d'attente lui sont fournis par la section appelante.
 */
export default function VehiclePickerModal({
    eligibleVehicles,
    pendingVehicleId,
    onSelect,
    onClose,
    title = '🚗 Choisir un véhicule',
    emptyLabel = 'Aucun véhicule empruntable pour le moment.',
}: VehiclePickerModalProps) {
    useEscapeKey(onClose);
    const isHydrating = pendingVehicleId !== null;

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 100 }}>
            <div
                className="modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="vehicle-picker-title"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="modal-header">
                    <h2 className="modal-title" id="vehicle-picker-title">{title}</h2>
                    <button className="modal-close" onClick={onClose} aria-label="Fermer">✕</button>
                </div>
                <div className="modal-body">
                    {eligibleVehicles.length === 0 ? (
                        <p className={styles.pickerEmpty}>{emptyLabel}</p>
                    ) : (
                        <div className={styles.pickerList}>
                            {eligibleVehicles.map((vehicle) => (
                                <button
                                    key={vehicle.id}
                                    type="button"
                                    data-testid="picker-row"
                                    className={styles.pickerRow}
                                    disabled={isHydrating}
                                    onClick={() => onSelect({ id: vehicle.id, name: vehicle.name })}
                                >
                                    <span>
                                        <span className={styles.pickerName}>{vehicle.name}</span>
                                        {' — '}
                                        <span className={styles.pickerPlate}>{vehicle.plate}</span>
                                    </span>
                                    {pendingVehicleId === vehicle.id && (
                                        <span role="status" aria-label="Chargement du véhicule">⏳</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
