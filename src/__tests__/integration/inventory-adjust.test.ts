/**
 * Filet de non-régression sur `POST /api/inventory/adjust`.
 *
 * Cette route est sur le chemin critique de la page Inventaire et n'avait aucun test.
 * Le fichier est écrit contre son comportement ACTUEL, avant l'extraction de la logique
 * d'ajustement vers `src/lib/inventory/adjustments.ts` : il doit rester vert, sans la
 * moindre retouche, après le refactor (AC-N1).
 *
 * Couvre AC-N1 → AC-N6.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/auth';
import { POST as adjustRoute } from '@/app/api/inventory/adjust/route';
import { db } from './setup';

const mockedAuth = vi.mocked(auth);

const ADMIN = { user: { email: 'admin@test.com', name: 'Alex Admin', ulId: 'ul-test', roles: ['ADMIN'] } };
const CHVL = { user: { email: 'chvl@test.com', name: 'Camille Chauffeur', ulId: 'ul-test', roles: ['CHVL'] } };

function makeRequest(body: unknown): Request {
    return new Request('http://localhost/api/inventory/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

/** Crée un article et ses lots, et retourne l'id de l'article. */
async function createItem(
    name: string,
    batches: Array<{ quantity: number; expiryDate: string | null }> = [],
    opts: { ulId?: string } = {},
): Promise<string> {
    const id = crypto.randomUUID();
    const total = batches.reduce((sum, b) => sum + b.quantity, 0);
    await db.execute({
        sql: `INSERT INTO "InvItem" (id, stockId, name, category, quantity, minStock, notes, ulId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [id, null, name, null, total, null, null, opts.ulId ?? 'ul-test'],
    });
    for (const b of batches) {
        await db.execute({
            sql: `INSERT INTO "InvBatch" (id, itemId, quantity, expiryDate) VALUES (?, ?, ?, ?)`,
            args: [crypto.randomUUID(), id, b.quantity, b.expiryDate],
        });
    }
    return id;
}

async function quantityOf(itemId: string): Promise<number> {
    const res = await db.execute({ sql: `SELECT quantity FROM "InvItem" WHERE id = ?`, args: [itemId] });
    return Number(res.rows[0].quantity);
}

/** Lots triés en ordre FEFO (dates croissantes, sans date en dernier). */
async function batchesOf(itemId: string) {
    const res = await db.execute({
        sql: `SELECT quantity, expiryDate FROM "InvBatch" WHERE itemId = ?
              ORDER BY CASE WHEN expiryDate IS NULL THEN 1 ELSE 0 END, expiryDate ASC`,
        args: [itemId],
    });
    return res.rows.map(r => ({ quantity: Number(r.quantity), expiryDate: r.expiryDate as string | null }));
}

async function logsOf(itemId: string) {
    const res = await db.execute({
        sql: `SELECT "change", userName, note FROM "InvStockLog" WHERE itemId = ?`,
        args: [itemId],
    });
    return res.rows.map(r => ({ change: Number(r.change), userName: r.userName as string, note: r.note as string | null }));
}

/** Somme réelle des lots — sert à épingler l'accord entre `InvItem.quantity` et ses lots. */
async function batchSumOf(itemId: string): Promise<number> {
    const res = await db.execute({
        sql: `SELECT COALESCE(SUM(quantity), 0) AS s FROM "InvBatch" WHERE itemId = ?`,
        args: [itemId],
    });
    return Number(res.rows[0].s);
}

beforeEach(async () => {
    await db.execute(`DELETE FROM "InvStockLog"`);
    await db.execute(`DELETE FROM "InvBatch"`);
    await db.execute(`DELETE FROM "InvItem"`);
    await db.execute(`DELETE FROM "InvStockList"`);
    mockedAuth.mockResolvedValue(ADMIN as never);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('POST /api/inventory/adjust', () => {
    // ── AC-N2 ────────────────────────────────────────────────────────────────
    describe('auth & validation (AC-N2)', () => {
        it('retourne 401 sans session', async () => {
            mockedAuth.mockResolvedValue(null as never);
            const res = await adjustRoute(makeRequest({ itemId: 'x', change: 1 }));
            expect(res.status).toBe(401);
        });

        it('retourne 403 pour un CHVL', async () => {
            mockedAuth.mockResolvedValue(CHVL as never);
            const res = await adjustRoute(makeRequest({ itemId: 'x', change: 1 }));
            expect(res.status).toBe(403);
        });

        it('retourne 400 quand `change` est absent', async () => {
            const res = await adjustRoute(makeRequest({ itemId: 'x' }));
            expect(res.status).toBe(400);
            const body = await res.json();
            expect(body.error).toBe('Données invalides');
        });

        it('retourne 400 quand `change` n\'est pas un nombre', async () => {
            const res = await adjustRoute(makeRequest({ itemId: 'x', change: 'deux' }));
            expect(res.status).toBe(400);
        });

        it('retourne 400 quand `itemId` est vide', async () => {
            const res = await adjustRoute(makeRequest({ itemId: '', change: 1 }));
            expect(res.status).toBe(400);
        });

        it('retourne 404 pour un article inexistant', async () => {
            const res = await adjustRoute(makeRequest({ itemId: 'inconnu', change: 1 }));
            expect(res.status).toBe(404);
        });

        it('retourne 404 pour un article d\'une autre UL, sans rien écrire', async () => {
            const itemId = await createItem('Compresses', [{ quantity: 5, expiryDate: null }], { ulId: 'ul-autre' });

            const res = await adjustRoute(makeRequest({ itemId, change: -3 }));
            expect(res.status).toBe(404);

            expect(await quantityOf(itemId)).toBe(5);
            expect(await batchesOf(itemId)).toEqual([{ quantity: 5, expiryDate: null }]);
            expect(await logsOf(itemId)).toHaveLength(0);
        });
    });

    // ── AC-N5 ────────────────────────────────────────────────────────────────
    describe('ajout (AC-N5)', () => {
        it('alimente le lot existant portant la même date, sans en créer un nouveau', async () => {
            const itemId = await createItem('Gants', [{ quantity: 3, expiryDate: '2030-01-01' }]);

            const res = await adjustRoute(makeRequest({ itemId, change: 5, expiryDate: '2030-01-01' }));
            expect(res.status).toBe(200);
            expect((await res.json()).newQuantity).toBe(8);

            expect(await batchesOf(itemId)).toEqual([{ quantity: 8, expiryDate: '2030-01-01' }]);
            expect(await quantityOf(itemId)).toBe(8);
        });

        it('crée un lot pour une date inédite', async () => {
            const itemId = await createItem('Gants', [{ quantity: 3, expiryDate: '2030-01-01' }]);

            const res = await adjustRoute(makeRequest({ itemId, change: 5, expiryDate: '2031-06-01' }));
            expect(res.status).toBe(200);

            expect(await batchesOf(itemId)).toEqual([
                { quantity: 3, expiryDate: '2030-01-01' },
                { quantity: 5, expiryDate: '2031-06-01' },
            ]);
            expect(await quantityOf(itemId)).toBe(8);
        });

        it('alimente le lot sans date quand `expiryDate` est absent', async () => {
            const itemId = await createItem('Gants', [{ quantity: 2, expiryDate: null }]);

            const res = await adjustRoute(makeRequest({ itemId, change: 4 }));
            expect(res.status).toBe(200);

            expect(await batchesOf(itemId)).toEqual([{ quantity: 6, expiryDate: null }]);
            expect(await quantityOf(itemId)).toBe(6);
        });

        it('crée le lot sans date s\'il n\'existe pas', async () => {
            const itemId = await createItem('Gants', []);

            const res = await adjustRoute(makeRequest({ itemId, change: 4, expiryDate: null }));
            expect(res.status).toBe(200);

            expect(await batchesOf(itemId)).toEqual([{ quantity: 4, expiryDate: null }]);
            expect(await quantityOf(itemId)).toBe(4);
        });
    });

    // ── AC-N5 ────────────────────────────────────────────────────────────────
    describe('retrait FEFO (AC-N5)', () => {
        it('vide les lots dans l\'ordre FEFO sur 3 lots', async () => {
            const itemId = await createItem('Masques', [
                { quantity: 2, expiryDate: '2025-01-01' },
                { quantity: 3, expiryDate: '2026-01-01' },
                { quantity: 4, expiryDate: null },
            ]);

            const res = await adjustRoute(makeRequest({ itemId, change: -7 }));
            expect(res.status).toBe(200);

            expect(await batchesOf(itemId)).toEqual([
                { quantity: 0, expiryDate: '2025-01-01' },
                { quantity: 0, expiryDate: '2026-01-01' },
                { quantity: 2, expiryDate: null },
            ]);
            expect(await quantityOf(itemId)).toBe(2);
        });

        it('plafonne à 0 sur un retrait excessif et journalise la valeur DEMANDÉE', async () => {
            const itemId = await createItem('Masques', [{ quantity: 2, expiryDate: null }]);

            const res = await adjustRoute(makeRequest({ itemId, change: -5, note: 'Inventaire annuel' }));
            expect(res.status).toBe(200);
            expect((await res.json()).newQuantity).toBe(0);

            expect(await quantityOf(itemId)).toBe(0);
            expect(await batchesOf(itemId)).toEqual([{ quantity: 0, expiryDate: null }]);
            expect(await logsOf(itemId)).toEqual([
                { change: -5, userName: 'Alex Admin', note: 'Inventaire annuel' },
            ]);
        });

        it('écrit une ligne d\'historique par ajustement', async () => {
            const itemId = await createItem('Masques', [{ quantity: 10, expiryDate: null }]);

            await adjustRoute(makeRequest({ itemId, change: -1 }));
            await adjustRoute(makeRequest({ itemId, change: 3 }));

            const logs = await logsOf(itemId);
            expect(logs).toHaveLength(2);
            expect(logs.map(l => l.change).sort((a, b) => a - b)).toEqual([-1, 3]);
        });
    });

    // ── AC-N3 / AC-N4 ────────────────────────────────────────────────────────
    describe('deductFromNoDate (AC-N3, AC-N4)', () => {
        it('refuse en 400 quand le lot sans date est insuffisant, sans rien écrire', async () => {
            const itemId = await createItem('Sérum', [{ quantity: 2, expiryDate: null }]);

            const res = await adjustRoute(makeRequest({
                itemId, change: 5, expiryDate: '2030-03-01', deductFromNoDate: true,
            }));
            expect(res.status).toBe(400);
            expect((await res.json()).error).toBe('Quantité "sans date" insuffisante pour effectuer le découpage');

            expect(await batchesOf(itemId)).toEqual([{ quantity: 2, expiryDate: null }]);
            expect(await quantityOf(itemId)).toBe(2);
            expect(await logsOf(itemId)).toHaveLength(0);
        });

        it('refuse en 400 quand aucun lot sans date n\'existe', async () => {
            const itemId = await createItem('Sérum', [{ quantity: 9, expiryDate: '2029-01-01' }]);

            const res = await adjustRoute(makeRequest({
                itemId, change: 5, expiryDate: '2030-03-01', deductFromNoDate: true,
            }));
            expect(res.status).toBe(400);
            expect(await batchesOf(itemId)).toEqual([{ quantity: 9, expiryDate: '2029-01-01' }]);
        });

        it('découpe le lot sans date vers un lot daté à quantité totale constante', async () => {
            const itemId = await createItem('Sérum', [{ quantity: 10, expiryDate: null }]);

            const res = await adjustRoute(makeRequest({
                itemId, change: 4, expiryDate: '2030-03-01', deductFromNoDate: true,
            }));
            expect(res.status).toBe(200);

            expect(await batchesOf(itemId)).toEqual([
                { quantity: 4, expiryDate: '2030-03-01' },
                { quantity: 6, expiryDate: null },
            ]);
            // Le découpage déplace du stock, il n'en ajoute pas.
            expect(await quantityOf(itemId)).toBe(10);
            expect(await batchSumOf(itemId)).toBe(10);
        });

        it('découpe vers un lot daté DÉJÀ existant sans en créer un second', async () => {
            const itemId = await createItem('Sérum', [
                { quantity: 10, expiryDate: null },
                { quantity: 1, expiryDate: '2030-03-01' },
            ]);

            const res = await adjustRoute(makeRequest({
                itemId, change: 4, expiryDate: '2030-03-01', deductFromNoDate: true,
            }));
            expect(res.status).toBe(200);

            expect(await batchesOf(itemId)).toEqual([
                { quantity: 5, expiryDate: '2030-03-01' },
                { quantity: 6, expiryDate: null },
            ]);
            expect(await quantityOf(itemId)).toBe(11);
        });
    });

    // ── AC-N6 ────────────────────────────────────────────────────────────────
    describe('écriture concurrente (AC-N6)', () => {
        it('compte un lot inséré pendant l\'ajustement au lieu de l\'écraser', async () => {
            const itemId = await createItem('Compresses', [{ quantity: 10, expiryDate: null }]);

            // Le lot concurrent est inséré juste après la PREMIÈRE lecture des lots — la
            // fenêtre exacte entre l'état lu et les écritures. `InvItem.quantity` doit
            // refléter la somme de TOUS les lots, pas le total dérivé de l'état lu.
            const realExecute = db.execute.bind(db);
            let injected = false;
            vi.spyOn(db, 'execute').mockImplementation(async (stmt: Parameters<typeof realExecute>[0]) => {
                const result = await realExecute(stmt);
                const sql = typeof stmt === 'string' ? stmt : stmt.sql;
                if (!injected && /SELECT/i.test(sql) && /FROM "InvBatch"/.test(sql)) {
                    injected = true;
                    await realExecute({
                        sql: `INSERT INTO "InvBatch" (id, itemId, quantity, expiryDate) VALUES (?, ?, ?, ?)`,
                        args: [crypto.randomUUID(), itemId, 7, '2032-12-01'],
                    });
                }
                return result;
            });

            const res = await adjustRoute(makeRequest({ itemId, change: -4 }));
            expect(res.status).toBe(200);
            expect(injected).toBe(true);

            vi.restoreAllMocks();

            // 10 - 4 = 6 sur le lot lu, + 7 sur le lot concurrent.
            expect(await batchSumOf(itemId)).toBe(13);
            expect(await quantityOf(itemId)).toBe(13);
        });
    });
});
