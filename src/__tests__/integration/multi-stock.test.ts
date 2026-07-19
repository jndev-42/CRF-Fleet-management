import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/auth';
import { GET as getStocks, POST as postStock, PATCH as patchStock, DELETE as deleteStock } from '@/app/api/inventory/stocks/route';
import { GET as getInventory, POST as postInventory } from '@/app/api/inventory/route';
import { db } from './setup';

const mockedAuth = vi.mocked(auth);

beforeEach(async () => {
    await db.execute(`DELETE FROM "InvStockLog"`);
    await db.execute(`DELETE FROM "InvBatch"`);
    await db.execute(`DELETE FROM "InvItem"`);
    await db.execute(`DELETE FROM "InvStockList"`);
});

describe('Multi-Stock Inventory API', () => {
    describe('GET /api/inventory/stocks', () => {
        it('returns 401 when unauthenticated', async () => {
            // @ts-expect-error — null session for test
            mockedAuth.mockResolvedValue(null);
            const res = await getStocks();
            expect(res.status).toBe(401);
        });

        it('auto-initializes default stock when no stocks exist', async () => {
            mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', ulId: 'ul-test', roles: ['ADMIN'] } } as never);
            const res = await getStocks();
            expect(res.status).toBe(200);

            const data = await res.json();
            expect(data.stocks).toHaveLength(1);
            expect(data.stocks[0].name).toBe('Stock Principal');
            expect(data.stocks[0].isDefault).toBe(1);
        });
    });

    describe('POST /api/inventory/stocks', () => {
        it('returns 403 for non-admin users', async () => {
            mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', ulId: 'ul-test', roles: ['GUEST'] } } as never);
            const req = new Request('http://localhost/api/inventory/stocks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Stock Urgence' }),
            });
            const res = await postStock(req);
            expect(res.status).toBe(403);
        });

        it('creates a new stock for admin user', async () => {
            mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', ulId: 'ul-test', roles: ['ADMIN'] } } as never);
            const req = new Request('http://localhost/api/inventory/stocks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Stock Réserve' }),
            });
            const res = await postStock(req);
            expect(res.status).toBe(201);
            const data = await res.json();
            expect(data.name).toBe('Stock Réserve');

            const listRes = await getStocks();
            const listData = await listRes.json();
            expect(listData.stocks).toHaveLength(2);
        });
    });

    describe('PATCH /api/inventory/stocks', () => {
        it('renames an existing stock', async () => {
            mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', ulId: 'ul-test', roles: ['ADMIN'] } } as never);
            const listRes = await getStocks();
            const listData = await listRes.json();
            const stockId = listData.stocks[0].id;

            const req = new Request('http://localhost/api/inventory/stocks', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: stockId, name: 'Stock Central Renommé' }),
            });
            const res = await patchStock(req);
            expect(res.status).toBe(200);

            const updatedRes = await getStocks();
            const updatedData = await updatedRes.json();
            expect(updatedData.stocks[0].name).toBe('Stock Central Renommé');
        });
    });

    describe('Stock independence & cascading deletion', () => {
        it('isolates items between stocks and cleans up on stock deletion', async () => {
            mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', ulId: 'ul-test', roles: ['ADMIN'] } } as never);

            // 1. Create Stock A (default) and Stock B
            const listRes = await getStocks();
            const listData = await listRes.json();
            const stockAId = listData.stocks[0].id;

            const postStockReq = new Request('http://localhost/api/inventory/stocks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Stock B' }),
            });
            const stockBRes = await postStock(postStockReq);
            const stockBData = await stockBRes.json();
            const stockBId = stockBData.id;

            // 2. Add item to Stock A
            const itemAReq = new Request('http://localhost/api/inventory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Compresses Stock A', quantity: 10, stockId: stockAId }),
            });
            await postInventory(itemAReq);

            // 3. Add item to Stock B
            const itemBReq = new Request('http://localhost/api/inventory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Pansements Stock B', quantity: 5, stockId: stockBId }),
            });
            await postInventory(itemBReq);

            // 4. Verify Stock A items query
            const getAReq = new Request(`http://localhost/api/inventory?stockId=${stockAId}`);
            const resA = await getInventory(getAReq);
            const dataA = await resA.json();
            expect(dataA.items).toHaveLength(1);
            expect(dataA.items[0].name).toBe('Compresses Stock A');

            // 5. Verify Stock B items query
            const getBReq = new Request(`http://localhost/api/inventory?stockId=${stockBId}`);
            const resB = await getInventory(getBReq);
            const dataB = await resB.json();
            expect(dataB.items).toHaveLength(1);
            expect(dataB.items[0].name).toBe('Pansements Stock B');

            // 6. Delete Stock B
            const deleteBReq = new Request(`http://localhost/api/inventory/stocks?id=${stockBId}`, {
                method: 'DELETE',
            });
            const deleteBRes = await deleteStock(deleteBReq);
            expect(deleteBRes.status).toBe(200);

            // 7. Verify items in Stock B are completely removed
            const getBAfterDelete = new Request(`http://localhost/api/inventory?stockId=${stockBId}`);
            const resBAfter = await getInventory(getBAfterDelete);
            const dataBAfter = await resBAfter.json();
            expect(dataBAfter.items).toHaveLength(0);

            // Stock A items still remain intact
            const getAAfterDelete = new Request(`http://localhost/api/inventory?stockId=${stockAId}`);
            const resAAfter = await getInventory(getAAfterDelete);
            const dataAAfter = await resAAfter.json();
            expect(dataAAfter.items).toHaveLength(1);
        });

        it('prevents deleting the last remaining stock', async () => {
            mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', ulId: 'ul-test', roles: ['ADMIN'] } } as never);
            const listRes = await getStocks();
            const listData = await listRes.json();
            const singleStockId = listData.stocks[0].id;

            const deleteReq = new Request(`http://localhost/api/inventory/stocks?id=${singleStockId}`, {
                method: 'DELETE',
            });
            const res = await deleteStock(deleteReq);
            expect(res.status).toBe(400);
            const data = await res.json();
            expect(data.error).toBe('Impossible de supprimer le dernier stock');
        });
    });
});
