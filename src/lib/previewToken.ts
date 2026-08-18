import { isPreview } from '@/lib/env';

/**
 * Compte preview fixe qu'incarne le token de test (voir src/lib/preview-accounts.ts).
 * Un seul rôle livré pour l'instant (CHVL) — le token pourrait être étendu à
 * d'autres identités preview plus tard si le besoin apparaît.
 */
export const PREVIEW_TEST_USER_EMAIL = 'preview-chvl@preview.local';

/**
 * Vrai uniquement si :
 *  1. on est en environnement preview (`isPreview`, garde en dur — indépendante
 *     de la variable ci-dessous, donc morte en production même si le secret fuite) ;
 *  2. `PREVIEW_TEST_TOKEN` est configurée (fail-closed si absente — contrairement
 *     au pattern `CRON_SECRET` existant dans
 *     src/app/api/cron/daily-mileage-check/route.ts, qui fail-open si la variable
 *     n'est pas définie ; ne pas reproduire ce comportement ici) ;
 *  3. le header `Authorization: Bearer <token>` correspond exactement au secret.
 */
export function isValidPreviewTestToken(authHeader: string | null | undefined): boolean {
    if (!isPreview) return false;
    const secret = process.env.PREVIEW_TEST_TOKEN;
    if (!secret) return false;
    if (!authHeader?.startsWith('Bearer ')) return false;
    return authHeader.slice(7) === secret;
}
