/**
 * Chauffeur non désigné sur une réservation.
 *
 * Il n'existe pas de colonne dédiée en base : une réservation « sans chauffeur »
 * se reconnaît à son `userName` sentinelle, tandis que son `userEmail` porte
 * l'email du RESPO/ADMIN qui l'a créée (voir
 * `src/app/api/vehicles/[id]/reservations/route.ts`).
 *
 * Conséquence métier : une telle réservation n'a PAS de détenteur opposable.
 * Elle ne bloque l'emprunt d'aucun chauffeur éligible — pas même au profit de
 * son créateur, qui n'est pas plus légitime qu'un autre à la consommer.
 */
export const UNASSIGNED_DRIVER_NAME = 'Chauffeur non décidé';

/** `true` si la réservation n'a pas de chauffeur désigné. */
export function isUnassignedDriverName(userName: string | null | undefined): boolean {
    return userName === UNASSIGNED_DRIVER_NAME;
}
