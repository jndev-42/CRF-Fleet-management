'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    getBorrowCtaState,
    getBorrowEligibility,
    type BorrowCtaState,
    type BorrowDenialReason,
} from '@/lib/vehicleBorrowEligibility';
import type { DashboardVehicle } from './types';

/** Sous-ensemble de `GET /api/vehicles/calendar` → `reservations[]` consommé ici. */
export interface CalendarReservation {
    vehicleId: string;
    userEmail: string;
    startTime: string;
    endTime: string;
    status: string;
}

/**
 * Compose l'éligibilité d'emprunt de la flotte affichée sur `/vehicles`.
 *
 * Deux I/O, aucune règle métier : la règle vit dans `@/lib/vehicleBorrowEligibility`.
 *  - `GET /api/me/license-check` → papiers bloqués ;
 *  - `GET /api/vehicles/calendar` (sans `month`) → réservations de la fenêtre courante.
 *
 * Fail-open assumé : un échec de l'un ou l'autre fetch laisse `licenseBlocked = false`
 * et l'ensemble des réservations vide. `POST /api/trips` ne contrôle ni les papiers ni
 * les réservations : il n'y a donc aucun rattrapage serveur. Durcir en fail-closed
 * viderait la CTA au premier hoquet réseau.
 */
export function useBorrowEligibility(args: {
    vehicles: DashboardVehicle[];
    userRoles: string[];
    currentUserEmail: string | null | undefined;
    isDtView: boolean;
    vehiclesLoading: boolean;
}): {
    eligibleVehicles: DashboardVehicle[];
    licenseBlocked: boolean;
    ctaState: { state: BorrowCtaState; reason: BorrowDenialReason | null; message: string };
    loading: boolean;
} {
    const { vehicles, userRoles, currentUserEmail, isDtView, vehiclesLoading } = args;

    const [licenseBlocked, setLicenseBlocked] = useState(false);
    const [reservedByOtherIds, setReservedByOtherIds] = useState<Set<string>>(new Set());
    /** Clé du cliché pour lequel les deux fetch ont abouti (résolus ou rejetés). */
    const [resolvedKey, setResolvedKey] = useState<string | null>(null);
    /** Compteur d'invalidation du cliché. Incrémenté au retour de l'onglet au premier plan. */
    const [refreshTick, setRefreshTick] = useState(0);

    // Clé stable dérivée : `fetchVehicles` fait `setVehicles(data)` et recrée donc un
    // tableau à chaque rafraîchissement. Dépendre de son identité relancerait `calendar`
    // et `license-check` à chaque check-out.
    const vehicleIdsKey = vehicles.map(v => v.id).join(',');

    // Clé du cliché courant : elle agrège TOUT ce qui déclenche un refetch. Comparer
    // `resolvedKey` à cette clé re-gate donc l'UI dès qu'une dépendance change — y
    // compris à l'hydratation de session (`currentUserEmail : undefined → …`) et au
    // retour de l'onglet — sans avoir à remettre l'état à `null` en tête d'effet.
    const snapshotKey = `${refreshTick}|${currentUserEmail ?? ''}|${vehicleIdsKey}`;

    // Le cliché d'autorisation (papiers + réservations actives) est daté de l'instant du
    // fetch : `now` n'y est capturé qu'une fois, et l'ensemble des ids ne bouge pas quand
    // un tiers crée ou fait valider une réservation. Or `/vehicles` est la page
    // d'atterrissage : l'onglet peut rester ouvert toute une matinée, et le cliché
    // vieillirait sans jamais être invalidé — `POST /api/trips` ne contrôlant ni les
    // papiers ni les réservations, il n'existe aucun rattrapage serveur.
    // Aucun listener en vue DT : la section n'y est pas rendue et n'émet aucun fetch.
    useEffect(() => {
        if (isDtView) return;
        const onVisible = () => {
            if (document.visibilityState === 'visible') setRefreshTick(t => t + 1);
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [isDtView]);

    useEffect(() => {
        // Garde À L'INTÉRIEUR de l'effet : le hook doit rester appelé inconditionnellement.
        if (isDtView || vehicleIdsKey === '') return;

        let cancelled = false;

        async function fetchLicenseBlocked(): Promise<boolean> {
            try {
                const res = await fetch('/api/me/license-check');
                if (!res.ok) return false;
                const data = await res.json();
                return Boolean(data?.blocked);
            } catch {
                return false; // fail-open assumé
            }
        }

        async function fetchReservedByOtherIds(): Promise<Set<string>> {
            try {
                const res = await fetch('/api/vehicles/calendar');
                if (!res.ok) return new Set();
                // La route renvoie un OBJET { vehicles, reservations, trips, maintenances },
                // jamais un tableau nu.
                const { reservations } = await res.json();
                const list: CalendarReservation[] = Array.isArray(reservations) ? reservations : [];

                // La fenêtre de la route couvre ~45 jours : le filtre `now` est
                // entièrement à la charge du client. Parité ReservationBlock.tsx:90-96.
                const now = Date.now();
                return new Set(
                    list
                        .filter(r => r.status === 'VALIDATED'
                            && Date.parse(r.startTime) <= now
                            && Date.parse(r.endTime) >= now
                            && r.userEmail !== currentUserEmail)
                        .map(r => r.vehicleId)
                );
            } catch {
                return new Set(); // fail-open assumé
            }
        }

        Promise.all([fetchLicenseBlocked(), fetchReservedByOtherIds()]).then(([blocked, ids]) => {
            if (cancelled) return;
            setLicenseBlocked(blocked);
            setReservedByOtherIds(ids);
            setResolvedKey(snapshotKey);
        });

        return () => { cancelled = true; };
    }, [isDtView, vehicleIdsKey, currentUserEmail, snapshotKey]);

    // `licenseBlocked` et `reservedByOtherIds` valent leurs défauts (`false` / `Set()`)
    // tant que les fetch n'ont pas abouti — indiscernables de « chargé et négatif ».
    // Tant que cette clé n'est pas résolue, rien n'est consommé.
    const dataLoading = !isDtView && vehicleIdsKey !== '' && resolvedKey !== snapshotKey;
    const loading = vehiclesLoading || dataLoading;

    const { eligibleVehicles, denialReasons } = useMemo(() => {
        if (loading) {
            return { eligibleVehicles: [] as DashboardVehicle[], denialReasons: [] as BorrowDenialReason[] };
        }
        const eligible: DashboardVehicle[] = [];
        const reasons: BorrowDenialReason[] = [];
        for (const vehicle of vehicles) {
            const { canBorrow, blockingReason } = getBorrowEligibility({
                vehicleStatus: vehicle.status,
                vehicleType: vehicle.type,
                userRoles,
                isReservedByOther: reservedByOtherIds.has(vehicle.id),
                licenseBlocked,
                isDtView,
            });
            if (canBorrow) eligible.push(vehicle);
            else if (blockingReason) reasons.push(blockingReason);
        }
        return { eligibleVehicles: eligible, denialReasons: reasons };
    }, [loading, vehicles, userRoles, reservedByOtherIds, licenseBlocked, isDtView]);

    const ctaState = getBorrowCtaState({
        loading,
        eligibleCount: eligibleVehicles.length,
        licenseBlocked,
        userRoles,
        denialReasons,
    });

    return { eligibleVehicles, licenseBlocked, ctaState, loading };
}
