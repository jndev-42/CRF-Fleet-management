/**
 * Règle d'affichage front « qui peut emprunter quel véhicule ».
 *
 * Extraite de `src/app/vehicles/[id]/VehicleDetailHeader.tsx` pour être partagée
 * entre la page détail et la CTA d'emprunt rapide du dashboard `/vehicles`,
 * plutôt que dupliquée entre deux surfaces.
 *
 * ✅ Divergence front/serveur RÉSOLUE : le front suit désormais la règle serveur
 * canonique de `src/app/api/trips/route.ts` (garde de rôle). Un CHVPSP pur face à
 * un véhicule non-VPSP est refusé des deux côtés, et un SUPER_ADMIN pur est
 * autorisé des deux côtés.
 */
import { ROLES, isAdminOrAbove } from '@/lib/roles';

/** Raison typée d'un refus d'emprunt. */
export type BorrowDenialReason =
    | 'DT_VIEW'                 // vue DT : read-only par contrat
    | 'NOT_AVAILABLE'           // statut ≠ AVAILABLE (IN_USE / MAINTENANCE)
    | 'ROLE_NOT_ALLOWED'        // aucun rôle conducteur
    | 'VPSP_REQUIRES_CHVPSP'    // CHVL face à un véhicule VPSP
    | 'VL_REQUIRES_CHVL'        // CHVPSP pur face à un véhicule non-VPSP
    | 'RESERVED_BY_OTHER'       // réservation VALIDATED active détenue par un tiers
    | 'LICENSE_BLOCKED';        // papiers non validés hors délai de grâce

export interface BorrowEligibilityInput {
    vehicleStatus: string;      // 'AVAILABLE' | 'IN_USE' | 'MAINTENANCE'
    vehicleType: string;        // VPSP si `.toUpperCase().includes('VPSP')`
    userRoles: string[];        // session.user.roles
    isReservedByOther: boolean;
    licenseBlocked: boolean;    // GET /api/me/license-check → blocked
    isDtView?: boolean;         // défaut false
}

/** `type.toUpperCase().includes('VPSP')` */
export function isVpspVehicle(vehicleType: string): boolean {
    return vehicleType.toUpperCase().includes('VPSP');
}

/** Bypass administrateur de l'emprunt. Suit la règle serveur (`isAdminOrAbove`). */
function isAdminForBorrow(userRoles: string[]): boolean {
    return isAdminOrAbove(userRoles);
}

/**
 * Décision d'autorisation. Ordre RÔLE-first.
 * Le bloc rôle est la transposition exacte de la cascade serveur
 * (`src/app/api/trips/route.ts`) : ADMIN, puis `CHVPSP && VPSP`, puis `CHVL && !VPSP`.
 */
export function getBorrowEligibility(input: BorrowEligibilityInput): {
    canBorrow: boolean;
    /** Cause réellement bloquante. `null` ssi `canBorrow`. */
    blockingReason: BorrowDenialReason | null;
} {
    const {
        vehicleStatus,
        vehicleType,
        userRoles,
        isReservedByOther,
        licenseBlocked,
        isDtView = false,
    } = input;

    if (isDtView) return { canBorrow: false, blockingReason: 'DT_VIEW' };
    if (vehicleStatus !== 'AVAILABLE') return { canBorrow: false, blockingReason: 'NOT_AVAILABLE' };

    // ADMIN : bypass réservation + permis (parité VehicleDetailHeader.tsx:92,96,100)
    if (isAdminForBorrow(userRoles)) return { canBorrow: true, blockingReason: null };

    const isCHVL = userRoles.includes(ROLES.CHVL);
    const isCHVPSP = userRoles.includes(ROLES.CHVPSP);
    const isVpsp = isVpspVehicle(vehicleType);

    // Cascade serveur : un utilisateur cumulant CHVL et CHVPSP passe sur les deux types.
    const roleAllowed = (isCHVPSP && isVpsp) || (isCHVL && !isVpsp);
    if (!roleAllowed) {
        if (isVpsp && isCHVL) return { canBorrow: false, blockingReason: 'VPSP_REQUIRES_CHVPSP' };
        if (!isVpsp && isCHVPSP) return { canBorrow: false, blockingReason: 'VL_REQUIRES_CHVL' };
        return { canBorrow: false, blockingReason: 'ROLE_NOT_ALLOWED' };
    }

    if (isReservedByOther) return { canBorrow: false, blockingReason: 'RESERVED_BY_OTHER' };
    if (licenseBlocked) return { canBorrow: false, blockingReason: 'LICENSE_BLOCKED' };

    return { canBorrow: true, blockingReason: null };
}

/**
 * Texte de l'attribut `title`. Cascade LICENCE-first — fidèle à `titleAttr`
 * (VehicleDetailHeader.tsx:104-113). Retourne `''` si l'emprunt est autorisé.
 *
 * NE PAS dériver de `blockingReason` : les deux cascades ont des ordres d'évaluation
 * distincts et incompatibles. Contre-exemple : rôles `['CI/RPAPS']` sur un VL disponible
 * réservé par un tiers → `blockingReason` vaut `ROLE_NOT_ALLOWED` (la réservation n'est
 * jamais évaluée) alors que le `title` d'origine annonce la réservation.
 */
