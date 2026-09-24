/**
 * Tests d'intégration — liste « À laver » :
 *   GET  /api/uniforms/laundry
 *   POST /api/uniforms/laundry/[loanId]
 *
 * Tout compte actif de l'UL active ; une pièce d'une autre UL répond 404 ;
 * marquer lavée est idempotent au sens « 409 si déjà lavée ».
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { GET as getLaundry } from '@/app/api/uniforms/laundry/route';
import { POST as markWashed } from '@/app/api/uniforms/laundry/[loanId]/route';
import { GET as getItems } from '@/app/api/uniforms/items/route';
import { POST as postLoan } from '@/app/api/uniforms/loans/route';
import { createLoanBatch, returnLoan } from '@/lib/uniforms/loans';
import { auth } from '@/auth';
import { db, seedUniteLocale, seedUniformItem, seedUniformSize } from './setup';

const mockedAuth = vi.mocked(auth);

const session = (roles: string[], id: string, ulId = 'ul-paris-18') =>
    ({ user: { id, email: `${id}@test.com`, name: `Nom ${id}`, ulId, roles } }) as never;

const CHVL_18 = session(['CHVL'], 'u-chvl');
const BENEVOLE_18 = session(['CHVPSP'], 'u-benevole');
const CHVL_4 = session(['CHVL'], 'u-chvl4', 'ul-paris-4');

const withLoan = (loanId: string) => ({ params: Promise.resolve({ loanId }) });
const req = () => new Request('http://localhost/api/uniforms/laundry', { method: 'POST' });

let dirtyLoanId: string;

beforeEach(async () => {
    mockedAuth.mockReset();
    await seedUniteLocale({ id: 'ul-paris-18', name: 'Paris 18', slug: 'paris-18' });
    await seedUniteLocale({ id: 'ul-paris-4', name: 'Paris 4', slug: 'paris-4' });
    await seedUniformItem({ id: 'polo', name: 'Polo' });
    await seedUniformSize({ id: 'polo-m', itemId: 'polo', label: 'M', quantity: 1 });

    await createLoanBatch({ ulId: 'ul-paris-18', borrower: { id: 'u-chvl', name: 'Camille', email: null }, lines: [{ sizeId: 'polo-m', quantity: 1 }], source: 'app' });
    dirtyLoanId = String((await db.execute(`SELECT id FROM "UniformLoan"`)).rows[0].id);
    await returnLoan(dirtyLoanId, 'u-chvl', { returnedClean: false, comment: 'Taché de boue' });
});

describe('GET /api/uniforms/laundry', () => {
    it('401 / 403 INACTIF ou sans rôle', async () => {
        mockedAuth.mockResolvedValue(null as never);
        expect((await getLaundry()).status).toBe(401);
        mockedAuth.mockResolvedValue(session(['INACTIF'], 'u-i'));
        expect((await getLaundry()).status).toBe(403);
        mockedAuth.mockResolvedValue(session([], 'u-none'));
        expect((await getLaundry()).status).toBe(403);
    });

    it('liste les pièces sales de l\'UL active, sans le nom de l\'emprunteur', async () => {
        mockedAuth.mockResolvedValue(BENEVOLE_18);
        const { pieces } = await (await getLaundry()).json();
        expect(pieces).toHaveLength(1);
        expect(pieces[0]).toMatchObject({ loanId: dirtyLoanId, itemName: 'Polo', sizeLabel: 'M', returnComment: 'Taché de boue' });
        expect(JSON.stringify(pieces)).not.toContain('Camille');
    });

    it('vide pour une autre UL', async () => {
        mockedAuth.mockResolvedValue(CHVL_4);
        expect((await (await getLaundry()).json()).pieces).toEqual([]);
    });
});

describe('POST /api/uniforms/laundry/[loanId]', () => {
    it('401 / 403 INACTIF', async () => {
        mockedAuth.mockResolvedValue(null as never);
        expect((await markWashed(req(), withLoan(dirtyLoanId))).status).toBe(401);
        mockedAuth.mockResolvedValue(session(['INACTIF'], 'u-i'));
        expect((await markWashed(req(), withLoan(dirtyLoanId))).status).toBe(403);
    });

    it('AC3 — un autre bénévole la marque lavée : elle quitte la liste et redevient empruntable', async () => {
        mockedAuth.mockResolvedValue(CHVL_18);
        const before = await (await getItems()).json();
        expect(before.items[0].sizes[0].available).toBe(0);

        mockedAuth.mockResolvedValue(BENEVOLE_18);
        expect((await markWashed(req(), withLoan(dirtyLoanId))).status).toBe(200);

        const row = (await db.execute({ sql: `SELECT washedAt, washedBy, washedByName FROM "UniformLoan" WHERE id = ?`, args: [dirtyLoanId] })).rows[0];
        expect(row.washedAt).not.toBeNull();
        expect(row).toMatchObject({ washedBy: 'u-benevole', washedByName: 'Nom u-benevole' });

        expect((await (await getLaundry()).json()).pieces).toEqual([]);

        mockedAuth.mockResolvedValue(CHVL_18);
        expect((await postLoan(new Request('http://localhost/api/uniforms/loans', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lines: [{ sizeId: 'polo-m', quantity: 1 }] }),
        }))).status).toBe(201);
    });

    it('409 si déjà lavée', async () => {
        mockedAuth.mockResolvedValue(BENEVOLE_18);
        await markWashed(req(), withLoan(dirtyLoanId));
        const res = await markWashed(req(), withLoan(dirtyLoanId));
        expect(res.status).toBe(409);
    });

    it('409 pour une pièce rendue propre ou encore empruntée', async () => {
        await db.execute({ sql: `UPDATE "UniformLoan" SET returnedClean = 1 WHERE id = ?`, args: [dirtyLoanId] });
        mockedAuth.mockResolvedValue(BENEVOLE_18);
        expect((await markWashed(req(), withLoan(dirtyLoanId))).status).toBe(409);
    });

    it('404 pour une pièce d\'une autre UL ou inconnue', async () => {
        mockedAuth.mockResolvedValue(CHVL_4);
        expect((await markWashed(req(), withLoan(dirtyLoanId))).status).toBe(404);
        mockedAuth.mockResolvedValue(BENEVOLE_18);
        expect((await markWashed(req(), withLoan('inconnu'))).status).toBe(404);
    });
});
