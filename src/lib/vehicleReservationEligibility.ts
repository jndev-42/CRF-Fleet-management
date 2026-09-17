/**
 * Règle d'affichage front « quel véhicule puis-je RÉSERVER depuis le dashboard ».
 *
 * Pendant strict de `src/lib/vehicleBorrowEligibility.ts`, délibérément séparé :
 * réserver et emprunter ne répondent pas à la même question.
 *
 *  - l'**emprunt** part maintenant : le véhicule doit être `AVAILABLE`, libre de
 *    maintenance et non détenu par un tiers ;
 *  - la **réservation** porte sur un créneau futur : un véhicule `IN_USE` aujourd'hui
 *    est parfaitement réservable pour la semaine prochaine. Seul le permis (le rôle
 *    conducteur face au type de véhicule) filtre la liste ; les chevauchements de
 *    créneaux restent arbitrés par le serveur
 *    (`POST /api/vehicles/{id}/reservations` → 409).
 *
 * Aucune fonction de ce module n'est appelée par le parcours d'emprunt, et
 * réciproquement : la seule chose partagée est `isVpspVehicle`, un prédicat de
 * nommage sans règle métier.
 */
import { isAdminOrAbove, isChvlDriver, isChvpspDriver } from '@/lib/roles';
import { isVpspVehicle } from '@/lib/vehicleBorrowEligibility';

/** Raison typée d'un refus de réservation. */
export type ReservationDenialReason =
    | 'DT_VIEW'                 // vue DT : read-only par contrat
    | 'ROLE_NOT_ALLOWED'        // aucun rôle conducteur
    | 'VPSP_REQUIRES_CHVPSP'    // CHVL face à un véhicule VPSP
    | 'VL_REQUIRES_CHVL';       // CHVPSP pur face à un véhicule non-VPSP

export interface ReservationEligibilityInput {
    /** VPSP si `.toUpperCase().includes('VPSP')`. */
    vehicleType: string;
    userRoles: string[];
    isDtView?: boolean; // défaut false
}

/**
 * Décision d'autorisation, RÔLE uniquement.
 *
 * ⚠️ Ne PAS y ajouter de filtre sur `vehicleStatus` : c'est précisément la différence
 * assumée avec `getBorrowEligibility`. Un véhicule en mission ou en maintenance
 * aujourd'hui reste réservable pour plus tard.
 */
export function getReservationEligibility(input: ReservationEligibilityInput): {
    canReserve: boolean;
    /** Cause réellement bloquante. `null` ssi `canReserve`. */
    blockingReason: ReservationDenialReason | null;
} {
    const { vehicleType, userRoles, isDtView = false } = input;

    if (isDtView) return { canReserve: false, blockingReason: 'DT_VIEW' };

    // ADMIN : bypass du permis, parité avec `getBorrowEligibility` et avec la garde
    // serveur `canAccessAdminPanel` de la route de réservation.
    if (isAdminOrAbove(userRoles)) return { canReserve: true, blockingReason: null };

    const isCHVL = isChvlDriver(userRoles);
    const isCHVPSP = isChvpspDriver(userRoles);
    const isVpsp = isVpspVehicle(vehicleType);

    // Cascade identique à l'emprunt : cumuler CHVL et CHVPSP ouvre les deux types.
    const roleAllowed = (isCHVPSP && isVpsp) || (isCHVL && !isVpsp);
    if (!roleAllowed) {
        if (isVpsp && isCHVL) return { canReserve: false, blockingReason: 'VPSP_REQUIRES_CHVPSP' };
        if (!isVpsp && isCHVPSP) return { canReserve: false, blockingReason: 'VL_REQUIRES_CHVL' };
        return { canReserve: false, blockingReason: 'ROLE_NOT_ALLOWED' };
    }

    return { canReserve: true, blockingReason: null };
}

export type ReservationCtaState = 'LOADING' | 'NOMINAL' | 'NONE_ELIGIBLE' | 'LICENSE_BLOCKED';

/** Raisons agrégeables en message de CTA. `DT_VIEW` est exclu : la section retourne
 *  `null` en vue DT, la CTA n'est jamais rendue. */
type AggregableReason = Exclude<ReservationDenialReason, 'DT_VIEW'>;

/**
 * Libellés visibles par l'utilisateur. Figés : ils sont assertés littéralement
 * par les tests.
 */
export const RESERVATION_CTA_MESSAGES: Record<AggregableReason | 'EMPTY_FLEET' | 'LICENSE_BLOCKED', string> = {
    // Aligné sur le `title` du bouton « + Réserver » de `ReservationBlock`.
    LICENSE_BLOCKED: "Vos papiers n'ont pas été validés — réservation bloquée. Présentez vos papiers à votre DLUS/DLAS.",
    ROLE_NOT_ALLOWED: "Votre rôle ne vous permet pas de réserver de véhicule.",
    VPSP_REQUIRES_CHVPSP: 'Les seuls véhicules de votre UL sont des VPSP, réservés aux chauffeurs VPSP.',
    VL_REQUIRES_CHVL: 'Les seuls véhicules de votre UL sont des véhicules légers, réservés aux chauffeurs VL.',
    EMPTY_FLEET: "Aucun véhicule n'est rattaché à votre Unité Locale.",
};

/** Priorité d'agrégation quand plusieurs raisons cohabitent dans la flotte. */
const AGGREGATION_PRIORITY: AggregableReason[] = [
    'ROLE_NOT_ALLOWED',
    'VPSP_REQUIRES_CHVPSP',
    'VL_REQUIRES_CHVL',
];

/** État + raison agrégée de la CTA. Le `message` n'est jamais vide hors `LOADING`/`NOMINAL`. */
export function getReservationCtaState(args: {
    loading: boolean;
    eligibleCount: number;
    /** Papiers non validés hors délai de grâce (`GET /api/me/license-check`). */
    licenseBlocked: boolean;
    userRoles: string[];
    /** `blockingReason` de chaque véhicule non éligible, pour l'agrégation. */
    denialReasons: ReservationDenialReason[];
}): { state: ReservationCtaState; reason: ReservationDenialReason | null; message: string } {
    if (args.loading) return { state: 'LOADING', reason: null, message: '' };

    // Parité avec `ReservationBlock` : un gestionnaire (ADMIN et au-dessus) réserve
    // malgré ses propres papiers, puisqu'il réserve au nom d'autrui.
    if (args.licenseBlocked && !isAdminOrAbove(args.userRoles)) {
        return {
            state: 'LICENSE_BLOCKED',
            reason: null,
            message: RESERVATION_CTA_MESSAGES.LICENSE_BLOCKED,
        };
    }

    if (args.eligibleCount > 0) return { state: 'NOMINAL', reason: null, message: '' };

    const reason = AGGREGATION_PRIORITY.find(r => args.denialReasons.includes(r));
    if (!reason) {
        return { state: 'NONE_ELIGIBLE', reason: null, message: RESERVATION_CTA_MESSAGES.EMPTY_FLEET };
    }

    return { state: 'NONE_ELIGIBLE', reason, message: RESERVATION_CTA_MESSAGES[reason] };
}
