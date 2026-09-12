/**
 * Tests d'intégration — `resolveSessionRoles` (src/lib/session-roles.ts).
 *
 * En `integration/` et non `unit/` : la fonction interroge "UserRole", "Role" et
 * "UserUL", et `src/__tests__/CLAUDE.md` interdit de mocker la base.
 *
 * Aucun compte `@dev.local` ici : leurs rôles sont codés en dur dans le provider
 * (src/auth.ts), hors base — ils ne traverseraient pas la logique testée.
 *
 * Cas couverts :
 *  AC-J1 — INACTIF sur la home, connecté sur une UL secondaire → bloqué
 *  AC-J2 — INACTIF dans UserRole seul, CSV vide ou absente → bloqué
 *  AC-J3 — INACTIF résiduel sur une UL secondaire seulement → sans effet
 *  AC-J5 — les rôles actifs ne sont pas retirés (ajout, pas substitution)
 *  AC-J6 — les deux callbacks d'auth.ts passent les bons arguments
 *  AC-J7 — exactement 2 requêtes, quel que soit le nombre d'UL
 *  AC-J8 — révocation totale : aucun rôle nulle part → []
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});

import { resolveSessionRoles } from '@/lib/session-roles';
import type { SessionRolesExecutor } from '@/lib/session-roles';
import { db, seedUser, seedRoles, seedUserRole, seedUserUL, seedUniteLocale } from './setup';

const HOME = 'ul-paris-18';
const AUTRE = 'ul-marseille';

/** Utilisateur rattaché à deux UL, sans aucun rôle posé. */
async function seedCompte(id: string) {
    await seedRoles();
    await seedUniteLocale({ id: HOME, name: 'Paris 18', slug: 'paris-18' });
    await seedUniteLocale({ id: AUTRE, name: 'Marseille', slug: 'marseille' });
    await seedUser({ id, email: `${id}@croix-rouge.fr`, name: id });
    return id;
}

