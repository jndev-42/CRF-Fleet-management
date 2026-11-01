// @vitest-environment node
// Environnement node : l'import CSV lit un multipart via `Request.formData()` (undici),
// que les `File`/`FormData` de jsdom ne savent pas alimenter.
/**
 * Rôle RESP_INVENTAIRE : droits d'un ADMIN sur l'inventaire de son UL, rien d'autre.
 * Les gardes d'écriture de /api/inventory/** acceptent `canManageInventory`.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/auth';
import { POST as createItem, PATCH as patchItem, DELETE as deleteItem } from '@/app/api/inventory/route';
import { PATCH as patchBatch, DELETE as deleteBatch } from '@/app/api/inventory/batches/route';
import { POST as duplicateStock } from '@/app/api/inventory/stocks/duplicate/route';
import { POST as importStock } from '@/app/api/inventory/stocks/import/route';
import { POST as adjustRoute } from '@/app/api/inventory/adjust/route';
import { POST as createStock, PATCH as renameStock, DELETE as deleteStock } from '@/app/api/inventory/stocks/route';
import { db } from './setup';

const mockedAuth = vi.mocked(auth);

const RESP_INV = { user: { email: 'ri@test.com', name: 'Rita Inventaire', ulId: 'ul-test', roles: ['RESP_INVENTAIRE'] } };
const RESP_INV_INACTIF = { user: { email: 'rik@test.com', name: 'Rik', ulId: 'ul-test', roles: ['RESP_INVENTAIRE', 'INACTIF'] } };
const RESP_UNI = { user: { email: 'ru@test.com', name: 'Ugo', ulId: 'ul-test', roles: ['RESP_UNIFORME'] } };


async function seedStock(name: string, ulId: string, isDefault: number): Promise<string> {
    const id = crypto.randomUUID();
    await db.execute({ sql: `INSERT INTO "InvStockList" (id, name, ulId, isDefault) VALUES (?, ?, ?, ?)`, args: [id, name, ulId, isDefault] });
    return id;
}

function req(url: string, method: string, body: unknown): Request {
    return new Request(`http://localhost${url}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

async function seedItem(ulId: string): Promise<string> {
    const id = crypto.randomUUID();
    await db.execute({
        sql: `INSERT INTO "InvItem" (id, stockId, name, category, quantity, minStock, notes, ulId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [id, null, 'Compresses', null, 5, null, null, ulId],
    });
    await db.execute({
        sql: `INSERT INTO "InvBatch" (id, itemId, quantity, expiryDate) VALUES (?, ?, ?, ?)`,
        args: [crypto.randomUUID(), id, 5, null],
    });
    return id;
}

beforeEach(async () => {
    await db.execute(`DELETE FROM "InvStockLog"`);
    await db.execute(`DELETE FROM "InvBatch"`);
    await db.execute(`DELETE FROM "InvItem"`);
    await db.execute(`DELETE FROM "InvStockList"`);
    mockedAuth.mockReset();
    mockedAuth.mockResolvedValue(RESP_INV as never);
});

describe('RESP_INVENTAIRE — écriture inventaire', () => {
    it('crée un article (201) dans l\'UL du responsable', async () => {
        const res = await createItem(req('/api/inventory', 'POST', { name: 'Gants', quantity: 10 }));
        expect(res.status).toBe(201);
        const { id } = await res.json();
        const row = await db.execute({ sql: `SELECT ulId FROM "InvItem" WHERE id = ?`, args: [id] });
        expect(row.rows[0].ulId).toBe('ul-test');
    });

    it('retourne 400 sans nom', async () => {
        const res = await createItem(req('/api/inventory', 'POST', { quantity: 1 }));
        expect(res.status).toBe(400);
    });

    it('ajuste une quantité (200)', async () => {
        const itemId = await seedItem('ul-test');
        const res = await adjustRoute(req('/api/inventory/adjust', 'POST', { itemId, change: 3 }));
        expect(res.status).toBe(200);
        const q = await db.execute({ sql: `SELECT quantity FROM "InvItem" WHERE id = ?`, args: [itemId] });
        expect(Number(q.rows[0].quantity)).toBe(8);
    });

    it('crée un stock dans l\'UL du responsable', async () => {
        const res = await createStock(req('/api/inventory/stocks', 'POST', { name: 'Sac VPSP' }));
        expect(res.status).toBe(201);
        const row = await db.execute({ sql: `SELECT ulId FROM "InvStockList" WHERE name = ?`, args: ['Sac VPSP'] });
        expect(row.rows).toHaveLength(1);
        expect(row.rows[0].ulId).toBe('ul-test');
    });

    it('modifie un article (200)', async () => {
        const id = await seedItem('ul-test');
        const res = await patchItem(req('/api/inventory', 'PATCH', { id, name: 'Compresses stériles' }));
        expect(res.status).toBe(200);
        const row = await db.execute({ sql: `SELECT name FROM "InvItem" WHERE id = ?`, args: [id] });
        expect(row.rows[0].name).toBe('Compresses stériles');
    });

    it('supprime un article (200)', async () => {
        const id = await seedItem('ul-test');
        const res = await deleteItem(new Request(`http://localhost/api/inventory?id=${id}`, { method: 'DELETE' }));
        expect(res.status).toBe(200);
        const row = await db.execute({ sql: `SELECT id FROM "InvItem" WHERE id = ?`, args: [id] });
        expect(row.rows).toHaveLength(0);
    });

    it('ajuste puis supprime un lot (200)', async () => {
        const itemId = await seedItem('ul-test');
        const batchId = (await db.execute({ sql: `SELECT id FROM "InvBatch" WHERE itemId = ?`, args: [itemId] })).rows[0].id as string;

        const patch = await patchBatch(req('/api/inventory/batches', 'PATCH', { batchId, change: 2 }));
        expect(patch.status).toBe(200);
        const after = await db.execute({ sql: `SELECT quantity FROM "InvBatch" WHERE id = ?`, args: [batchId] });
        expect(Number(after.rows[0].quantity)).toBe(7);

        const del = await deleteBatch(new Request(`http://localhost/api/inventory/batches?batchId=${batchId}`, { method: 'DELETE' }));
        expect(del.status).toBe(200);
        const gone = await db.execute({ sql: `SELECT id FROM "InvBatch" WHERE id = ?`, args: [batchId] });
        expect(gone.rows).toHaveLength(0);
    });

    it('supprime un stock (200) quand l\'UL en a plusieurs', async () => {
        const keep = await seedStock('Principal', 'ul-test', 1);
        const drop = await seedStock('Secondaire', 'ul-test', 0);
        const res = await deleteStock(new Request(`http://localhost/api/inventory/stocks?id=${drop}`, { method: 'DELETE' }));
        expect(res.status).toBe(200);
        const rows = await db.execute({ sql: `SELECT id FROM "InvStockList" WHERE ulId = ?`, args: ['ul-test'] });
        expect(rows.rows.map(r => r.id)).toEqual([keep]);
    });

    it('duplique un stock (2xx) dans l\'UL du responsable', async () => {
        const source = await seedStock('Source', 'ul-test', 1);
        const res = await duplicateStock(req('/api/inventory/stocks/duplicate', 'POST', { sourceStockId: source, name: 'Copie' }));
        expect(res.status).toBe(201);
        const row = await db.execute({ sql: `SELECT ulId FROM "InvStockList" WHERE name = ?`, args: ['Copie'] });
        expect(row.rows).toHaveLength(1);
        expect(row.rows[0].ulId).toBe('ul-test');
    });

    it('importe un stock CSV (2xx) dans l\'UL du responsable', async () => {
        const formData = new FormData();
        formData.append('name', 'Importé');
        formData.append('file', new File(['nom;categorie;quantite;date_peremption;stock_min;notes\nGarrot;;3;;;\n'], 'stock.csv', { type: 'text/csv' }));
        const res = await importStock(new Request('http://localhost/api/inventory/stocks/import', { method: 'POST', body: formData }));
        expect(res.status).toBe(201);
        const row = await db.execute({ sql: `SELECT ulId FROM "InvStockList" WHERE name = ?`, args: ['Importé'] });
        expect(row.rows).toHaveLength(1);
        expect(row.rows[0].ulId).toBe('ul-test');
    });

    it('refuse en 404 un article d\'une autre UL, comme un ADMIN, sans rien écrire', async () => {
        const itemId = await seedItem('ul-autre');
        const res = await adjustRoute(req('/api/inventory/adjust', 'POST', { itemId, change: 3 }));
        expect(res.status).toBe(404);
        const q = await db.execute({ sql: `SELECT quantity FROM "InvItem" WHERE id = ?`, args: [itemId] });
        expect(Number(q.rows[0].quantity)).toBe(5);
    });

    it('ne peut pas renommer un stock d\'une autre UL (404)', async () => {
        const id = crypto.randomUUID();
        await db.execute({ sql: `INSERT INTO "InvStockList" (id, name, ulId, isDefault) VALUES (?, ?, ?, 0)`, args: [id, 'Autre', 'ul-autre'] });
        const res = await renameStock(req('/api/inventory/stocks', 'PATCH', { id, name: 'Piraté' }));
        expect(res.status).toBe(404);
    });
});

describe('RESP_INVENTAIRE — refus', () => {
    it('401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        const res = await createItem(req('/api/inventory', 'POST', { name: 'Gants' }));
        expect(res.status).toBe(401);
    });

    it('403 une fois INACTIF, même cumulé', async () => {
        mockedAuth.mockResolvedValue(RESP_INV_INACTIF as never);
        expect((await createItem(req('/api/inventory', 'POST', { name: 'Gants' }))).status).toBe(403);
        expect((await adjustRoute(req('/api/inventory/adjust', 'POST', { itemId: 'x', change: 1 }))).status).toBe(403);
        expect((await createStock(req('/api/inventory/stocks', 'POST', { name: 'S' }))).status).toBe(403);
    });

    it('403 pour un RESP_UNIFORME (hors périmètre)', async () => {
        mockedAuth.mockResolvedValue(RESP_UNI as never);
        expect((await createItem(req('/api/inventory', 'POST', { name: 'Gants' }))).status).toBe(403);
        expect((await adjustRoute(req('/api/inventory/adjust', 'POST', { itemId: 'x', change: 1 }))).status).toBe(403);
    });
});
