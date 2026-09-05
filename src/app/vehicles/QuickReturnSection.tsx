'use client';

import { useMemo, useState } from 'react';
import CheckInModal from '@/components/vehicle/modals/CheckInModal';
import VehiclePickerModal from '@/components/vehicle/modals/VehiclePickerModal';
import type { Trip, Vehicle } from '@/app/vehicles/[id]/types';
import { getReturnEligibility } from '@/lib/vehicleReturnEligibility';
import QuickReturnCta from './QuickReturnCta';
import type { DashboardVehicle } from './types';
import styles from './QuickBorrow.module.css';

interface QuickReturnSectionProps {
    vehicles: DashboardVehicle[];
    currentUserEmail: string | null | undefined;
    /** UL de l'utilisateur — transmise telle quelle à `CheckInModal` (animation Paris 18). */
    currentUserUlId: string | null | undefined;
    isDtView: boolean;
    /** Rafraîchit la grille de véhicules de la page. */
    onCheckInSuccess: () => void;
}

/**
 * Orchestre le retour rapide depuis le dashboard : CTA → (picker si 2+) → `CheckInModal`.
 *
 * N'émet AUCUN fetch de liste : `vehicles` porte déjà le trajet actif et les emails de
 * ses conducteurs (`api/vehicles/route.ts`), ce qui suffit à reconnaître ses propres
 * emprunts. Le seul fetch est l'hydratation du véhicule choisi par
 * `GET /api/vehicles/{name}` — la route de liste ne fournit pas le payload complet que
 * `CheckInModal` attend. La résolution se fait par NOM, jamais par UUID.
 */
export default function QuickReturnSection({
    vehicles,
    currentUserEmail,
    currentUserUlId,
    isDtView,
    onCheckInSuccess,
}: QuickReturnSectionProps) {
    // Hooks appelés inconditionnellement : les early-returns viennent après
    // (`react-hooks/rules-of-hooks`).
    const returnableVehicles = useMemo(
        () => vehicles.filter((v) => getReturnEligibility({
            vehicleStatus: v.status,
            // La route de liste ne joint que le trajet ouvert : `trips[0]` ou rien.
            activeTrip: v.trips[0],
            currentUserEmail,
            isDtView,
        }).canReturn),
        [vehicles, currentUserEmail, isDtView],
    );

    const [pickerOpen, setPickerOpen] = useState(false);
    const [pendingVehicleId, setPendingVehicleId] = useState<string | null>(null);
    const [checkIn, setCheckIn] = useState<{ vehicle: Vehicle; trip: Trip } | null>(null);
    const [staleNotice, setStaleNotice] = useState<string | null>(null);

    if (isDtView) return null;
    // Aucun emprunt en cours : le bouton n'existe pas. On continue de rendre tant qu'un
    // message d'obsolescence doit rester lisible après le rafraîchissement de la grille.
    if (returnableVehicles.length === 0 && !staleNotice) return null;

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

            // Le trajet peut avoir été clos ailleurs entre l'affichage de la CTA et ce clic.
            const activeTrip = full.trips.find((t) => !t.checkInAt);
            if (!activeTrip) {
                setStaleNotice("Ce véhicule vient d'être rendu.");
                setPickerOpen(false);
                onCheckInSuccess();
                return;
            }

            setPickerOpen(false);
            setCheckIn({ vehicle: full, trip: activeTrip });
        } catch (e) {
            console.error('Failed to hydrate vehicle', name, e);
            alert('Impossible de charger le véhicule…');
        } finally {
            setPendingVehicleId(null);
        }
    }

    return (
        <div className={styles.section}>
            {returnableVehicles.length > 0 && (
                <div className={styles.ctaRow}>
                    <QuickReturnCta
                        vehicles={returnableVehicles}
                        pending={pendingVehicleId !== null}
                        onOpen={() => {
                            setStaleNotice(null);
                            const [only] = returnableVehicles;
                            if (returnableVehicles.length === 1) {
                                // Un seul emprunt : pas de choix à faire, on ouvre le retour.
                                void handleSelect({ id: only.id, name: only.name });
                            } else {
                                setPickerOpen(true);
                            }
                        }}
                    />
                </div>
            )}

            {staleNotice && (
                <p className={styles.message} role="status">{staleNotice}</p>
            )}

            {pickerOpen && (
                <VehiclePickerModal
                    eligibleVehicles={returnableVehicles}
                    pendingVehicleId={pendingVehicleId}
                    onSelect={handleSelect}
                    onClose={() => setPickerOpen(false)}
                    title="↩️ Choisir le véhicule à rendre"
                    emptyLabel="Aucun véhicule à rendre pour le moment."
                />
            )}

            {checkIn && (
                <CheckInModal
                    vehicle={checkIn.vehicle}
                    trip={checkIn.trip}
                    onClose={() => setCheckIn(null)}
                    onSuccess={() => {
                        setCheckIn(null);
                        onCheckInSuccess();
                    }}
                    onRefetch={onCheckInSuccess}
                    initialDesinfResponsableId={checkIn.trip.desinfResponsableId ?? undefined}
                    initialDesinfLotNumber={checkIn.trip.desinfLotNumber ?? undefined}
                    currentUserUlId={currentUserUlId ?? undefined}
                />
            )}
        </div>
    );
}