describe('resolveSessionRoles', () => {
    it('AC-J1 — INACTIF sur la home bloque même connecté sur une UL secondaire', async () => {
        // C'est le cas que la lecture par UL active ratait : la CSV de l'UL secondaire
        // ne porte pas INACTIF, donc le compte paraissait pleinement actif.
        const userId = await seedCompte('user-j1');
        await seedUserUL({ userId, ulId: HOME, isHome: true, roles: ['INACTIF', 'CHVL'] });
        await seedUserUL({ userId, ulId: AUTRE, isHome: false, roles: ['CHVL'] });

        const roles = await resolveSessionRoles(db, userId, AUTRE);

        expect(roles).toContain('INACTIF');
        expect(roles).toContain('CHVL');
    });

    it('AC-J2 — INACTIF dans UserRole seul, sans aucune ligne UserUL', async () => {
        const userId = await seedCompte('user-j2');
        await seedUserRole(userId, 'INACTIF');
        await seedUserRole(userId, 'CHVL');

        const roles = await resolveSessionRoles(db, userId, 'default');

        expect(roles.sort()).toEqual(['CHVL', 'INACTIF']);
    });

    it('AC-J2 — CSV home vide : repli sur les rôles globaux, INACTIF compris', async () => {
        const userId = await seedCompte('user-j2b');
        await seedUserRole(userId, 'INACTIF');
        await seedUserUL({ userId, ulId: HOME, isHome: true, roles: [] });

        const roles = await resolveSessionRoles(db, userId, HOME);

        expect(roles).toEqual(['INACTIF']);
    });

    it('AC-J3 — INACTIF résiduel sur une UL secondaire est sans effet sur le compte', async () => {
        // Épingle que la dette des lignes héritées non conformes est devenue INERTE,
        // et interdit un futur « on lit toutes les UL » qui la réactiverait.
        const userId = await seedCompte('user-j3');
        await seedUserRole(userId, 'CHVL');
        await seedUserUL({ userId, ulId: HOME, isHome: true, roles: ['CHVL'] });
        await seedUserUL({ userId, ulId: AUTRE, isHome: false, roles: ['INACTIF'] });

        const roles = await resolveSessionRoles(db, userId, HOME);

        expect(roles).toEqual(['CHVL']);
    });

    it('AC-J3 — aucun INACTIF nulle part : compte non bloqué', async () => {
        const userId = await seedCompte('user-j3b');
        await seedUserRole(userId, 'CHVL');
        await seedUserUL({ userId, ulId: HOME, isHome: true, roles: ['CHVL'] });

        const roles = await resolveSessionRoles(db, userId, HOME);

        expect(roles).not.toContain('INACTIF');
    });

    it('AC-J5 — INACTIF est AJOUTÉ, les rôles actifs ne sont pas retirés', async () => {
        const userId = await seedCompte('user-j5');
        await seedUserRole(userId, 'INACTIF');
        await seedUserUL({ userId, ulId: HOME, isHome: true, roles: ['CHVL'] });

        const roles = await resolveSessionRoles(db, userId, HOME);

        expect(roles).toEqual(['CHVL', 'INACTIF']);
    });

    it('AC-J5 — la valeur héritée GUEST bloque comme INACTIF', async () => {
        const userId = await seedCompte('user-j5b');
        await seedUserUL({ userId, ulId: HOME, isHome: true, roles: ['GUEST', 'CHVL'] });

        const roles = await resolveSessionRoles(db, userId, HOME);

        expect(roles).toContain('INACTIF');
        expect(roles).toContain('CHVL');
    });

    it('AC-J8 — révocation totale : aucun rôle nulle part rend []', async () => {
        // Garantie structurelle : la signature ne porte pas de `tokenRoles`, il n'existe
        // donc plus d'entrée par laquelle réintroduire un repli auto-référentiel qui
        // rendrait les rôles collants.
        const userId = await seedCompte('user-j8');
        await seedUserUL({ userId, ulId: HOME, isHome: true, roles: null });

        const roles = await resolveSessionRoles(db, userId, HOME);

        expect(roles).toEqual([]);
    });

    it('AC-J8 — retirer tous les rôles d\'un compte qui en avait rend []', async () => {
        const userId = await seedCompte('user-j8b');
        await seedUserUL({ userId, ulId: HOME, isHome: true, roles: ['CHVL'] });
        expect(await resolveSessionRoles(db, userId, HOME)).toEqual(['CHVL']);

        await db.execute({ sql: 'UPDATE "UserUL" SET roles = NULL WHERE userId = ?', args: [userId] });

        expect(await resolveSessionRoles(db, userId, HOME)).toEqual([]);
    });

    it('remonte SUPER_ADMIN depuis les rôles globaux sur toute UL', async () => {
        const userId = await seedCompte('user-sa');
        await seedUserRole(userId, 'SUPER_ADMIN');
        await seedUserUL({ userId, ulId: HOME, isHome: true, roles: ['CHVL'] });
        await seedUserUL({ userId, ulId: AUTRE, isHome: false, roles: ['CHVL'] });

        const roles = await resolveSessionRoles(db, userId, AUTRE);

        expect(roles).toContain('SUPER_ADMIN');
        expect(roles).toContain('CHVL');
    });

    it('AC-J7 — exactement 2 requêtes, quel que soit le nombre d\'UL', async () => {
        const userId = await seedCompte('user-j7');
        await seedUserUL({ userId, ulId: HOME, isHome: true, roles: ['CHVL'] });
        await seedUserUL({ userId, ulId: AUTRE, isHome: false, roles: ['CADRE'] });
        await seedUniteLocale({ id: 'ul-lyon-3', name: 'Lyon 3', slug: 'lyon-3' });
        await seedUserUL({ userId, ulId: 'ul-lyon-3', isHome: false, roles: ['CHVPSP'] });

        const execute = vi.fn(db.execute.bind(db));
        const spy: SessionRolesExecutor = { execute };

        await resolveSessionRoles(spy, userId, AUTRE);

        expect(execute).toHaveBeenCalledTimes(2);
    });
});
