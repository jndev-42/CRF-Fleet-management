import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/auth';
import { POST as duplicateStockRoute } from '@/app/api/inventory/stocks/duplicate/route';
import { GET as getStocks } from '@/app/api/inventory/stocks/route';
import { db } from './setup';

const mockedAuth = vi.mocked(auth);

const ADMIN = { user: { email: 'admin@test.com', name: 'Alex Admin', ulId: 'ul-test', roles: ['ADMIN'] } };

function makeRequest(body: unknown): Request {
    return new Request('http://localhost/api/inventory/stocks/duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

/** Crée un stock et retourne son id. */
async function createStock(name: string, ulId = 'ul-test', isDefault = 0): Promise<string> {
    const id = crypto.randomUUID();
    await db.execute({
        sql: `INSERT INTO "InvStockList" (id, name, ulId, isDefault) VALUES (?, ?, ?, ?)`,
        args: [id, name, ulId, isDefault],
    });
    return id;
}

/** Crée un item et ses lots, et retourne l'id de l'item. */
async function createItem(
    stockId: string,
    name: string,
    batches: Array<{ quantity: number; expiryDate: string | null }> = [],
    opts: { ulId?: string; category?: string | null; minStock?: number | null; notes?: string | null } = {}
): Promise<string> {
    const id = crypto.randomUUID();
    const total = batches.reduce((sum, b) => sum + b.quantity, 0);
    await db.execute({
        sql: `INSERT INTO "InvItem" (id, stockId, name, category, quantity, minStock, notes, ulId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
            id,
            stockId,
            name,
            opts.category ?? null,
            total,
            opts.minStock ?? null,
            opts.notes ?? null,
            opts.ulId ?? 'ul-test',
        ],
    });
    for (const b of batches) {
        await db.execute({
            sql: `INSERT INTO "InvBatch" (id, itemId, quantity, expiryDate) VALUES (?, ?, ?, ?)`,
            args: [crypto.randomUUID(), id, b.quantity, b.expiryDate],
        });
    }
    return id;
}

async function itemsOf(stockId: string) {
    const res = await db.execute({
        sql: `SELECT * FROM "InvItem" WHERE stockId = ? ORDER BY name ASC`,
        args: [stockId],
    });
    return res.rows;
}

async function batchesOf(itemId: string) {
    const res = await db.execute({
        sql: `SELECT quantity, expiryDate FROM "InvBatch" WHERE itemId = ? ORDER BY expiryDate IS NOT NULL, expiryDate ASC, quantity ASC`,
        args: [itemId],
    });
    return res.rows.map(r => ({ quantity: Number(r.quantity), expiryDate: r.expiryDate as string | null }));
}

async function logsOf(itemId: string) {
    const res = await db.execute({
        sql: `SELECT "change", userName, note FROM "InvStockLog" WHERE itemId = ?`,
        args: [itemId],
    });
    return res.rows;
}

async function countAll() {
    const tables = ['InvStockList', 'InvItem', 'InvBatch', 'InvStockLog'];
    const counts: Record<string, number> = {};
    for (const t of tables) {
        const res = await db.execute(`SELECT COUNT(*) as c FROM "${t}"`);
        counts[t] = Number(res.rows[0].c);
    }
    return counts;
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

describe('POST /api/inventory/stocks/duplicate', () => {
    describe('auth & validation', () => {
        it('retourne 401 sans session', async () => {
            // @ts-expect-error — session nulle pour le test
            mockedAuth.mockResolvedValue(null);
            const res = await duplicateStockRoute(makeRequest({ sourceStockId: 'x', name: 'Copie' }));
            expect(res.status).toBe(401);
        });

        it('retourne 403 pour un rôle inférieur à ADMIN', async () => {
            mockedAuth.mockResolvedValue({ user: { email: 'chvl@test.com', ulId: 'ul-test', roles: ['CHVL'] } } as never);
            const res = await duplicateStockRoute(makeRequest({ sourceStockId: 'x', name: 'Copie' }));
            expect(res.status).toBe(403);
        });

        it('retourne 400 sur un corps vide', async () => {
            const res = await duplicateStockRoute(makeRequest({}));
            expect(res.status).toBe(400);
            const data = await res.json();
            expect(data.error).toBe('Nom et stock source requis');
            expect(data.details).toBeDefined();
        });

        it('retourne 400 quand le nom est vide après trim', async () => {
            const sourceId = await createStock('Stock Principal', 'ul-test', 1);
            const res = await duplicateStockRoute(makeRequest({ sourceStockId: sourceId, name: '   ' }));
            expect(res.status).toBe(400);
        });

        it('trime le nom avant insertion', async () => {
            const sourceId = await createStock('Stock Principal', 'ul-test', 1);
            const res = await duplicateStockRoute(makeRequest({ sourceStockId: sourceId, name: '  Copie  ' }));
            expect(res.status).toBe(201);
            expect((await res.json()).name).toBe('Copie');
        });

        it('retourne 404 pour un stock source d\'une autre UL', async () => {
            const foreignId = await createStock('Stock Autre UL', 'ul-autre', 1);
            const res = await duplicateStockRoute(makeRequest({ sourceStockId: foreignId, name: 'Copie' }));
            expect(res.status).toBe(404);
            expect((await res.json()).error).toBe('Stock source introuvable');
        });
    });

    describe('copie sans le stock actuel (copyStock: false)', () => {
        it('copie les articles avec une quantité à zéro, sans lot ni historique', async () => {
            const sourceId = await createStock('Stock Principal', 'ul-test', 1);
            await createItem(sourceId, 'Compresses', [{ quantity: 12, expiryDate: '2027-05-01' }], {
                category: 'Pansements',
                minStock: 5,
                notes: 'Boîte de 10',
            });
            await createItem(sourceId, 'Gants', [{ quantity: 30, expiryDate: null }]);

            const res = await duplicateStockRoute(makeRequest({ sourceStockId: sourceId, name: 'Copie' }));
            expect(res.status).toBe(201);
            const body = await res.json();
            expect(body).toMatchObject({ name: 'Copie', ulId: 'ul-test', isDefault: 0, itemsCopied: 2, batchesCopied: 0 });

            const copied = await itemsOf(body.id);
            expect(copied).toHaveLength(2);

            const compresses = copied.find(i => i.name === 'Compresses')!;
            expect(Number(compresses.quantity)).toBe(0);
            expect(compresses.category).toBe('Pansements');
            expect(Number(compresses.minStock)).toBe(5);
            expect(compresses.notes).toBe('Boîte de 10');
            expect(compresses.ulId).toBe('ul-test');
            expect(compresses.stockId).toBe(body.id);

            for (const item of copied) {
                expect(await batchesOf(item.id as string)).toHaveLength(0);
                expect(await logsOf(item.id as string)).toHaveLength(0);
            }
        });
    });

    describe('copie avec le stock actuel (copyStock: true)', () => {
        it('copie les lots à l\'identique et écrit une ligne d\'import par article non vide', async () => {
            const sourceId = await createStock('Stock Principal', 'ul-test', 1);
            const compressesId = await createItem(sourceId, 'Compresses', [
                { quantity: 5, expiryDate: '2027-01-01' },
                { quantity: 5, expiryDate: '2027-01-01' },
                { quantity: 7, expiryDate: '2028-03-15' },
                { quantity: 3, expiryDate: null },
            ]);
            await createItem(sourceId, 'Garrot', [{ quantity: 0, expiryDate: '2026-12-31' }]);

            const res = await duplicateStockRoute(
                makeRequest({ sourceStockId: sourceId, name: 'Copie', copyStock: true })
            );
            expect(res.status).toBe(201);
            const body = await res.json();
            expect(body.itemsCopied).toBe(2);
            expect(body.batchesCopied).toBe(5);

            const copied = await itemsOf(body.id);
            const compresses = copied.find(i => i.name === 'Compresses')!;
            const garrot = copied.find(i => i.name === 'Garrot')!;

            // Multi-ensemble identique : doublons exacts conservés, NULL préservé.
            expect(await batchesOf(compresses.id as string)).toEqual(await batchesOf(compressesId));
            expect(Number(compresses.quantity)).toBe(20);

            const logs = await logsOf(compresses.id as string);
            expect(logs).toHaveLength(1);
            expect(Number(logs[0].change)).toBe(20);
            expect(logs[0].userName).toBe('Alex Admin');
            expect(logs[0].note).toBe('Import initial — dupliqué depuis Stock Principal');

            // Article à quantité totale nulle : lot copié, mais aucune ligne d'historique.
            expect(await batchesOf(garrot.id as string)).toEqual([{ quantity: 0, expiryDate: '2026-12-31' }]);
            expect(Number(garrot.quantity)).toBe(0);
            expect(await logsOf(garrot.id as string)).toHaveLength(0);
        });

        it('copie un article sans aucun lot avec une quantité à zéro et aucun historique', async () => {
            const sourceId = await createStock('Stock Principal', 'ul-test', 1);
            await createItem(sourceId, 'Attelle', []);

            const res = await duplicateStockRoute(
                makeRequest({ sourceStockId: sourceId, name: 'Copie', copyStock: true })
            );
            const body = await res.json();
            expect(body.batchesCopied).toBe(0);

            const [attelle] = await itemsOf(body.id);
            expect(Number(attelle.quantity)).toBe(0);
            expect(await batchesOf(attelle.id as string)).toHaveLength(0);
            expect(await logsOf(attelle.id as string)).toHaveLength(0);
        });
    });

    describe('invariants', () => {
        it('laisse le stock source strictement inchangé', async () => {
            const sourceId = await createStock('Stock Principal', 'ul-test', 1);
            const itemId = await createItem(sourceId, 'Compresses', [{ quantity: 12, expiryDate: '2027-05-01' }]);
            const before = { items: await itemsOf(sourceId), batches: await batchesOf(itemId), logs: await logsOf(itemId) };

            await duplicateStockRoute(makeRequest({ sourceStockId: sourceId, name: 'Copie', copyStock: true }));

            expect(await itemsOf(sourceId)).toEqual(before.items);
            expect(await batchesOf(itemId)).toEqual(before.batches);
            expect(await logsOf(itemId)).toEqual(before.logs);
        });

        it('duplique un stock vide', async () => {
            const sourceId = await createStock('Stock Vide', 'ul-test', 1);
            const res = await duplicateStockRoute(makeRequest({ sourceStockId: sourceId, name: 'Copie', copyStock: true }));
            expect(res.status).toBe(201);
            const body = await res.json();
            expect(body.itemsCopied).toBe(0);
            expect(await itemsOf(body.id)).toHaveLength(0);
        });

        it('crée un stock non-défaut même quand la source est le stock par défaut, et le liste', async () => {
            const sourceId = await createStock('Stock Principal', 'ul-test', 1);
            const res = await duplicateStockRoute(makeRequest({ sourceStockId: sourceId, name: 'Copie' }));
            const body = await res.json();
            expect(body.isDefault).toBe(0);

            const listData = await (await getStocks()).json();
            const names = listData.stocks.map((s: { name: string }) => s.name);
            expect(names).toContain('Copie');
            expect(listData.stocks.find((s: { name: string }) => s.name === 'Copie').isDefault).toBe(0);
        });

        it('ne copie pas un article rattaché à une autre UL', async () => {
            const sourceId = await createStock('Stock Principal', 'ul-test', 1);
            await createItem(sourceId, 'Compresses', [{ quantity: 4, expiryDate: null }]);
            // Article mal rattaché : même stockId, mais une autre UL.
            await createItem(sourceId, 'Intrus', [{ quantity: 9, expiryDate: null }], { ulId: 'ul-autre' });

            const res = await duplicateStockRoute(makeRequest({ sourceStockId: sourceId, name: 'Copie' }));
            const body = await res.json();
            expect(body.itemsCopied).toBe(1);
            expect((await itemsOf(body.id)).map(i => i.name)).toEqual(['Compresses']);
        });

        it('copie correctement un stock dont les écritures franchissent la tranche de 500', async () => {
            // 200 articles × (1 article + 1 lot + 1 ligne d'historique) + 1 stock = 601
            // instructions : la copie s'étale sur deux paquets `tx.batch`.
            const sourceId = await createStock('Gros Stock', 'ul-test', 1);
            for (let i = 0; i < 200; i++) {
                await createItem(sourceId, `Article ${String(i).padStart(3, '0')}`, [
                    { quantity: i + 1, expiryDate: '2027-06-30' },
                ]);
            }

            const res = await duplicateStockRoute(
                makeRequest({ sourceStockId: sourceId, name: 'Gros Stock (copie)', copyStock: true })
            );
            expect(res.status).toBe(201);
            const body = await res.json();
            expect(body.itemsCopied).toBe(200);
            expect(body.batchesCopied).toBe(200);

            const copied = await itemsOf(body.id);
            expect(copied).toHaveLength(200);

            // Vérifie les deux extrémités, de part et d'autre de la frontière de paquet.
            const first = copied.find(i => i.name === 'Article 000')!;
            const last = copied.find(i => i.name === 'Article 199')!;
            expect(Number(first.quantity)).toBe(1);
            expect(Number(last.quantity)).toBe(200);
            expect(await batchesOf(first.id as string)).toEqual([{ quantity: 1, expiryDate: '2027-06-30' }]);
            expect(await batchesOf(last.id as string)).toEqual([{ quantity: 200, expiryDate: '2027-06-30' }]);
            expect(await logsOf(last.id as string)).toHaveLength(1);

            const logCount = await db.execute({
                sql: `SELECT COUNT(*) as c FROM "InvStockLog" WHERE itemId IN (SELECT id FROM "InvItem" WHERE stockId = ?)`,
                args: [body.id],
            });
            expect(Number(logCount.rows[0].c)).toBe(200);
        });

        it('défait le premier paquet quand l\'échec survient dans un paquet postérieur', async () => {
            // Le test de collision ci-dessous tient dans un seul `tx.batch`. Ici on vise
            // le cas propre au découpage : un paquet déjà exécuté et acquitté par le
            // serveur doit être défait par l'échec d'un paquet suivant.
            const sourceId = await createStock('Gros Stock', 'ul-test', 1);
            for (let i = 0; i < 200; i++) {
                await createItem(sourceId, `Article ${i}`, [{ quantity: 1, expiryDate: null }]);
            }
            const before = await countAll();

            // 1 + 200 × 3 = 601 instructions → 2 paquets. On fait échouer le second.
            const realTransaction = db.transaction.bind(db);
            vi.spyOn(db, 'transaction').mockImplementation(async (mode?: 'read' | 'write' | 'deferred') => {
                const tx = await realTransaction(mode as 'write');
                const realBatch = tx.batch.bind(tx);
                let call = 0;
                tx.batch = async stmts => {
                    call += 1;
                    if (call === 2) throw new Error('échec réseau simulé sur le 2e paquet');
                    return realBatch(stmts);
                };
                return tx;
            });

            const res = await duplicateStockRoute(
                makeRequest({ sourceStockId: sourceId, name: 'Copie', copyStock: true })
            );
            expect(res.status).toBe(500);

            // Le premier paquet (stock + ~166 articles + leurs lots) doit avoir été défait.
            expect(await countAll()).toEqual(before);
        });

        it('n\'écrit aucune ligne quand la copie échoue en cours de route', async () => {
            const sourceId = await createStock('Stock Principal', 'ul-test', 1);
            await createItem(sourceId, 'Compresses', []);
            await createItem(sourceId, 'Gants', []);
            const before = await countAll();

            // Un uuid constant : le 1er article s'insère, le 2e viole la clé primaire.
            vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('fixed-uuid-0000-0000-0000-000000000000');

            const res = await duplicateStockRoute(makeRequest({ sourceStockId: sourceId, name: 'Copie' }));
            expect(res.status).toBe(500);

            expect(await countAll()).toEqual(before);
            const orphan = await db.execute({
                sql: `SELECT id FROM "InvStockList" WHERE id = ?`,
                args: ['fixed-uuid-0000-0000-0000-000000000000'],
            });
            expect(orphan.rows).toHaveLength(0);
        });
    });
});
