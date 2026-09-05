'use client';

import { useState } from 'react';
import CheckOutModal from '@/components/vehicle/modals/CheckOutModal';
import VehiclePickerModal from '@/components/vehicle/modals/VehiclePickerModal';
import type { Vehicle } from '@/app/vehicles/[id]/types';
import QuickBorrowCta from './QuickBorrowCta';
import { useBorrowEligibility } from './useBorrowEligibility';
import type { DashboardVehicle } from './types';
import styles from './QuickBorrow.module.css';

interface QuickBorrowSectionProps {
    vehicles: DashboardVehicle[];
    userRoles: string[];
    currentUserEmail: string | null | undefined;
    isDtView: boolean;
    vehiclesLoading: boolean;
    /** Rafraîchit la grille de véhicules de la page. */
    onCheckOutSuccess: () => void;
}

/**
 * Orchestre l'emprunt en 2 clics depuis le dashboard : CTA → picker → `CheckOutModal`.
 *
 * Le véhicule choisi est hydraté par `GET /api/vehicles/{name}` avant d'ouvrir le modal :
 * la route de liste ne fournit pas le payload que `CheckOutModal` attend pour préremplir
 * état et propreté. La résolution se fait par NOM, jamais par UUID.
 */
export default function QuickBorrowSection({
    vehicles,
    userRoles,
    currentUserEmail,
    isDtView,
    vehiclesLoading,
    onCheckOutSuccess,
}: QuickBorrowSectionProps) {
    // Appelé inconditionnellement : l'early-return sur `isDtView` vient après
    // (`react-hooks/rules-of-hooks`). Le hook n'émet aucun fetch en vue DT.
    const { eligibleVehicles, ctaState } = useBorrowEligibility({
        vehicles,
        userRoles,
        currentUserEmail,
        isDtView,
        vehiclesLoading,
    });

    const [pickerOpen, setPickerOpen] = useState(false);
    const [pendingVehicleId, setPendingVehicleId] = useState<string | null>(null);
    const [checkOutVehicle, setCheckOutVehicle] = useState<Vehicle | null>(null);
    const [staleNotice, setStaleNotice] = useState<string | null>(null);

    if (isDtView) return null;

    async function handleSelect({ id, name }: { id: string; name: string }) {
        setPendingVehicleId(id);
        setStaleNotice(null);
        try {
            const res = await fetch(
                `/api/vehicles/${encodeURIComponent(name)}?t=${Date.now()}`,
                { cache: 'no-store' },
            );
            if (!res.ok) throw new Error('Erreur lors de la récupération du véhicule');
            const full: Vehicle = await res.json();

            // Le statut peut avoir changé entre l'ouverture du picker et ce clic.
            if (full.status !== 'AVAILABLE') {
                setStaleNotice("Ce véhicule vient d'être emprunté.");
                setPickerOpen(false);
                onCheckOutSuccess();
                return;
            }

            setPickerOpen(false);
            setCheckOutVehicle(full);
        } catch (e) {
            console.error('Failed to hydrate vehicle', name, e);
            alert('Impossible de charger le véhicule…');
        } finally {
            setPendingVehicleId(null);
        }
    }

    return (
        <div className={styles.section}>
            <QuickBorrowCta
                state={ctaState.state}
                message={ctaState.message}
                eligibleCount={eligibleVehicles.length}
                onOpen={() => {
                    setStaleNotice(null);
                    setPickerOpen(true);
                }}
            />

            {staleNotice && (
                <p className={styles.message} role="status">{staleNotice}</p>
            )}

            {pickerOpen && (
                <VehiclePickerModal
                    eligibleVehicles={eligibleVehicles}
                    pendingVehicleId={pendingVehicleId}
                    onSelect={handleSelect}
                    onClose={() => setPickerOpen(false)}
                />
            )}

            {checkOutVehicle && (
                <CheckOutModal
                    vehicle={checkOutVehicle}
                    onClose={() => setCheckOutVehicle(null)}
                    onSuccess={() => {
                        setCheckOutVehicle(null);
                        onCheckOutSuccess();
                    }}
                    onRefetch={onCheckOutSuccess}
                />
            )}
        </div>
    );
}
