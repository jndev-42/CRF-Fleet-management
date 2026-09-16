/**
 * Prédicat de clôture d'une maintenance — partagé par le serveur (gardes PATCH/DELETE
 * de `api/vehicles/[id]/maintenance-events/[eventId]`) et par l'UI du calendrier.
 * Le factoriser ici garantit que les deux ne peuvent pas diverger.
 *
 * Complément exact des prédicats SQL « maintenance active » de
 * `src/app/api/vehicles/[id]/route.ts:88-96` et `src/app/api/vehicles/route.ts:95-99` :
 * une maintenance date-seule finissant aujourd'hui reste éditable.
 *
 * ⚠️ FUSEAU HORAIRE — les deux branches comparent en **UTC** (`toISOString()`).
 * En `Europe/Paris`, une maintenance date-seule finissant « hier en local » reste donc
 * éditable 1 à 2 h de plus. Ce décalage est **identique à celui du SQL existant** cité
 * ci-dessus : il est intentionnellement conservé pour rester cohérent avec lui.
 * Ne pas le « corriger » isolément — cela désynchroniserait ce prédicat des requêtes.
 *
 * Ce module ne vit pas dans `src/lib/maintenanceUtils.ts` : celui-ci porte le domaine
 * révision / contrôle technique (`getNextCtDate`, `getNextRevision`), distinct.
 */

/** Une maintenance est close ssi elle porte une date de fin déjà passée. */
export function isMaintenanceClosed(endDate: string | null | undefined, now: Date = new Date()): boolean {
    // Fin nulle ou vide = fin inconnue : la maintenance n'est pas terminée.
    if (!endDate) return false;

    const nowISO = now.toISOString();
    return endDate.includes('T')
        ? endDate <= nowISO
        : endDate < nowISO.split('T')[0];
}

/** Inverse lisible, consommé par l'UI du calendrier. */
export function isMaintenanceEditable(endDate: string | null | undefined, now?: Date): boolean {
    return !isMaintenanceClosed(endDate, now);
}
