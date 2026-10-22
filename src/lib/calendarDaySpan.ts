/**
 * Découpage par jour d'un événement du calendrier véhicules (réservation, emprunt terminé).
 *
 * Tout se calcule en heure LOCALE du navigateur (Europe/Paris) : les bornes de jour viennent
 * de `setHours(0, 0, 0, 0)` et la comparaison de jours de `getFullYear/getMonth/getDate`,
 * ce qui reste juste les jours de changement d'heure (journées de 23 h ou 25 h).
 */

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function formatHour(d: Date): string {
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * L'événement [start, end] occupe-t-il le jour [dayStart, dayEnd] ?
 * La fin est exclusive : un événement qui finit pile à 00:00 n'apparaît pas sur le jour
 * qui commence à cette minute. Un événement de durée nulle reste visible sur son jour.
 */
export function overlapsDay(start: Date, end: Date, dayStart: Date, dayEnd: Date): boolean {
  return start <= dayEnd && (end > dayStart || start >= dayStart);
}

/**
 * Libellé horaire d'un événement dans la case du jour `day` :
 * - même jour de début et de fin : « 07:00 → 18:00 » ;
 * - premier jour : « 07:00 → » ;
 * - dernier jour : « → 07:00 » (heure de fin) ;
 * - jour intermédiaire : « Journée ».
 * Une fin pile à 00:00 appartient à la veille (cf. `overlapsDay`) : « 07:00 → 00:00 ».
 */
export function getDaySpanLabel(start: Date, end: Date, day: Date): string {
  const lastInstant = end > start ? new Date(end.getTime() - 1) : end;
  const startsToday = isSameLocalDay(start, day);
  const endsToday = isSameLocalDay(lastInstant, day);
  if (startsToday && endsToday) {
    return end > start ? `${formatHour(start)} → ${formatHour(end)}` : formatHour(start);
  }
  if (startsToday) return `${formatHour(start)} →`;
  if (endsToday) return `→ ${formatHour(end)}`;
  return 'Journée';
}
