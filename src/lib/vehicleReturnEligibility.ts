/**
 * Règle d'affichage front « quel véhicule puis-je rendre depuis le dashboard ».
 *
 * Pendant de `src/lib/vehicleBorrowEligibility.ts` pour la CTA « Rendre » de `/vehicles`.
 *
 * ⚠️ DIVERGENCE DÉLIBÉRÉE avec `src/app/vehicles/[id]/page.tsx:145` — ce n'est PAS une
 * duplication incohérente à « corriger ». Les deux règles répondent à deux questions
 * différentes :
 *
 *  - la **fiche véhicule** répond à « ai-je le droit de faire ce check-in ? ». Un ADMIN
 *    peut clore le trajet d'un tiers (véhicule rendu sans que le conducteur l'ait
 *    déclaré) : le bypass ADMIN y est légitime et NE DOIT PAS être retiré ;
 *  - la **CTA du dashboard** répond à « ai-je emprunté ce véhicule ? ». Appliquer la
 *    règle large ici listerait à un ADMIN toute la flotte en mission, transformant un
 *    raccourci personnel en outil d'administration — exactement ce que la CTA n'est pas.
 *
 * D'où : STRICTEMENT les trajets de l'utilisateur, aucun bypass de rôle.
 * L'ADMIN qui doit clore le trajet d'un tiers passe par la fiche du véhicule.
 */

/** Raison typée d'un refus de retour. */
export type ReturnDenialReason =
    | 'DT_VIEW'          // vue DT : read-only par contrat
    | 'NOT_IN_USE'       // statut ≠ IN_USE (AVAILABLE / MAINTENANCE)
    | 'NO_ACTIVE_TRIP'   // IN_USE mais aucun trajet ouvert projeté par la route de liste
    | 'NOT_MY_TRIP';     // trajet ouvert par quelqu'un d'autre

export interface ReturnEligibilityInput {
    vehicleStatus: string;
    /** Trajet ouvert du véhicule (`trips[0]` du payload de liste), ou `undefined`. */
    activeTrip: { driverEmail?: string | null; secondDriverEmail?: string | null } | undefined;
    currentUserEmail: string | null | undefined;
    isDtView?: boolean;  // défaut false
}

/**
 * Égalité d'identité stricte. Un email absent ou vide (`null`, `undefined`, `''`)
 * ne matche JAMAIS : sans cette garde, un trajet sans second conducteur serait
 * « le mien » pour un utilisateur dont la session n'expose pas d'email.
 */
function isSameUser(tripEmail: string | null | undefined, currentUserEmail: string | null | undefined): boolean {
    if (!tripEmail || !currentUserEmail) return false;
    return tripEmail === currentUserEmail;
}

/** Décision d'autorisation. `blockingReason` est `null` ssi `canReturn`. */
export function getReturnEligibility(input: ReturnEligibilityInput): {
    canReturn: boolean;
    blockingReason: ReturnDenialReason | null;
} {
    const { vehicleStatus, activeTrip, currentUserEmail, isDtView = false } = input;

    if (isDtView) return { canReturn: false, blockingReason: 'DT_VIEW' };
    if (vehicleStatus !== 'IN_USE') return { canReturn: false, blockingReason: 'NOT_IN_USE' };
    if (!activeTrip) return { canReturn: false, blockingReason: 'NO_ACTIVE_TRIP' };

    const isMine =
        isSameUser(activeTrip.driverEmail, currentUserEmail) ||
        isSameUser(activeTrip.secondDriverEmail, currentUserEmail);

    if (!isMine) return { canReturn: false, blockingReason: 'NOT_MY_TRIP' };

    return { canReturn: true, blockingReason: null };
}
