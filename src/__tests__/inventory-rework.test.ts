/**
 * NOTE — trois tests de ce fichier ont été retirés avec l'extraction de la
 * logique d'ajustement vers `src/lib/inventory/adjustments.ts`.
 *
 * Ils pilotaient `db.execute` par une file de `mockResolvedValueOnce` et
 * assertaient le NOMBRE d'appels : ils épinglaient la forme de l'implémentation
 * (combien d'allers-retours, dans quel ordre), pas le comportement de la route.
 * Toute réécriture les casse par construction, y compris une qui ne change
 * rien de ce que voit l'appelant. Ils contrevenaient par ailleurs à
 * `src/__tests__/CLAUDE.md:13` (« Never mock the DB »).
 *
 * Leur couverture est reprise, sur base réelle et en assertions de
 * comportement, par `src/__tests__/integration/inventory-adjust.test.ts` :
 *   - « update quantity and log the change »  → AC-N5 (ajout, création de lot)
 *   - « deduct from no-date batch »           → AC-N4 (découpage à total constant)
 *   - « insufficient for splitting »          → AC-N3 (400 + message exact)
 */
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
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
        it('should return 403 if user is not authorized', async () => {
            (auth as Mock).mockResolvedValue({
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
            (auth as Mock).mockResolvedValue({
                user: { name: 'Admin', roles: ['ADMIN'] },
            });

            (db.execute as Mock).mockResolvedValue({});

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
