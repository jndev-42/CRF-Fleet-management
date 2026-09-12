/**
 * Tests unitaires — `authConfig.callbacks.authorized` (src/auth.config.ts).
 *
 * Le callback est une fonction pure : il ne lit ni la base ni le réseau, on peut donc
 * l'appeler directement avec une session et une URL factices, sans harnais middleware.
 *
 * Enjeu couvert : la dominance d'INACTIF doit être la MÊME au middleware et dans les
 * routes API. Sous l'ancienne formule (`every`), un compte `['INACTIF','CHVL']` passait
 * le middleware puis se faisait refuser en 403 par l'API — la page se chargeait avant
 * d'afficher « Compte inactif ».
 */
import { describe, it, expect } from 'vitest';
import { authConfig } from '@/auth.config';

const authorized = authConfig.callbacks?.authorized;
if (!authorized) {
    throw new Error('authConfig.callbacks.authorized doit être défini');
}
const authorizedFn: NonNullable<NonNullable<typeof authConfig.callbacks>['authorized']> = authorized;

type AuthorizedArgs = Parameters<typeof authorizedFn>[0];

/** Appelle le callback avec une session porteuse de `roles` sur le chemin demandé. */
function callAuthorized(roles: string[] | undefined, pathname: string) {
    const args = {
        auth: roles === undefined ? null : { user: { roles } },
        request: { nextUrl: new URL(`http://localhost${pathname}`) },
    };
    return authorizedFn(args as unknown as AuthorizedArgs);
}

/** Vrai si le callback a répondu par une redirection vers `target`. */
function isRedirectTo(result: unknown, target: string): boolean {
    if (!(result instanceof Response)) return false;
    const location = result.headers.get('location');
    return !!location && new URL(location).pathname === target;
}

describe('authConfig.callbacks.authorized — dominance d\'INACTIF', () => {
    it('redirige vers /inactif une session INACTIF seule', async () => {
        expect(isRedirectTo(await callAuthorized(['INACTIF'], '/vehicles'), '/inactif')).toBe(true);
    });

    it('redirige vers /inactif une session cumulant INACTIF et un rôle actif', async () => {
        // AC-E2 — c'est le cas que `every` laissait passer.
        expect(isRedirectTo(await callAuthorized(['INACTIF', 'CHVL'], '/vehicles'), '/inactif')).toBe(true);
        expect(isRedirectTo(await callAuthorized(['CHVL', 'INACTIF'], '/vehicles'), '/inactif')).toBe(true);
    });

    it('laisse passer une session active', async () => {
        expect(await callAuthorized(['CHVL'], '/vehicles')).toBe(true);
    });

    it('laisse passer une session sans aucun rôle — la garde de la liste vide reste hors middleware', async () => {
        // Voulu : l'accès QR est ouvert aux comptes sans rôle (isQrBlocked([]) === false).
        expect(await callAuthorized([], '/qr/abc')).toBe(true);
    });

    it('renvoie un compte actif hors de /inactif', async () => {
        expect(isRedirectTo(await callAuthorized(['CHVL'], '/inactif'), '/')).toBe(true);
    });

    it('laisse un compte INACTIF consulter /inactif', async () => {
        expect(await callAuthorized(['INACTIF', 'CHVL'], '/inactif')).toBe(true);
    });

    it('refuse un visiteur non connecté', async () => {
        expect(await callAuthorized(undefined, '/vehicles')).toBe(false);
    });
});
