/**
 * Contrôle de plausibilité du kilométrage saisi au retour d'un véhicule.
 *
 * Source de vérité UNIQUE, partagée par le front (modale de retour, formulaire QR)
 * et le serveur (routes de check-in application et QR). Ne jamais recopier le seuil,
 * l'arithmétique des jours ou le libellé d'erreur ailleurs : un écart de règle produit
 * un 400 inexplicable et un véhicule bloqué en `IN_USE`.
 *
 * Deux sévérités :
 *  - `negative`  — kilométrage retour < kilométrage départ : impossible, refus sec.
 *  - `excessive` — au-delà du plafond journalier : improbable, franchissable par confirmation.
 */

/** Plafond kilométrique par tranche de 24 h entamée. */
export const MAX_KM_PER_DAY = 150;

export type MileageAnomaly = 'negative' | 'excessive' | null;

/**
 * Nombre de jours facturés pour le calcul du plafond : `Math.max(1, Math.ceil(h / 24))`.
 *
 * Retourne `1` si `checkOutAt` est illisible. Cette garde est indispensable :
 * `Math.max(1, NaN) === NaN` (et non `1`), donc `delta > MAX_KM_PER_DAY * NaN` vaudrait
 * toujours `false` et désactiverait silencieusement le contrôle `excessive`.
 */
export function elapsedDays(checkOutAt: string | Date, now: Date = new Date()): number {
    const t = new Date(checkOutAt).getTime();
    if (!Number.isFinite(t)) return 1;
    const hours = (now.getTime() - t) / 3_600_000;
    return Math.max(1, Math.ceil(hours / 24));
}

/**
 * Libellé lisible de la durée RÉELLE écoulée depuis le départ (« 5 h », « 1 jour et 12 h »).
 *
 * N'utilise JAMAIS `elapsedDays` : afficher les jours facturés produirait « en 2 jours »
 * pour un emprunt de 36 h, ce qui décrédibilise l'alerte. Le plafond est affiché séparément.
 */
export function formatElapsed(checkOutAt: string | Date, now: Date = new Date()): string {
    const t = new Date(checkOutAt).getTime();
    if (!Number.isFinite(t)) return 'durée inconnue';
    const hours = Math.max(0, (now.getTime() - t) / 3_600_000);
    if (hours < 1) return 'moins d’une heure';
    if (hours < 24) return `${Math.floor(hours)} h`;
    const days = Math.floor(hours / 24);
    const rest = Math.floor(hours % 24);
    const label = days === 1 ? '1 jour' : `${days} jours`;
    return rest === 0 ? label : `${label} et ${rest} h`;
}

/**
 * Message d'erreur `negative`, littéral unique partagé front ↔ serveur.
 *
 * Nomme la conséquence (véhicule indisponible) et l'échappatoire (correction du
 * kilométrage de départ par un responsable), car le rôle CHVL n'a aucun moyen
 * de la déclencher lui-même.
 */
export function negativeMileageMessage(mileageOut: number): string {
    return `Le kilométrage retour ne peut pas être inférieur au kilométrage de départ `
        + `(${mileageOut.toLocaleString('fr-FR')} km). Le véhicule restera indisponible tant que le retour `
        + `n'est pas enregistré : contactez un responsable, qui peut corriger le kilométrage de départ `
        + `depuis la fiche du véhicule.`;
}

/**
 * Classe le kilométrage saisi au retour.
 *
 * `negative` est testé AVANT tout calcul de durée : c'est un invariant de données,
 * indépendant du temps écoulé.
 */
export function checkMileageAnomaly(
    mileageIn: number,
    mileageOut: number,
    checkOutAt: string | Date,
    now?: Date,
): MileageAnomaly {
    const delta = mileageIn - mileageOut;
    if (delta < 0) return 'negative';
    return delta > MAX_KM_PER_DAY * elapsedDays(checkOutAt, now) ? 'excessive' : null;
}

/**
 * Correction à l'emprunt (« le kilométrage est erroné ») inférieure au kilométrage connu.
 *
 * Légitime — corriger un compteur trop haut est précisément l'objet de la correction — mais
 * une faute de frappe (1 200 au lieu de 12 000) ferait reculer le compteur du véhicule.
 * Le serveur exige donc une confirmation explicite (`confirmMileageDecrease`) et répond
 * sinon 400 avec ce code ; le formulaire demande alors confirmation et renvoie.
 */
export const MILEAGE_DECREASE_CONFIRM_REQUIRED = 'MILEAGE_DECREASE_CONFIRM_REQUIRED';

/** Vrai si le kilométrage corrigé est inférieur au kilométrage connu. */
export function isMileageDecrease(correctedMileage: number, knownMileage: number): boolean {
    return correctedMileage < knownMileage;
}

/** Message de confirmation, littéral unique partagé front ↔ serveur. */
export function mileageDecreaseMessage(knownMileage: number, correctedMileage: number): string {
    return `Le kilométrage saisi (${correctedMileage.toLocaleString('fr-FR')} km) est inférieur au `
        + `kilométrage connu (${knownMileage.toLocaleString('fr-FR')} km) : le compteur du véhicule sera `
        + `corrigé à la baisse. Vérifiez la saisie.`;
}
