'use client';

import { useState } from 'react';
import ReservationFormModal from '@/components/vehicle/modals/ReservationFormModal';
import VehiclePickerModal from '@/components/vehicle/modals/VehiclePickerModal';
import QuickReservationCta from './QuickReservationCta';
import { useReservationEligibility } from './useReservationEligibility';
import type { DashboardVehicle } from './types';
import styles from './QuickBorrow.module.css';

interface QuickReservationSectionProps {
    vehicles: DashboardVehicle[];
    userRoles: string[];
    currentUserEmail: string | null | undefined;
    isDtView: boolean;
    vehiclesLoading: boolean;
    /** Rafraîchit la grille de véhicules de la page. */
    onReservationSuccess: () => void;
}

/**
 * Orchestre la réservation en 2 clics depuis le dashboard : CTA → picker → formulaire.
 *
 * Miroir de `QuickBorrowSection`, à deux différences près :
 *  - le picker liste les véhicules éligibles au PERMIS, statut compris — un véhicule
 *    `IN_USE` ou en maintenance reste réservable pour un créneau futur ;
 *  - aucune hydratation par `GET /api/vehicles/{name}` : `id` et `type`, seules données
 *    nécessaires au formulaire, sont déjà portées par la liste du dashboard.
 *
 * `Vehicle.status` n'est jamais modifié : réserver n'immobilise pas le véhicule.
 */
export default function QuickReservationSection({
    vehicles,
    userRoles,
    currentUserEmail,
    isDtView,
    vehiclesLoading,
    onReservationSuccess,
}: QuickReservationSectionProps) {
    // Appelé inconditionnellement : l'early-return sur `isDtView` vient après
    // (`react-hooks/rules-of-hooks`). Le hook n'émet aucun fetch en vue DT.
    const { eligibleVehicles, ctaState } = useReservationEligibility({
        vehicles,
        userRoles,
        isDtView,
        vehiclesLoading,
    });

    const [pickerOpen, setPickerOpen] = useState(false);
    const [selected, setSelected] = useState<{ id: string; name: string; type: string } | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    if (isDtView) return null;

    function handleSelect({ id, name }: { id: string; name: string }) {
        const vehicle = eligibleVehicles.find(v => v.id === id);
        if (!vehicle) {
            // La grille a été rafraîchie entre l'ouverture du picker et ce clic.
            setNotice("Ce véhicule n'est plus disponible à la réservation.");
            setPickerOpen(false);
            return;
        }
        setPickerOpen(false);
        setSelected({ id, name, type: vehicle.type });
    }

    return (
        <div className={styles.section}>
            <QuickReservationCta
                state={ctaState.state}
                message={ctaState.message}
                eligibleCount={eligibleVehicles.length}
                onOpen={() => {
                    setNotice(null);
                    setPickerOpen(true);
                }}
            />

            {notice && (
                <p className={styles.message} role="status">{notice}</p>
            )}

            {pickerOpen && (
                <VehiclePickerModal
                    eligibleVehicles={eligibleVehicles}
                    pendingVehicleId={null}
                    onSelect={handleSelect}
                    onClose={() => setPickerOpen(false)}
                    title="📅 Choisir un véhicule à réserver"
                    emptyLabel="Aucun véhicule réservable pour le moment."
                />
            )}

            {selected && (
                <ReservationFormModal
                    vehicleId={selected.id}
                    vehicleType={selected.type}
                    currentUserEmail={currentUserEmail ?? null}
                    userRoles={userRoles}
                    title={`Réserver ${selected.name}`}
                    showOccupancy
                    onClose={() => setSelected(null)}
                    onSuccess={({ recurrenceWarning }) => {
                        setSelected(null);
                        setNotice(recurrenceWarning ?? 'Réservation enregistrée.');
                        onReservationSuccess();
                    }}
                />
            )}
        </div>
    );
}
