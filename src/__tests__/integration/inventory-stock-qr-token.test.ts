/**
 * Tests d'intégration — GET/POST/DELETE /api/inventory/stocks/[id]/qr-token.
 *
 * Couvre AC-T1 → AC-T7 et AC-T11 (scope d'UL).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { GET, POST, DELETE } from '@/app/api/inventory/stocks/[id]/qr-token/route';
import { auth } from '@/auth';
import { db } from './setup';
import { ensureStockTableExists } from '@/lib/inventory/stocks';

const mockedAuth = vi.mocked(auth);

const CHVL_A = { user: { email: 'chvl@test.com', name: 'Camille', ulId: 'ul-a', roles: ['CHVL'] } };
const ADMIN_A = { user: { email: 'admin@test.com', name: 'Alex', ulId: 'ul-a', roles: ['ADMIN'] } };
const ADMIN_B = { user: { email: 'autre@test.com', name: 'Bruno', ulId: 'ul-b', roles: ['ADMIN'] } };

function makeRequest(method: string): Request {
    return new Request('http://localhost/api/inventory/stocks/stock-a/qr-token', { method });
}

function withId(id: string) {
    return { params: Promise.resolve({ id }) };
}

async function seedStock(id: string, ulId: string) {
    await db.execute({
        sql: `INSERT INTO "InvStockList" (id, name, ulId, isDefault) VALUES (?, ?, ?, 0)`,
        args: [id, `Stock ${id}`, ulId],
    });
}

async function tokenInDb(id: string): Promise<string | null> {
    const res = await db.execute({ sql: `SELECT qrToken FROM "InvStockList" WHERE id = ?`, args: [id] });
    return (res.rows[0]?.qrToken as string | null) ?? null;
}

beforeEach(async () => {
    await ensureStockTableExists();
    await db.execute(`DELETE FROM "InvStockList"`);
    mockedAuth.mockReset();
});

describe('GET /api/inventory/stocks/[id]/qr-token', () => {
    it('retourne 401 sans session (AC-T1)', async () => {
        mockedAuth.mockResolvedValue(null as never);
        const res = await GET(makeRequest('GET'), withId('stock-a'));
        expect(res.status).toBe(401);
    });

    it('retourne 404 pour un stock inconnu (AC-T2)', async () => {
        mockedAuth.mockResolvedValue(CHVL_A as never);
        const res = await GET(makeRequest('GET'), withId('inconnu'));
        expect(res.status).toBe(404);
        expect((await res.json()).error).toBe('Stock introuvable');
    });

    it('crée le token à la première demande et l\'écrit en base (AC-T3)', async () => {
        mockedAuth.mockResolvedValue(CHVL_A as never);
        await seedStock('stock-a', 'ul-a');

        const res = await GET(makeRequest('GET'), withId('stock-a'));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.token).toBeTruthy();
        expect(await tokenInDb('stock-a')).toBe(body.token);
    });

    it('rend le même token à chaque appel (AC-T4)', async () => {
        mockedAuth.mockResolvedValue(CHVL_A as never);
        await seedStock('stock-a', 'ul-a');

        const first = await (await GET(makeRequest('GET'), withId('stock-a'))).json();
        const second = await (await GET(makeRequest('GET'), withId('stock-a'))).json();
        expect(second.token).toBe(first.token);
    });

    it('réussit pour un CHVL de l\'UL du stock — aucune contrainte de rôle (AC-T6)', async () => {
        mockedAuth.mockResolvedValue(CHVL_A as never);
        await seedStock('stock-a', 'ul-a');

        const res = await GET(makeRequest('GET'), withId('stock-a'));
        expect(res.status).toBe(200);
    });
});

describe('POST /api/inventory/stocks/[id]/qr-token', () => {
    it('se comporte comme GET (AC-T5)', async () => {
        mockedAuth.mockResolvedValue(CHVL_A as never);
        await seedStock('stock-a', 'ul-a');

        const res = await POST(makeRequest('POST'), withId('stock-a'));
        expect(res.status).toBe(200);
        expect((await res.json()).token).toBeTruthy();
    });
});

describe('DELETE /api/inventory/stocks/[id]/qr-token', () => {
    it('retourne 401 sans session (AC-T7)', async () => {
        mockedAuth.mockResolvedValue(null as never);
        const res = await DELETE(makeRequest('DELETE'), withId('stock-a'));
        expect(res.status).toBe(401);
    });

    it('retourne 403 pour un CHVL de la bonne UL (AC-T7)', async () => {
        mockedAuth.mockResolvedValue(CHVL_A as never);
        await seedStock('stock-a', 'ul-a');

        const res = await DELETE(makeRequest('DELETE'), withId('stock-a'));
        expect(res.status).toBe(403);
    });

    it('régénère un token DIFFÉRENT pour un admin (AC-T7)', async () => {
        mockedAuth.mockResolvedValue(ADMIN_A as never);
        await seedStock('stock-a', 'ul-a');
        const before = await (await GET(makeRequest('GET'), withId('stock-a'))).json();

        const res = await DELETE(makeRequest('DELETE'), withId('stock-a'));
        expect(res.status).toBe(200);
        const after = await res.json();
        expect(after.token).not.toBe(before.token);
        expect(await tokenInDb('stock-a')).toBe(after.token);
    });

    it('retourne 404 pour un stock inconnu', async () => {
        mockedAuth.mockResolvedValue(ADMIN_A as never);
        const res = await DELETE(makeRequest('DELETE'), withId('inconnu'));
        expect(res.status).toBe(404);
    });
});

/**
 * AC-T11 — le scope d'UL est ce qui empêche de FABRIQUER l'accès par
 * énumération, sans jamais voir le QR. Sans lui, la prémisse « le token est un
 * secret » s'effondre : la fuite cesse d'être un accident et devient un droit.
 */
describe('scope d\'UL (AC-T11)', () => {
    it('refuse en 403 un GET sur un stock d\'une autre UL, sans créer de token', async () => {
        mockedAuth.mockResolvedValue(ADMIN_B as never);
        await seedStock('stock-a', 'ul-a');

        const res = await GET(makeRequest('GET'), withId('stock-a'));
        expect(res.status).toBe(403);
        expect(await tokenInDb('stock-a')).toBeNull();
    });

    it('refuse en 403 un POST sur un stock d\'une autre UL, sans créer de token', async () => {
        mockedAuth.mockResolvedValue(ADMIN_B as never);
        await seedStock('stock-a', 'ul-a');

        const res = await POST(makeRequest('POST'), withId('stock-a'));
        expect(res.status).toBe(403);
        expect(await tokenInDb('stock-a')).toBeNull();
    });

    it('refuse en 403 un DELETE sur un stock d\'une autre UL, même pour un ADMIN, sans toucher au token', async () => {
        mockedAuth.mockResolvedValue(ADMIN_A as never);
        await seedStock('stock-a', 'ul-a');
        const original = await (await GET(makeRequest('GET'), withId('stock-a'))).json();

        mockedAuth.mockResolvedValue(ADMIN_B as never);
        const res = await DELETE(makeRequest('DELETE'), withId('stock-a'));

        expect(res.status).toBe(403);
        expect(await tokenInDb('stock-a')).toBe(original.token);
    });
});