export function getBorrowDenialTitle(input: BorrowEligibilityInput): string {
    const { canBorrow } = getBorrowEligibility(input);
    if (canBorrow) return '';

    const isAdmin = isAdminForBorrow(input.userRoles);
    if (input.licenseBlocked && !isAdmin) {
        return "Vos papiers n'ont pas été validés — emprunt bloqué.";
    }
    if (input.isReservedByOther && !isAdmin) {
        return "Ce véhicule est actuellement réservé par quelqu'un d'autre.";
    }
    return "Vous n'avez pas les droits pour emprunter ce véhicule";
}

export type BorrowCtaState = 'LOADING' | 'NOMINAL' | 'NONE_ELIGIBLE' | 'LICENSE_BLOCKED';

/** Raisons pouvant être agrégées en message de CTA. `DT_VIEW` est exclu : la section
 *  retourne `null` en vue DT, la CTA n'est jamais rendue. */
type AggregableReason = Exclude<BorrowDenialReason, 'DT_VIEW'>;

/**
 * Libellés visibles par l'utilisateur sur la CTA. Figés au même titre que les trois
 * chaînes de `title` : ils sont assertés littéralement par les tests.
 */
export const BORROW_CTA_MESSAGES: Record<AggregableReason | 'EMPTY_FLEET', string> = {
    NOT_AVAILABLE: "Aucun véhicule n'est disponible pour le moment.",
    // Aligné sur LicenseBanner.tsx:64-65
    LICENSE_BLOCKED: "Vos papiers n'ont pas été validés dans les délais — emprunt impossible. Présentez vos papiers à votre DLUS/DLAS.",
    ROLE_NOT_ALLOWED: "Votre rôle ne vous permet pas d'emprunter de véhicule.",
    VPSP_REQUIRES_CHVPSP: 'Les seuls véhicules disponibles sont des VPSP, réservés aux chauffeurs VPSP.',
    VL_REQUIRES_CHVL: 'Les seuls véhicules disponibles sont des véhicules légers, réservés aux chauffeurs VL.',
    RESERVED_BY_OTHER: "Tous les véhicules disponibles sont réservés par quelqu'un d'autre.",
    EMPTY_FLEET: "Aucun véhicule n'est rattaché à votre Unité Locale.",
};

/** Priorité d'agrégation quand plusieurs raisons cohabitent dans la flotte. */
const AGGREGATION_PRIORITY: AggregableReason[] = [
    // Inatteignable en l'état, conservée à dessein comme garde-fou : un véhicule ne
    // porte `LICENSE_BLOCKED` que si `licenseBlocked` est vrai, or `getBorrowCtaState`
    // court-circuite alors en état `LICENSE_BLOCKED` avant d'atteindre l'agrégation
    // (l'ADMIN, seul à échapper à ce court-circuit, n'obtient jamais ce
    // `blockingReason`). Retirer l'entrée ferait silencieusement retomber la CTA sur
    // `EMPTY_FLEET` si cet ordre changeait un jour.
    'LICENSE_BLOCKED',
    'ROLE_NOT_ALLOWED',
    'VPSP_REQUIRES_CHVPSP',
    'VL_REQUIRES_CHVL',
    'NOT_AVAILABLE',
    'RESERVED_BY_OTHER',
];

/** État + raison agrégée de la CTA. Le `message` n'est jamais vide en `NONE_ELIGIBLE`. */
export function getBorrowCtaState(args: {
    loading: boolean;
    eligibleCount: number;
    licenseBlocked: boolean;
    userRoles: string[];
    /** `blockingReason` de chaque véhicule non éligible, pour l'agrégation */
    denialReasons: BorrowDenialReason[];
}): { state: BorrowCtaState; reason: BorrowDenialReason | null; message: string } {
    if (args.loading) return { state: 'LOADING', reason: null, message: '' };

    if (args.licenseBlocked && !isAdminForBorrow(args.userRoles)) {
        return {
            state: 'LICENSE_BLOCKED',
            reason: 'LICENSE_BLOCKED',
            message: BORROW_CTA_MESSAGES.LICENSE_BLOCKED,
        };
    }

    if (args.eligibleCount > 0) return { state: 'NOMINAL', reason: null, message: '' };

    // Flotte vide (UL neuve, ou échec du fetch principal avalé en console.error) :
    // aucune raison disponible, mais la CTA doit tout de même expliquer son refus.
    const reason = AGGREGATION_PRIORITY.find(r => args.denialReasons.includes(r));
    if (!reason) {
        return { state: 'NONE_ELIGIBLE', reason: null, message: BORROW_CTA_MESSAGES.EMPTY_FLEET };
    }

    return { state: 'NONE_ELIGIBLE', reason, message: BORROW_CTA_MESSAGES[reason] };
}
