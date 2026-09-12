/**
 * Tests d'intégration — PUT /api/users/[email]/ul
 *
 * Cette route n'avait aucun test d'intégration. Elle est pourtant le seul chemin
 * d'écriture de la CSV `UserUL.roles`, et celui par lequel des lignes non conformes
 * (INACTIF posé hors UL de rattachement) ont pu entrer en base.
 *
 * Règle couverte (Question F) : INACTIF/GUEST ne s'attribuent que sur l'UL de
 * rattachement (`is_home = 1`). Seules les entrées NOUVELLES ou MODIFIÉES sont
 * contrôlées — valider en bloc rendrait tout compte porteur d'une ligne héritée non
 * conforme définitivement non modifiable, y compris par le geste qui la corrigerait.
 *
 * Cas couverts : AC-F1 → AC-F6, AC-F8.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { PUT } from '@/app/api/users/[email]/ul/route';
import { auth } from '@/auth';
import { db, seedUser, seedRoles, seedUniteLocale, seedUserUL } from './setup';

const mockedAuth = vi.mocked(auth);

const HOME = 'ul-paris-18';
const AUTRE = 'ul-marseille';

/** Session type-erased : `auth()` renvoie une Session complète en production. */
function asSession(user: Record<string, unknown>) {
    return { user } as never;
}

const superAdminSession = asSession({ email: 'sa@test.com', roles: ['SUPER_ADMIN'], ulId: HOME });

function makePutRequest(email: string, uls: { ulId: string; isHome: boolean; roles: string[] }[]): Request {
    return new Request(`http://localhost/api/users/${encodeURIComponent(email)}/ul`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uls }),
    });
}

function callPut(email: string, uls: { ulId: string; isHome: boolean; roles: string[] }[]) {
    return PUT(makePutRequest(email, uls), { params: Promise.resolve({ email }) });
}

/** Photographie des lignes UserUL, pour prouver qu'un refus n'a rien écrit. */
async function snapshotUserUL(userId: string) {
    const res = await db.execute({
        sql: `SELECT ulId, is_home, roles FROM "UserUL" WHERE userId = ? ORDER BY ulId`,
        args: [userId],
    });
    return res.rows.map(r => ({ ulId: r.ulId, isHome: r.is_home, roles: r.roles }));
}

beforeEach(async () => {
    await seedRoles();
    await seedUniteLocale({ id: HOME, name: 'Paris 18', slug: 'paris-18' });
    await seedUniteLocale({ id: AUTRE, name: 'Marseille', slug: 'marseille' });
    mockedAuth.mockResolvedValue(superAdminSession);
});

