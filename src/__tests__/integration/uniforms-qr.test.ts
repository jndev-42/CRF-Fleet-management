/**
 * Tests d'intégration — QR « Uniformes » :
 *   GET/POST/DELETE /api/uniforms/qr-token
 *   GET  /api/qr-uniforms/[token]/catalog
 *   POST /api/qr-uniforms/[token]/loans
 *   GET  /api/qr-uniforms/[token]/laundry
 *   POST /api/qr-uniforms/[token]/laundry/[loanId]
 *
 * Le token est une colonne DÉDIÉE (`uniformQrToken`) : le token de mission
 * (`qrToken`) ne doit pas l'ouvrir. Les routes QR ne filtrent ni rôle ni UL,
 * seul INACTIF est refusé.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { GET as getToken, POST as postToken, DELETE as deleteToken } from '@/app/api/uniforms/qr-token/route';
import { GET as getCatalog } from '@/app/api/qr-uniforms/[token]/catalog/route';
import { POST as postLoan } from '@/app/api/qr-uniforms/[token]/loans/route';
import { GET as getLaundry } from '@/app/api/qr-uniforms/[token]/laundry/route';
import { POST as markWashed } from '@/app/api/qr-uniforms/[token]/laundry/[loanId]/route';
import { returnLoan } from '@/lib/uniforms/loans';
import { auth } from '@/auth';
import { db, seedUniteLocale, seedUniformItem, seedUniformSize } from './setup';

const mockedAuth = vi.mocked(auth);

const session = (roles: string[], id: string, ulId = 'ul-paris-18') =>
    ({ user: { id, email: `${id}@test.com`, name: `Nom ${id}`, ulId, roles } }) as never;

const ADMIN_18 = session(['ADMIN'], 'u-admin');
const CADRE_18 = session(['CADRE'], 'u-cadre');
const SANS_ROLE_18 = session([], 'u-nobody18');
const CHVL_18 = session(['CHVL'], 'u-chvl');
// Sans rôle ET d'une autre UL : le QR ne filtre ni l'un ni l'autre.
const SANS_ROLE_4 = session([], 'u-nobody', 'ul-paris-4');

const TOKEN_18 = 'tok-uniformes-18';
const withToken = (token: string) => ({ params: Promise.resolve({ token }) });
const withTokenLoan = (token: string, loanId: string) => ({ params: Promise.resolve({ token, loanId }) });
const loanReq = (body: unknown) => new Request('http://localhost/api/qr-uniforms/x/loans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
});

async function tokenInDb(ulId: string): Promise<string | null> {
    const res = await db.execute({ sql: `SELECT uniformQrToken FROM "UniteLocale" WHERE id = ?`, args: [ulId] });
    return (res.rows[0]?.uniformQrToken as string | null) ?? null;
}

beforeEach(async () => {
    mockedAuth.mockReset();
    await seedUniteLocale({ id: 'ul-paris-18', name: 'Paris 18', slug: 'paris-18' });
    await seedUniteLocale({ id: 'ul-paris-4', name: 'Paris 4', slug: 'paris-4' });
    await seedUniformItem({ id: 'polo', name: 'Polo' });
    await seedUniformSize({ id: 'polo-m', itemId: 'polo', label: 'M', quantity: 3 });
    await seedUniformItem({ id: 'veste-4', ulId: 'ul-paris-4', name: 'Veste' });
    await seedUniformSize({ id: 'veste-4-m', itemId: 'veste-4', label: 'M', quantity: 5 });
});

describe('/api/uniforms/qr-token', () => {
    it('401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        expect((await getToken()).status).toBe(401);
        expect((await deleteToken()).status).toBe(401);
    });

    it('403 INACTIF avant toute écriture — aucun token créé', async () => {
        mockedAuth.mockResolvedValue(session(['ADMIN', 'INACTIF'], 'u-x'));
        expect((await getToken()).status).toBe(403);
        expect((await deleteToken()).status).toBe(403);
        expect(await tokenInDb('ul-paris-18')).toBeNull();
    });

    it('403 pour un CHVL et pour un compte sans rôle — aucun token créé', async () => {
        mockedAuth.mockResolvedValue(CHVL_18);
        expect((await getToken()).status).toBe(403);
        expect((await postToken()).status).toBe(403);
        mockedAuth.mockResolvedValue(SANS_ROLE_18);
        expect((await getToken()).status).toBe(403);
        expect(await tokenInDb('ul-paris-18')).toBeNull();
    });

    it('200 pour un CADRE', async () => {
        mockedAuth.mockResolvedValue(CADRE_18);
        const res = await getToken();
        expect(res.status).toBe(200);
        expect((await res.json()).token).toBe(await tokenInDb('ul-paris-18'));
    });

    it('crée le token de l\'UL de session à la première demande, puis le relit', async () => {
        mockedAuth.mockResolvedValue(ADMIN_18);
        const first = await (await postToken()).json();
        expect(first.token).toBeTruthy();
        expect(await tokenInDb('ul-paris-18')).toBe(first.token);
        expect((await (await getToken()).json()).token).toBe(first.token);
        expect(await tokenInDb('ul-paris-4')).toBeNull();
    });

    it('distinct du token de mission (qrToken)', async () => {
        await db.execute(`UPDATE "UniteLocale" SET qrToken = 'tok-mission-18' WHERE id = 'ul-paris-18'`);
        mockedAuth.mockResolvedValue(ADMIN_18);
        const { token } = await (await getToken()).json();
        expect(token).not.toBe('tok-mission-18');

        mockedAuth.mockResolvedValue(SANS_ROLE_4);
        expect((await getCatalog(new Request('http://x'), withToken('tok-mission-18'))).status).toBe(404);
    });

    it('404 sans UL active', async () => {
        mockedAuth.mockResolvedValue(session(['ADMIN'], 'u-x', 'default'));
        expect((await getToken()).status).toBe(404);
    });

    it('DELETE : 403 pour un CHVL, régénère pour un CADRE', async () => {
        await db.execute(`UPDATE "UniteLocale" SET uniformQrToken = '${TOKEN_18}' WHERE id = 'ul-paris-18'`);
        mockedAuth.mockResolvedValue(CHVL_18);
        expect((await deleteToken()).status).toBe(403);

        mockedAuth.mockResolvedValue(CADRE_18);
        const res = await deleteToken();
        expect(res.status).toBe(200);
        const { token } = await res.json();
        expect(token).not.toBe(TOKEN_18);
        expect(await tokenInDb('ul-paris-18')).toBe(token);
    });

    it('après régénération, l\'ancien token répond 404 et le nouveau ouvre le catalogue', async () => {
        await db.execute(`UPDATE "UniteLocale" SET uniformQrToken = '${TOKEN_18}' WHERE id = 'ul-paris-18'`);
        mockedAuth.mockResolvedValue(ADMIN_18);
        const { token } = await (await deleteToken()).json();

        mockedAuth.mockResolvedValue(SANS_ROLE_4);
        const old = await getCatalog(new Request('http://x'), withToken(TOKEN_18));
        expect(old.status).toBe(404);
        expect((await old.json()).error).toMatch(/QR Code invalide/);
        expect((await getCatalog(new Request('http://x'), withToken(token))).status).toBe(200);
    });
});

describe('/api/qr-uniforms/[token]/*', () => {
    beforeEach(async () => {
        await db.execute(`UPDATE "UniteLocale" SET uniformQrToken = '${TOKEN_18}' WHERE id = 'ul-paris-18'`);
    });

    it('401 sans session sur chaque route', async () => {
        mockedAuth.mockResolvedValue(null as never);
        expect((await getCatalog(new Request('http://x'), withToken(TOKEN_18))).status).toBe(401);
        expect((await postLoan(loanReq({ lines: [{ sizeId: 'polo-m', quantity: 1 }] }), withToken(TOKEN_18))).status).toBe(401);
        expect((await getLaundry(new Request('http://x'), withToken(TOKEN_18))).status).toBe(401);
        expect((await markWashed(new Request('http://x'), withTokenLoan(TOKEN_18, 'x'))).status).toBe(401);
    });

    it('matrice — INACTIF → 403 « Compte inactif »', async () => {
        mockedAuth.mockResolvedValue(session(['INACTIF'], 'u-i'));
        const res = await getCatalog(new Request('http://x'), withToken(TOKEN_18));
        expect(res.status).toBe(403);
        expect((await res.json()).error).toBe('Compte inactif');
        expect((await postLoan(loanReq({ lines: [{ sizeId: 'polo-m', quantity: 1 }] }), withToken(TOKEN_18))).status).toBe(403);
    });

    it('matrice — token inconnu → 404 « QR Code invalide »', async () => {
        mockedAuth.mockResolvedValue(SANS_ROLE_4);
        const res = await getCatalog(new Request('http://x'), withToken('inconnu'));
        expect(res.status).toBe(404);
        expect((await res.json()).error).toMatch(/QR Code invalide/);
        expect((await postLoan(loanReq({ lines: [{ sizeId: 'polo-m', quantity: 1 }] }), withToken('inconnu'))).status).toBe(404);
    });

    it('matrice — sans rôle, autre UL : catalogue UL 18 (200) puis emprunt (201)', async () => {
        mockedAuth.mockResolvedValue(SANS_ROLE_4);
        const res = await getCatalog(new Request('http://x'), withToken(TOKEN_18));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ul).toEqual({ id: 'ul-paris-18', name: 'Paris 18' });
        expect(body.items.map((i: { name: string }) => i.name)).toEqual(['Polo']);

        const loan = await postLoan(loanReq({ lines: [{ sizeId: 'polo-m', quantity: 2 }] }), withToken(TOKEN_18));
        expect(loan.status).toBe(201);
        const batch = (await db.execute(`SELECT ulId, borrowerId, source FROM "UniformLoanBatch"`)).rows[0];
        expect(batch).toMatchObject({ ulId: 'ul-paris-18', borrowerId: 'u-nobody', source: 'qr' });
    });

    it('400 sur un panier invalide, 404 sur une taille hors de l\'UL du token, 409 si dispo insuffisante', async () => {
        mockedAuth.mockResolvedValue(SANS_ROLE_4);
        expect((await postLoan(loanReq({ lines: 'x' }), withToken(TOKEN_18))).status).toBe(400);
        expect((await postLoan(loanReq({ lines: [{ sizeId: 'veste-4-m', quantity: 1 }] }), withToken(TOKEN_18))).status).toBe(404);
        expect((await postLoan(loanReq({ lines: [{ sizeId: 'polo-m', quantity: 4 }] }), withToken(TOKEN_18))).status).toBe(409);
    });

    it('liste « À laver » et marquage lavé par un compte sans rôle (409 au second)', async () => {
        mockedAuth.mockResolvedValue(CHVL_18);
        await postLoan(loanReq({ lines: [{ sizeId: 'polo-m', quantity: 1 }] }), withToken(TOKEN_18));
        const loanId = String((await db.execute(`SELECT id FROM "UniformLoan"`)).rows[0].id);
        await returnLoan(loanId, 'u-chvl', { returnedClean: false, comment: null });

        mockedAuth.mockResolvedValue(SANS_ROLE_4);
        const { pieces } = await (await getLaundry(new Request('http://x'), withToken(TOKEN_18))).json();
        expect(pieces.map((p: { loanId: string }) => p.loanId)).toEqual([loanId]);

        expect((await markWashed(new Request('http://x'), withTokenLoan(TOKEN_18, loanId))).status).toBe(200);
        expect((await markWashed(new Request('http://x'), withTokenLoan(TOKEN_18, loanId))).status).toBe(409);
    });

    it('marquer lavée une pièce d\'une autre UL via ce token → 404', async () => {
        await db.execute(`UPDATE "UniteLocale" SET uniformQrToken = 'tok-4' WHERE id = 'ul-paris-4'`);
        mockedAuth.mockResolvedValue(CHVL_18);
        await postLoan(loanReq({ lines: [{ sizeId: 'polo-m', quantity: 1 }] }), withToken(TOKEN_18));
        const loanId = String((await db.execute(`SELECT id FROM "UniformLoan"`)).rows[0].id);
        await returnLoan(loanId, 'u-chvl', { returnedClean: false, comment: null });

        expect((await markWashed(new Request('http://x'), withTokenLoan('tok-4', loanId))).status).toBe(404);
    });
});
