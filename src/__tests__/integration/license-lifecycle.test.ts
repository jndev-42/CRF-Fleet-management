/**
 * Cycle de vie des papiers selon le rôle chauffeur (CHVL / CHVPSP) :
 * `holdsDriverRole`, `applyDriverRoleTransition` et les routes qui modifient les rôles
 * (création, édition globale, édition par UL, retrait d'une UL).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/auth';
import { POST } from '@/app/api/users/route';
import { PATCH } from '@/app/api/users/[email]/route';
import { PUT as PUT_UL, PATCH as PATCH_UL } from '@/app/api/users/[email]/ul/route';
import { holdsDriverRole, applyDriverRoleTransition } from '@/lib/licenseLifecycle';
import { db, seedUser, seedRoles, seedUserRole, seedUniteLocale, seedUserUL } from './setup';

const mockedAuth = vi.mocked(auth);
const UL = 'ul-paris-18';
const TODAY = new Date().toISOString().slice(0, 10);

const VALIDATED = { papiers_valides: 1, last_validation: '2026-11-11', start_date_invalidation_process: null };

function json(method: string, body: unknown): Request {
    return new Request('http://localhost/api/x', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

async function papers(id: string) {
    const r = (await db.execute({
        sql: `SELECT papiers_valides, last_validation, start_date_invalidation_process FROM "User" WHERE id = ?`,
        args: [id],
    })).rows[0];
    return {
        papiers_valides: Number(r.papiers_valides),
        last_validation: r.last_validation as string | null,
        start: r.start_date_invalidation_process as string | null,
    };
}

const CLEARED = { papiers_valides: 0, last_validation: null, start: null };
const GRACE_TODAY = { papiers_valides: 0, last_validation: null, start: TODAY };

const patchGlobal = (email: string, roles: string[]) =>
    PATCH(json('PATCH', { roles }), { params: Promise.resolve({ email }) });
const putUl = (email: string, uls: { ulId: string; isHome: boolean; roles: string[] }[]) =>
    PUT_UL(json('PUT', { uls }), { params: Promise.resolve({ email }) });

beforeEach(async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'sa', email: 'sa@test.com', roles: ['SUPER_ADMIN'], ulId: UL } } as never);
    await seedRoles();
    await seedUniteLocale({ id: UL });
});

describe('holdsDriverRole', () => {
    it('faux sans rôle chauffeur', async () => {
        await seedUser({ id: 'u1', email: 'u1@test.com' });
        await seedUserRole('u1', 'ADMIN');
        expect(await holdsDriverRole(db, 'u1')).toBe(false);
    });

    it('vrai avec CHVL ou CHVPSP dans UserRole', async () => {
        await seedUser({ id: 'u1', email: 'u1@test.com' });
        await seedUser({ id: 'u2', email: 'u2@test.com' });
        await seedUserRole('u1', 'CHVL');
        await seedUserRole('u2', 'CHVPSP');
        expect(await holdsDriverRole(db, 'u1')).toBe(true);
        expect(await holdsDriverRole(db, 'u2')).toBe(true);
    });

    it('vrai avec CHVL / CHVPSP dans une ligne UserUL.roles seule (CSV)', async () => {
        await seedUser({ id: 'u1', email: 'u1@test.com' });
        await seedUserUL({ userId: 'u1', ulId: UL, roles: ['CADRE', 'CHVPSP'] });
        expect(await holdsDriverRole(db, 'u1')).toBe(true);
    });

    it('présence brute : INACTIF n\'efface pas le rôle chauffeur', async () => {
        await seedUser({ id: 'u1', email: 'u1@test.com' });
        await seedUserRole('u1', 'CHVL');
        await seedUserRole('u1', 'INACTIF');
        expect(await holdsDriverRole(db, 'u1')).toBe(true);
    });

    it('comparaison exacte : « chvl » en minuscules ne compte pas comme chauffeur', async () => {
        await seedUser({ id: 'u1', email: 'u1@test.com' });
        await seedUserUL({ userId: 'u1', ulId: UL, roles: ['chvl', 'chvpsp'] });
        expect(await holdsDriverRole(db, 'u1')).toBe(false);
    });

    it('ne confond pas un rôle au nom voisin', async () => {
        await seedUser({ id: 'u1', email: 'u1@test.com' });
        await seedUserUL({ userId: 'u1', ulId: UL, roles: ['XCHVL', 'CHVLX'] });
        expect(await holdsDriverRole(db, 'u1')).toBe(false);
    });
});

describe('applyDriverRoleTransition', () => {
    it('non-chauffeur → chauffeur : validation effacée, délai démarré à today', async () => {
        await seedUser({ id: 'u1', email: 'u1@test.com', ...VALIDATED });
        await applyDriverRoleTransition(db, 'u1', false, true, '2026-11-12');
        expect(await papers('u1')).toEqual({ papiers_valides: 0, last_validation: null, start: '2026-11-12' });
    });

    it('chauffeur → non-chauffeur : tout est effacé', async () => {
        await seedUser({ id: 'u1', email: 'u1@test.com', papiers_valides: 0, last_validation: '2026-01-01', start_date_invalidation_process: '2026-10-01' });
        await applyDriverRoleTransition(db, 'u1', true, false, '2026-11-12');
        expect(await papers('u1')).toEqual(CLEARED);
    });

    it('aucun changement de statut : rien n\'est écrit', async () => {
        await seedUser({ id: 'u1', email: 'u1@test.com', ...VALIDATED });
        await applyDriverRoleTransition(db, 'u1', true, true, '2026-11-12');
        await applyDriverRoleTransition(db, 'u1', false, false, '2026-11-12');
        expect(await papers('u1')).toEqual({ papiers_valides: 1, last_validation: '2026-11-11', start: null });
    });
});

describe('POST /api/users — création', () => {
    it.each([[['CHVL']], [['CHVPSP']]])('rôles %j : délai de grâce démarré', async (roles) => {
        const res = await POST(json('POST', { email: 'new@test.com', name: 'New', roles, ulId: UL }));
        expect(res.status).toBe(201);
        const { id } = await res.json();
        expect(await papers(id)).toEqual(GRACE_TODAY);
    });

    it('rôles non chauffeur : état « effacé »', async () => {
        const res = await POST(json('POST', { email: 'new@test.com', name: 'New', roles: ['CADRE'], ulId: UL }));
        expect(res.status).toBe(201);
        expect(await papers((await res.json()).id)).toEqual(CLEARED);
    });
});

describe('PATCH /api/users/[email] — rôles globaux', () => {
    it('ajout de CHVL à un ADMIN aux papiers validés : validation effacée, grâce démarrée', async () => {
        await seedUser({ id: 'u1', email: 'u1@test.com', ...VALIDATED });
        await seedUserRole('u1', 'ADMIN');
        expect((await patchGlobal('u1@test.com', ['ADMIN', 'CHVL'])).status).toBe(200);
        expect(await papers('u1')).toEqual(GRACE_TODAY);
    });

    it('retrait de CHVL : les trois colonnes sont effacées', async () => {
        await seedUser({ id: 'u1', email: 'u1@test.com', ...VALIDATED });
        await seedUserRole('u1', 'CHVL');
        expect((await patchGlobal('u1@test.com', ['CADRE'])).status).toBe(200);
        expect(await papers('u1')).toEqual(CLEARED);
    });

    it('ajout de CHVPSP à un CHVL : rien ne change', async () => {
        await seedUser({ id: 'u1', email: 'u1@test.com', ...VALIDATED });
        await seedUserRole('u1', 'CHVL');
        expect((await patchGlobal('u1@test.com', ['CHVL', 'CHVPSP'])).status).toBe(200);
        expect(await papers('u1')).toEqual({ papiers_valides: 1, last_validation: '2026-11-11', start: null });
    });

    it('retrait d\'un seul des deux rôles chauffeur : rien ne change', async () => {
        await seedUser({ id: 'u1', email: 'u1@test.com', ...VALIDATED });
        await seedUserRole('u1', 'CHVL');
        await seedUserRole('u1', 'CHVPSP');
        expect((await patchGlobal('u1@test.com', ['CHVPSP'])).status).toBe(200);
        expect(await papers('u1')).toEqual({ papiers_valides: 1, last_validation: '2026-11-11', start: null });
    });

    it('retirer puis réattribuer CHVL : le délai repart de la réattribution', async () => {
        await seedUser({ id: 'u1', email: 'u1@test.com', papiers_valides: 0, last_validation: null, start_date_invalidation_process: '2026-01-01' });
        await seedUserRole('u1', 'CHVL');
        await patchGlobal('u1@test.com', ['CADRE']);
        await patchGlobal('u1@test.com', ['CADRE', 'CHVL']);
        expect(await papers('u1')).toEqual(GRACE_TODAY);
    });

    it('un non-chauffeur qui le reste n\'est pas touché', async () => {
        await seedUser({ id: 'u1', email: 'u1@test.com', ...VALIDATED });
        await seedUserRole('u1', 'ADMIN');
        await patchGlobal('u1@test.com', ['ADMIN', 'CADRE']);
        expect(await papers('u1')).toEqual({ papiers_valides: 1, last_validation: '2026-11-11', start: null });
    });
});

describe('PUT /api/users/[email]/ul — droits par UL', () => {
    it('ajout de CHVL sur la ligne de rattachement : grâce démarrée', async () => {
        await seedUser({ id: 'u1', email: 'u1@test.com', ...VALIDATED });
        await seedUserUL({ userId: 'u1', ulId: UL, isHome: true, roles: ['ADMIN'] });
        expect((await putUl('u1@test.com', [{ ulId: UL, isHome: true, roles: ['ADMIN', 'CHVL'] }])).status).toBe(200);
        expect(await papers('u1')).toEqual(GRACE_TODAY);
    });

    it('retrait du dernier rôle chauffeur : état effacé', async () => {
        await seedUser({ id: 'u1', email: 'u1@test.com', ...VALIDATED });
        await seedUserRole('u1', 'CHVL');
        await seedUserUL({ userId: 'u1', ulId: UL, isHome: true, roles: ['CHVL'] });
        expect((await putUl('u1@test.com', [{ ulId: UL, isHome: true, roles: ['CADRE'] }])).status).toBe(200);
        expect(await papers('u1')).toEqual(CLEARED);
    });

    it('ajout de CHVPSP à un CHVL : rien ne change', async () => {
        await seedUser({ id: 'u1', email: 'u1@test.com', ...VALIDATED });
        await seedUserRole('u1', 'CHVL');
        await seedUserUL({ userId: 'u1', ulId: UL, isHome: true, roles: ['CHVL'] });
        expect((await putUl('u1@test.com', [{ ulId: UL, isHome: true, roles: ['CHVL', 'CHVPSP'] }])).status).toBe(200);
        expect(await papers('u1')).toEqual({ papiers_valides: 1, last_validation: '2026-11-11', start: null });
    });
});

describe('PATCH /api/users/[email]/ul — retrait d\'une UL', () => {
    it('retirer la seule UL qui porte CHVL efface l\'état des papiers', async () => {
        await seedUser({ id: 'u1', email: 'u1@test.com', ...VALIDATED });
        await seedUserUL({ userId: 'u1', ulId: UL, isHome: true, roles: ['CHVL'] });
        const res = await PATCH_UL(json('PATCH', { ulId: UL, action: 'remove' }), { params: Promise.resolve({ email: 'u1@test.com' }) });
        expect(res.status).toBe(200);
        expect(await papers('u1')).toEqual(CLEARED);
    });
});