describe('PUT /api/users/[email]/ul — INACTIF restreint à l\'UL de rattachement', () => {
    it('AC-F1 — refuse INACTIF sur une entrée non-home, en 400, SANS rien écrire', async () => {
        const user = await seedUser({ id: 'u-f1', email: 'f1@test.com', name: 'F1' });
        await seedUserUL({ userId: user.id, ulId: HOME, isHome: true, roles: ['CHVL'] });
        const before = await snapshotUserUL(user.id);

        const res = await callPut(user.email, [
            { ulId: HOME, isHome: true, roles: ['CHVL'] },
            { ulId: AUTRE, isHome: false, roles: ['INACTIF'] },
        ]);

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/unité locale de rattachement/i);

        // Le refus doit précéder l'ouverture de la transaction : rien n'a bougé.
        expect(await snapshotUserUL(user.id)).toEqual(before);
    });

    it('AC-F2 — refuse aussi la valeur héritée GUEST', async () => {
        const user = await seedUser({ id: 'u-f2', email: 'f2@test.com', name: 'F2' });
        await seedUserUL({ userId: user.id, ulId: HOME, isHome: true, roles: ['CHVL'] });

        const res = await callPut(user.email, [
            { ulId: HOME, isHome: true, roles: ['CHVL'] },
            { ulId: AUTRE, isHome: false, roles: ['GUEST'] },
        ]);

        expect(res.status).toBe(400);
    });

    it('AC-F8 — l\'ordre des rôles dans le payload ne change rien', async () => {
        const user = await seedUser({ id: 'u-f8', email: 'f8@test.com', name: 'F8' });
        await seedUserUL({ userId: user.id, ulId: HOME, isHome: true, roles: ['CHVL'] });

        for (const roles of [['CHVL', 'INACTIF'], ['INACTIF', 'CHVL']]) {
            const res = await callPut(user.email, [
                { ulId: HOME, isHome: true, roles: ['CHVL'] },
                { ulId: AUTRE, isHome: false, roles },
            ]);
            expect(res.status, `roles=${roles.join('+')}`).toBe(400);
        }
    });

    it('AC-F3 — accepte INACTIF sur l\'UL de rattachement et synchronise UserRole', async () => {
        const user = await seedUser({ id: 'u-f3', email: 'f3@test.com', name: 'F3' });
        await seedUserUL({ userId: user.id, ulId: HOME, isHome: true, roles: ['CHVL'] });

        const res = await callPut(user.email, [
            { ulId: HOME, isHome: true, roles: ['CHVL', 'INACTIF'] },
        ]);
        expect(res.status).toBe(200);

        const rows = await snapshotUserUL(user.id);
        expect(rows).toHaveLength(1);
        expect((rows[0].roles as string).split(',').sort()).toEqual(['CHVL', 'INACTIF']);

        const globalRes = await db.execute({
            sql: `SELECT r.name FROM "UserRole" ur JOIN "Role" r ON ur.roleId = r.id WHERE ur.userId = ?`,
            args: [user.id],
        });
        expect(globalRes.rows.map(r => r.name as string).sort()).toEqual(['CHVL', 'INACTIF']);
    });

    it('AC-F5 — un compte porteur d\'une ligne héritée non conforme RESTE modifiable', async () => {
        // Non-régression du verrouillage : c'est l'assertion qui distingue la validation
        // « entrées nouvelles ou modifiées » d'une validation en bloc.
        const user = await seedUser({ id: 'u-f5', email: 'f5@test.com', name: 'F5' });
        await seedUserUL({ userId: user.id, ulId: HOME, isHome: true, roles: ['CHVL'] });
        await seedUserUL({ userId: user.id, ulId: AUTRE, isHome: false, roles: ['INACTIF'] });

        const res = await callPut(user.email, [
            { ulId: HOME, isHome: true, roles: ['CHVL', 'CADRE'] },
            { ulId: AUTRE, isHome: false, roles: ['INACTIF'] },   // reconduite à l'identique
        ]);

        expect(res.status).toBe(200);
        const rows = await snapshotUserUL(user.id);
        expect(rows.find(r => r.ulId === AUTRE)?.roles).toBe('INACTIF');
    });

    it('AC-F5 — une entrée héritée reconduite dans un ORDRE différent reste exemptée', async () => {
        // `existingMap` lit une CSV dont l'ordre n'est pas garanti stable : une
        // comparaison positionnelle rejetterait à tort.
        const user = await seedUser({ id: 'u-f5b', email: 'f5b@test.com', name: 'F5b' });
        await seedUserUL({ userId: user.id, ulId: HOME, isHome: true, roles: ['CHVL'] });
        await seedUserUL({ userId: user.id, ulId: AUTRE, isHome: false, roles: ['INACTIF', 'CHVL'] });

        const res = await callPut(user.email, [
            { ulId: HOME, isHome: true, roles: ['CHVL'] },
            { ulId: AUTRE, isHome: false, roles: ['CHVL', 'INACTIF'] },
        ]);

        expect(res.status).toBe(200);
    });

    it('AC-F6 — retirer INACTIF d\'une ligne non-home est accepté (chemin de nettoyage)', async () => {
        const user = await seedUser({ id: 'u-f6', email: 'f6@test.com', name: 'F6' });
        await seedUserUL({ userId: user.id, ulId: HOME, isHome: true, roles: ['CHVL'] });
        await seedUserUL({ userId: user.id, ulId: AUTRE, isHome: false, roles: ['INACTIF', 'CHVL'] });

        const res = await callPut(user.email, [
            { ulId: HOME, isHome: true, roles: ['CHVL'] },
            { ulId: AUTRE, isHome: false, roles: ['CHVL'] },
        ]);

        expect(res.status).toBe(200);
        const rows = await snapshotUserUL(user.id);
        expect(rows.find(r => r.ulId === AUTRE)?.roles).toBe('CHVL');
    });

    it('AC-F4 — un admin d\'UL ne peut pas contourner via sa propre UL', async () => {
        // Le seul levier d'un admin local est l'entrée de son UL, dont `isHome` est
        // forcé à false quand la home du compte est ailleurs : l'entrée est donc bien
        // « modifiée » et bien contrôlée. Sans cette assertion, une validation limitée
        // au seul payload paraîtrait suffisante.
        const user = await seedUser({ id: 'u-f4', email: 'f4@test.com', name: 'F4' });
        await seedUserUL({ userId: user.id, ulId: AUTRE, isHome: true, roles: ['CHVL'] });

        mockedAuth.mockResolvedValue(asSession({ email: 'localadmin@test.com', roles: ['ADMIN'], ulId: HOME }));

        const res = await callPut(user.email, [
            { ulId: HOME, isHome: true, roles: ['INACTIF'] },
        ]);

        expect(res.status).toBe(400);
        const rows = await snapshotUserUL(user.id);
        expect(rows).toHaveLength(1);
        expect(rows[0].ulId).toBe(AUTRE);
    });

    it('normalise GUEST → INACTIF sur la ligne home (resolveRoles appliqué à l\'écriture)', async () => {
        // Seul des trois chemins d'écriture à ne pas normaliser jusqu'ici.
        const user = await seedUser({ id: 'u-norm', email: 'norm@test.com', name: 'Norm' });
        await seedUserUL({ userId: user.id, ulId: HOME, isHome: true, roles: ['CHVL'] });

        const res = await callPut(user.email, [
            { ulId: HOME, isHome: true, roles: ['GUEST', 'CHVL'] },
        ]);

        expect(res.status).toBe(200);
        const rows = await snapshotUserUL(user.id);
        expect((rows[0].roles as string).split(',').sort()).toEqual(['CHVL', 'INACTIF']);
    });
});
