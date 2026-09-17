import { NextResponse } from 'next/server';
import { isSuperAdmin } from '@/lib/roles';

/**
 * Réponse 401 générique (pas de session active).
 * Corps canonique repris de src/app/api/CLAUDE.md — passer un message
 * uniquement pour les cas déjà spécifiques (ex. session invalide après impersonation).
 */
export function unauthorizedResponse(message = 'Non authentifié'): NextResponse {
    return NextResponse.json({ error: message }, { status: 401 });
}

/**
 * Réponse 403 générique (rôle insuffisant).
 * Corps canonique repris de src/app/api/CLAUDE.md — passer un message
 * pour les refus avec une raison métier précise (ex. "Seul un responsable peut...").
 */
export function forbiddenResponse(message = 'Interdit'): NextResponse {
    return NextResponse.json({ error: message }, { status: 403 });
}

/**
 * Cloisonnement UL : `true` si la session n'a PAS le droit d'agir sur une ressource
 * rattachée à `resourceUlId`.
 *
 * **Pourquoi un helper et non `session.user.ulId !== row.ulId` en ligne.** L'égalité
 * brute fait matcher deux sentinelles identiques : une session dont l'`ulId` est vide
 * ou épinglé au placeholder `'default'` « appartiendrait » à toute ressource portant la
 * même valeur. Le refus doit donc précéder la comparaison, et tenir à un seul endroit —
 * la version recopiée s'était déjà dégradée sur trois routes de maintenance.
 * Précédent : `api/vehicles/route.ts` refuse la même valeur avant de filtrer la liste.
 *
 * SUPER_ADMIN est exempté : son périmètre est multi-UL par définition.
 *
 * Le code de refus reste au choix de l'appelant : 403 quand l'existence de la ressource
 * est déjà connue de l'appelant (routes de maintenance, gardées par `isAdminOrAbove`),
 * 404 quand le refus doit être indiscernable d'un identifiant inconnu (`POST /api/trips`,
 * ouvert à tout compte authentifié — un 403 y serait un oracle d'état de flotte).
 */
export function isOutsideUl(
    roles: string[],
    sessionUlId: unknown,
    resourceUlId: unknown,
): boolean {
    if (isSuperAdmin(roles)) return false;
    if (!sessionUlId || sessionUlId === 'default') return true;
    return sessionUlId !== resourceUlId;
}
