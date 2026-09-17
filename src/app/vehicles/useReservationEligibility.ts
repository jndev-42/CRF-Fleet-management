'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    getReservationCtaState,
    getReservationEligibility,
    type ReservationCtaState,
    type ReservationDenialReason,
} from '@/lib/vehicleReservationEligibility';
import type { DashboardVehicle } from './types';

/**
 * Compose l'éligibilité de RÉSERVATION de la flotte affichée sur `/vehicles`.
 *
 * Strictement distinct de `useBorrowEligibility` (emprunt) : aucun code partagé, aucune
 * modification du parcours d'emprunt. Une seule I/O ici — `GET /api/me/license-check` —
 * là où l'emprunt en fait deux : la réservation n'a pas besoin du calendrier, puisqu'un
 * véhicule occupé aujourd'hui reste réservable pour plus tard et que le serveur arbitre
 * seul les chevauchements de créneaux.
 *
 * Fail-open assumé : un échec du fetch laisse `licenseBlocked = false`, comme pour
 * l'emprunt. Durcir en fail-closed viderait la CTA au premier hoquet réseau.
 */
export function useReservationEligibility(args: {
    vehicles: DashboardVehicle[];
    userRoles: string[];
    isDtView: boolean;
    vehiclesLoading: boolean;
}): {
    eligibleVehicles: DashboardVehicle[];
    licenseBlocked: boolean;
    ctaState: { state: ReservationCtaState; reason: ReservationDenialReason | null; message: string };
    loading: boolean;
} {
    const { vehicles, userRoles, isDtView, vehiclesLoading } = args;

    const [licenseBlocked, setLicenseBlocked] = useState(false);
    const [licenseResolved, setLicenseResolved] = useState(false);

    useEffect(() => {
        if (isDtView) return;

        let cancelled = false;

        (async () => {
            let blocked = false;
            try {
                const res = await fetch('/api/me/license-check');
                if (res.ok) {
                    const data = await res.json();
                    blocked = Boolean(data?.blocked);
                }
            } catch {
                blocked = false; // fail-open assumé
            }
            if (cancelled) return;
            setLicenseBlocked(blocked);
            setLicenseResolved(true);
        })();

        return () => { cancelled = true; };
    }, [isDtView]);

    const loading = vehiclesLoading || (!isDtView && vehicles.length > 0 && !licenseResolved);

    const { eligibleVehicles, denialReasons } = useMemo(() => {
        if (loading) {
            return { eligibleVehicles: [] as DashboardVehicle[], denialReasons: [] as ReservationDenialReason[] };
        }
        const eligible: DashboardVehicle[] = [];
        const reasons: ReservationDenialReason[] = [];
        for (const vehicle of vehicles) {
            const { canReserve, blockingReason } = getReservationEligibility({
                vehicleType: vehicle.type,
                userRoles,
                isDtView,
            });
            if (canReserve) eligible.push(vehicle);
            else if (blockingReason) reasons.push(blockingReason);
        }
        return { eligibleVehicles: eligible, denialReasons: reasons };
    }, [loading, vehicles, userRoles, isDtView]);

    const ctaState = getReservationCtaState({
        loading,
        eligibleCount: eligibleVehicles.length,
        licenseBlocked,
        userRoles,
        denialReasons,
    });

    return { eligibleVehicles, licenseBlocked, ctaState, loading };
}
