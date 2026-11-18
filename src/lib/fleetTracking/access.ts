import { NextResponse } from 'next/server';
import type { Session } from 'next-auth';
import { z } from 'zod';
import { auth } from '@/auth';
import { canManageVehicles } from '@/lib/roles';
import { forbiddenResponse, isOutsideUl, unauthorizedResponse } from '@/lib/apiAuth';

/**
 * Garde commune des routes `/api/fleet-tracking/*` (suivi technique) :
 *   - pas de session → 401 ;
 *   - pas `canManageVehicles` (INACTIF inclus) → 403 ;
 *   - pas d'UL active réelle (absente ou sentinelle `'default'`) → 400.
 *
 * L'UL est TOUJOURS celle de la session, jamais une valeur fournie par le client.
 */
export type FleetAccess =
    | { ok: true; session: Session; roles: string[]; ulId: string; userId: string | null }
    | { ok: false; response: NextResponse };

export async function requireFleetManager(): Promise<FleetAccess> {
    const session = await auth();
    if (!session?.user) return { ok: false, response: unauthorizedResponse() };
    const roles = session.user.roles || [];
    if (!canManageVehicles(roles)) return { ok: false, response: forbiddenResponse() };
    const ulId = activeUlId(session.user.ulId);
    if (!ulId) {
        return { ok: false, response: NextResponse.json({ error: 'Aucune unité locale active' }, { status: 400 }) };
    }
    // Trace d'auteur seulement (jamais une clé de droit) : id de session, à défaut l'e-mail.
    const userId = session.user.id || session.user.email || null;
    return { ok: true, session, roles, ulId, userId };
}

/**
 * Une ressource du module appartient-elle à l'UL de la session ? Seule l'UL
 * propriétaire modifie : la comparaison stricte à l'UL de session s'ajoute à
 * `isOutsideUl`, qui exempte le SUPER_ADMIN — un SUPER_ADMIN agit ici comme un
 * responsable de son UL active.
 */
export function ownsResource(access: { roles: string[]; ulId: string }, resourceUlId: unknown): boolean {
    return !isOutsideUl(access.roles, access.ulId, resourceUlId) && resourceUlId === access.ulId;
}

/** UL active réelle de la session, ou `null` (absente ou sentinelle `'default'`). */
export function activeUlId(ulId: unknown): string | null {
    return typeof ulId === 'string' && ulId !== '' && ulId !== 'default' ? ulId : null;
}

/**
 * Lit et valide le corps JSON. Renvoie la donnée typée, ou la réponse 400 à
 * retourner telle quelle (JSON illisible ou schéma non respecté).
 */
export async function parseBody<T extends z.ZodType>(
    request: Request,
    schema: T,
): Promise<{ data: z.infer<T> } | { response: NextResponse }> {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return { response: NextResponse.json({ error: 'Corps invalide' }, { status: 400 }) };
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
        const message = parsed.error.issues[0]?.message;
        return {
            response: NextResponse.json(
                { error: message ? `Données invalides : ${message}` : 'Données invalides', details: parsed.error.issues },
                { status: 400 },
            ),
        };
    }
    return { data: parsed.data };
}
