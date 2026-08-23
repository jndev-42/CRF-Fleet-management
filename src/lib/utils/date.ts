/**
 * Formatage des dates calendaires (yyyy-MM-dd) sans conversion de fuseau horaire.
 *
 * `new Date('2026-03-12')` est interprété comme minuit UTC : un `toLocaleDateString`
 * sur un serveur en fuseau négatif renverrait « 11/03/2026 ». Une date de mission est
 * une date calendaire pure, sans heure — on la formate donc directement depuis la chaîne.
 */

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Convertit `2026-03-12` en `12/03/2026`. Renvoie l'entrée telle quelle si le format diffère. */
export function formatIsoDayFr(isoDay: string): string {
    const match = ISO_DAY.exec(isoDay);
    if (!match) return isoDay;
    const [, year, month, day] = match;
    return `${day}/${month}/${year}`;
}
