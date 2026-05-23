import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST as adjustPOST } from '@/app/api/inventory/adjust/route';
import { POST as inventoryPOST } from '@/app/api/inventory/route';
import { db } from '@/lib/db';
import { auth } from '@/auth';

vi.mock('@/auth', () => ({
    auth: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
    db: {
        execute: vi.fn(),
    },
}));

describe('Inventory Rework API', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('POST /api/inventory/adjust', () => {
        it('should update quantity and log the change', async () => {
            (auth as vi.Mock).mockResolvedValue({
                user: { name: 'Test User', roles: ['ADMIN'] },
            });

            (db.execute as vi.Mock)
                .mockResolvedValueOnce({ rows: [] }) // SELECT existing batch (empty)
                .mockResolvedValueOnce({ rowsAffected: 1 }) // INSERT InvBatch
                .mockResolvedValueOnce({ rows: [{ total: 15 }] }) // SELECT total quantity
                .mockResolvedValueOnce({ rowsAffected: 1 }) // UPDATE InvItem
                .mockResolvedValueOnce({}); // INSERT InvStockLog

            const req = new Request('http://localhost/api/inventory/adjust', {
                method: 'POST',
                body: JSON.stringify({ itemId: 'item-1', change: 15, note: 'Test' }),
            });

            const res = await adjustPOST(req);
            const data = await res.json();

            expect(res.status).toBe(200);
            expect(data.newQuantity).toBe(15);
            expect(db.execute).toHaveBeenCalledTimes(5);
        });

        it('should return 403 if user is not authorized', async () => {
            (auth as vi.Mock).mockResolvedValue({
                user: { name: 'Guest', roles: ['GUEST'] },
            });

            const req = new Request('http://localhost/api/inventory/adjust', {
                method: 'POST',
                body: JSON.stringify({ itemId: 'item-1', change: 5 }),
            });

            const res = await adjustPOST(req);
            expect(res.status).toBe(403);
        });
    });

    describe('POST /api/inventory', () => {
        it('should create a new item', async () => {
            (auth as vi.Mock).mockResolvedValue({
                user: { name: 'Admin', roles: ['ADMIN'] },
            });

            (db.execute as vi.Mock).mockResolvedValue({});

            const req = new Request('http://localhost/api/inventory', {
                method: 'POST',
                body: JSON.stringify({ name: 'New Item', quantity: 10 }),
            });

            const res = await inventoryPOST(req);
            expect(res.status).toBe(201);
            expect(db.execute).toHaveBeenCalled();
        });
    });
});
