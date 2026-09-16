'use client';

import ActiveTripBanner from './ActiveTripBanner';
import MaintenanceBanner from './MaintenanceBanner';
import type { Trip, Vehicle } from './types';

interface VehicleDetailBannersProps {
    vehicle: Vehicle | null;
    /** `undefined` quand aucun trajet ouvert n'a été trouvé (`Array.find` de `page.tsx`). */
    activeTrip: Trip | null | undefined;
    userRoles: string[];
    currentUserEmail: string | null;
    users: { id: string; name: string; email: string }[];
    canCheckIn: boolean;
    onShowDesinfPre: () => void;
    onEditCheckOut: (trip: Trip) => void;
    onCheckIn: () => void;
    onSecondDriverAdded: () => void;
    showToast: (message: string, type?: string) => void;
    onEndMaintenance: () => void;
}

/**
 * Région « bandeaux » de la fiche véhicule (critères 1.3, 1.4, 1.5).
 *
 * Les deux gates sont la seule logique de ce composant, et c'est précisément ce qui
 * justifie son extraction : tant qu'ils vivaient dans `page.tsx`, aucun test ne pouvait
 * les atteindre sans monter la page entière (Client Component à `useEffect`, M-4).
 *
 * - Le bandeau maintenance est gaté sur `vehicle.activeMaintenance`, PAS sur
 *   `status === 'MAINTENANCE'` : un véhicule `IN_USE` porte une maintenance active sans
 *   que la colonne `status` ne le reflète (la maintenance est un flag parallèle).
 * - `canEndMaintenance={!activeTrip}` : remettre en service un véhicule physiquement
 *   dehors autoriserait un second check-out concurrent.
 */
export default function VehicleDetailBanners({
    vehicle,
    activeTrip,
    userRoles,
    currentUserEmail,
    users,
    canCheckIn,
    onShowDesinfPre,
    onEditCheckOut,
    onCheckIn,
    onSecondDriverAdded,
    showToast,
    onEndMaintenance,
}: VehicleDetailBannersProps) {
    return (
        <>
            {activeTrip && (
                <ActiveTripBanner
                    activeTrip={activeTrip}
                    userRoles={userRoles}
                    currentUserEmail={currentUserEmail}
                    users={users}
                    canCheckIn={canCheckIn}
                    onShowDesinfPre={onShowDesinfPre}
                    onEditCheckOut={onEditCheckOut}
                    onCheckIn={onCheckIn}
                    onSecondDriverAdded={onSecondDriverAdded}
                    showToast={showToast}
                />
            )}

            {vehicle?.activeMaintenance && (
                <MaintenanceBanner
                    vehicle={vehicle}
                    userRoles={userRoles}
                    canEndMaintenance={!activeTrip}
                    onEndMaintenance={onEndMaintenance}
                />
            )}
        </>
    );
}
