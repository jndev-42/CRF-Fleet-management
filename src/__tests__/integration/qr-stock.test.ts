/**
 * Tests d'intégration — routes de CONSOMMATION du QR stock :
 *   GET  /api/qr-stock/[token]/stock
 *   POST /api/qr-stock/[token]/adjust
 *
 * Couvre AC-R1 → AC-R7, AC-R2″, AC-A1 → AC-A22, AC-T8, AC-G7.
 *
 * Ces routes n'ont AUCUN filtre d'UL : c'est la décision de conception, et
 * AC-R6 / AC-A16 l'épinglent explicitement pour qu'un contributeur ultérieur ne
 * la « corrige » pas.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/auth';
import { GET as getStock } from '@/app/api/qr-stock/[token]/stock/route';
import { POST as postAdjust } from '@/app/api/qr-stock/[token]/adjust/route';
import { DELETE as regenerateToken } from '@/app/api/inventory/stocks/[id]/qr-token/route';
import { db } from './setup';
import { ensureStockTableExists } from '@/lib/inventory/stocks';

const mockedAuth = vi.mocked(auth);

const USER_A = { user: { email: 'user@test.com', name: 'Camille Bénévole', ulId: 'ul-a', roles: ['CHVL'] } };
const USER_B = { user: { email: 'autre@test.com', name: 'Bruno Ailleurs', ulId: 'ul-b', roles: ['CHVL'] } };
const ADMIN_A = { user: { email: 'admin@test.com', name: 'Alex Admin', ulId: 'ul-a', roles: ['ADMIN'] } };

const TOKEN = 'token-stock-a';

function withToken(token = TOKEN) {
    return { params: Promise.resolve({ token }) };
}

function makeAdjustRequest(body: unknown, token = TOKEN): Request {
    return new Request(`http://localhost/api/qr-stock/${token}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

function makeGetRequest(token = TOKEN): Request {
    return new Request(`http://localhost/api/qr-stock/${token}/stock`, { method: 'GET' });
}

/** Crée un stock portant `token`, et retourne son id. */
async function createStock(id: string, ulId: string, token: string | null): Promise<string> {
    await db.execute({
        sql: `INSERT INTO "InvStockList" (id, name, ulId, isDefault, qrToken) VALUES (?, ?, ?, 0, ?)`,
        args: [id, `Stock ${id}`, ulId, token],
    });
    return id;
}

async function createItem(
    stockId: string,
    name: string,
    batches: Array<{ quantity: number; expiryDate: string | null }> = [],
    opts: { id?: string; ulId?: string; category?: string | null; minStock?: number | null } = {},
): Promise<string> {
    const id = opts.id ?? crypto.randomUUID();
    const total = batches.reduce((sum, b) => sum + b.quantity, 0);
    await db.execute({
        sql: `INSERT INTO "InvItem" (id, stockId, name, category, quantity, minStock, notes, ulId) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
        args: [id, stockId, name, opts.category ?? null, total, opts.minStock ?? null, opts.ulId ?? 'ul-a'],
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

async function rawQuantityOf(itemId: string): Promise<unknown> {
    const res = await db.execute({ sql: `SELECT quantity FROM "InvItem" WHERE id = ?`, args: [itemId] });
    return res.rows[0].quantity;
}

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
        sql: `SELECT "change", userName, note FROM "InvStockLog" WHERE itemId = ? ORDER BY id ASC`,
        args: [itemId],
    });
    return res.rows.map(r => ({ change: Number(r.change), userName: r.userName as string, note: r.note as string | null }));
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

/** AC-A20 — aucun lot négatif, quel que soit le scénario. */
async function expectNoNegativeBatch() {
    const res = await db.execute(`SELECT COUNT(*) AS c FROM "InvBatch" WHERE quantity < 0`);
    expect(Number(res.rows[0].c)).toBe(0);
}

beforeEach(async () => {
    await ensureStockTableExists();
    await db.execute(`DELETE FROM "InvStockLog"`);
    await db.execute(`DELETE FROM "InvBatch"`);
    await db.execute(`DELETE FROM "InvItem"`);
    await db.execute(`DELETE FROM "InvStockList"`);
    mockedAuth.mockResolvedValue(USER_A as never);
});

afterEach(() => {
    vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/qr-stock/[token]/stock', () => {
    it('retourne 401 sans session (AC-R1)', async () => {
        mockedAuth.mockResolvedValue(null as never);
        const res = await getStock(makeGetRequest(), withToken());
        expect(res.status).toBe(401);
    });

    it('retourne 404 pour un token inconnu (AC-R3)', async () => {
        const res = await getStock(makeGetRequest('inexistant'), withToken('inexistant'));
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: 'QR Code invalide ou expiré' });
    });

    it('retourne la forme complète attendue (AC-R4)', async () => {
        const stockId = await createStock('stock-a', 'ul-a', TOKEN);
        await createItem(stockId, 'Compresses', [{ quantity: 4, expiryDate: '2030-01-01' }], {
            id: 'item-1', category: 'Pansements', minStock: 2,
        });

        const res = await getStock(makeGetRequest(), withToken());
        expect(res.status).toBe(200);
        const body = await res.json();

        expect(body).toEqual({
            stock: { id: stockId, name: 'Stock stock-a' },
            items: [{
                id: 'item-1',
                name: 'Compresses',
                category: 'Pansements',
                quantity: 4,
                minStock: 2,
                batches: [{ expiryDate: '2030-01-01', quantity: 4 }],
            }],
        });
    });

    it('n\'expose que les lots non vides, en ordre FEFO (AC-R5)', async () => {
        const stockId = await createStock('stock-a', 'ul-a', TOKEN);
        await createItem(stockId, 'Masques', [
            { quantity: 1, expiryDate: '2031-01-01' },   // lointain
            { quantity: 2, expiryDate: null },           // sans date
            { quantity: 3, expiryDate: '2024-01-01' },   // périmé
            { quantity: 4, expiryDate: '2026-01-01' },   // proche
            { quantity: 0, expiryDate: '2025-01-01' },   // vide → exclu
        ], { id: 'item-1' });

        const body = await (await getStock(makeGetRequest(), withToken())).json();

        expect(body.items[0].batches).toEqual([
            { expiryDate: '2024-01-01', quantity: 3 },
            { expiryDate: '2026-01-01', quantity: 4 },
            { expiryDate: '2031-01-01', quantity: 1 },
            { expiryDate: null, quantity: 2 },
        ]);
    });

    it('sert un utilisateur d\'une AUTRE UL, avec tous les articles (AC-R6)', async () => {
        const stockId = await createStock('stock-a', 'ul-a', TOKEN);
        await createItem(stockId, 'Article 1', [{ quantity: 1, expiryDate: null }]);
        await createItem(stockId, 'Article 2', [{ quantity: 2, expiryDate: null }]);

        mockedAuth.mockResolvedValue(USER_B as never);
        const res = await getStock(makeGetRequest(), withToken());

        expect(res.status).toBe(200);
        expect((await res.json()).items).toHaveLength(2);
    });

    it('rend un article à 0 sans aucun lot, avec `batches: []` (AC-R7)', async () => {
        const stockId = await createStock('stock-a', 'ul-a', TOKEN);
        await createItem(stockId, 'Article vide', [], { id: 'item-vide' });

        const body = await (await getStock(makeGetRequest(), withToken())).json();

        expect(body.items[0]).toMatchObject({ id: 'item-vide', quantity: 0, batches: [] });
    });

    it('n\'expose pas les articles d\'un autre stock', async () => {
        const stockA = await createStock('stock-a', 'ul-a', TOKEN);
        const stockB = await createStock('stock-b', 'ul-a', 'token-b');
        await createItem(stockA, 'Dans le stock A');
        await createItem(stockB, 'Dans le stock B');

        const body = await (await getStock(makeGetRequest(), withToken())).json();

        expect(body.items.map((i: { name: string }) => i.name)).toEqual(['Dans le stock A']);
    });

    // AC-R2″ / AC-G7
    describe('règle d\'accès (AC-R2″, AC-G7)', () => {
        const cas: Array<[string[], number]> = [
            [['INACTIF'], 403],
            [['GUEST'], 403],
            [['INACTIF', 'CHVL'], 403],
            [['CHVL', 'INACTIF'], 403],
            [[], 200],
            [['CHVL'], 200],
        ];

        for (const [roles, expected] of cas) {
            it(`roles ${JSON.stringify(roles)} → ${expected}`, async () => {
                await createStock('stock-a', 'ul-a', TOKEN);
                mockedAuth.mockResolvedValue({ user: { email: 'x@test.com', name: 'X', ulId: 'ul-a', roles } } as never);

                const res = await getStock(makeGetRequest(), withToken());
                expect(res.status).toBe(expected);
            });
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/qr-stock/[token]/adjust', () => {
    async function seedOneItem(batches: Array<{ quantity: number; expiryDate: string | null }> = []) {
        const stockId = await createStock('stock-a', 'ul-a', TOKEN);
        return createItem(stockId, 'Compresses', batches, { id: 'item-1' });
    }

    describe('auth et validation', () => {
        it('retourne 401 sans session (AC-A1)', async () => {
            mockedAuth.mockResolvedValue(null as never);
            const res = await postAdjust(makeAdjustRequest({ movements: [{ itemId: 'x', change: 1 }] }), withToken());
            expect(res.status).toBe(401);
        });

        it('retourne 403 « Compte inactif » pour un compte bloqué (AC-A1)', async () => {
            mockedAuth.mockResolvedValue({ user: { email: 'x@test.com', roles: ['INACTIF', 'CHVL'] } } as never);
            const res = await postAdjust(makeAdjustRequest({ movements: [{ itemId: 'x', change: 1 }] }), withToken());
            expect(res.status).toBe(403);
            expect((await res.json()).error).toBe('Compte inactif');
        });

        it('autorise un compte SANS aucun rôle (AC-G7)', async () => {
            const itemId = await seedOneItem([{ quantity: 5, expiryDate: null }]);
            mockedAuth.mockResolvedValue({ user: { email: 'x@test.com', name: 'Sans Rôle', ulId: 'ul-a', roles: [] } } as never);

            const res = await postAdjust(makeAdjustRequest({ movements: [{ itemId, change: -1 }] }), withToken());
            expect(res.status).toBe(200);
        });

        it('retourne 400 pour un panier vide (AC-A2)', async () => {
            await seedOneItem();
            const res = await postAdjust(makeAdjustRequest({ movements: [] }), withToken());
            expect(res.status).toBe(400);
        });

        it('retourne 400 si un mouvement vaut 0 — le lot ENTIER est refusé (AC-A3)', async () => {
            const itemId = await seedOneItem([{ quantity: 5, expiryDate: null }]);
            const before = await countAll();

            const res = await postAdjust(makeAdjustRequest({
                movements: [{ itemId, change: 2 }, { itemId, change: 0 }],
            }), withToken());

            expect(res.status).toBe(400);
            expect(await countAll()).toEqual(before);
            expect(await quantityOf(itemId)).toBe(5);
        });

        it('retourne 400 pour un `change` non entier ou absent (AC-A4)', async () => {
            await seedOneItem();
            expect((await postAdjust(makeAdjustRequest({ movements: [{ itemId: 'item-1', change: 1.5 }] }), withToken())).status).toBe(400);
            expect((await postAdjust(makeAdjustRequest({ movements: [{ itemId: 'item-1' }] }), withToken())).status).toBe(400);
        });

        it('retourne 404 pour un token inconnu (AC-A5)', async () => {
            await seedOneItem();
            const res = await postAdjust(
                makeAdjustRequest({ movements: [{ itemId: 'item-1', change: 1 }] }, 'inconnu'),
                withToken('inconnu'),
            );
            expect(res.status).toBe(404);
        });

        it('rejette `deductFromNoDate` en 400 (AC-A17′)', async () => {
            const itemId = await seedOneItem([{ quantity: 10, expiryDate: null }]);

            const res = await postAdjust(makeAdjustRequest({
                movements: [{ itemId, change: 5, expiryDate: '2030-01-01', deductFromNoDate: true }],
            }), withToken());

            expect(res.status).toBe(400);
            expect(await quantityOf(itemId)).toBe(10);
        });

        it('rejette en 400 tout champ inconnu — le panier client doit être projeté (AC-I6′)', async () => {
            const itemId = await seedOneItem([{ quantity: 10, expiryDate: null }]);

            const res = await postAdjust(makeAdjustRequest({
                movements: [{ itemId, change: 1, key: 'k-1', itemName: 'Compresses' }],
            }), withToken());

            expect(res.status).toBe(400);
        });

        it('retourne 400 au-delà de 25 mouvements (AC-A18)', async () => {
            const itemId = await seedOneItem([{ quantity: 100, expiryDate: null }]);
            const movements = Array.from({ length: 26 }, () => ({ itemId, change: 1 }));

            const res = await postAdjust(makeAdjustRequest({ movements }), withToken());
            expect(res.status).toBe(400);
            expect(await quantityOf(itemId)).toBe(100);
        });

        it('accepte exactement 25 mouvements', async () => {
            const itemId = await seedOneItem([{ quantity: 100, expiryDate: null }]);
            const movements = Array.from({ length: 25 }, () => ({ itemId, change: -1 }));

            const res = await postAdjust(makeAdjustRequest({ movements }), withToken());
            expect(res.status).toBe(200);
            expect(await quantityOf(itemId)).toBe(75);
        });

        it('borne la magnitude à ±10 000 (AC-A19)', async () => {
            const itemId = await seedOneItem([{ quantity: 20_000, expiryDate: null }]);

            expect((await postAdjust(makeAdjustRequest({ movements: [{ itemId, change: -10_001 }] }), withToken())).status).toBe(400);
            expect((await postAdjust(makeAdjustRequest({ movements: [{ itemId, change: 10_001 }] }), withToken())).status).toBe(400);

            const ok = await postAdjust(makeAdjustRequest({ movements: [{ itemId, change: -10_000 }] }), withToken());
            expect(ok.status).toBe(200);
            expect(await quantityOf(itemId)).toBe(10_000);
        });

        it('retourne 404 et n\'écrit RIEN si un article appartient à un autre stock (AC-A6)', async () => {
            const stockA = await createStock('stock-a', 'ul-a', TOKEN);
            const stockB = await createStock('stock-b', 'ul-a', 'token-b');
            const itemA = await createItem(stockA, 'Dans A', [{ quantity: 5, expiryDate: null }]);
            const itemB = await createItem(stockB, 'Dans B', [{ quantity: 5, expiryDate: null }]);
            const before = await countAll();

            const res = await postAdjust(makeAdjustRequest({
                movements: [{ itemId: itemA, change: -1 }, { itemId: itemB, change: -1 }],
            }), withToken());

            expect(res.status).toBe(404);
            expect((await res.json()).error).toBe('Article non trouvé dans ce stock');
            expect(await countAll()).toEqual(before);
            expect(await quantityOf(itemA)).toBe(5);
            expect(await quantityOf(itemB)).toBe(5);
        });
    });

    describe('mouvements', () => {
        it('alimente le lot existant portant la même date (AC-A7)', async () => {
            const itemId = await seedOneItem([{ quantity: 3, expiryDate: '2030-01-01' }]);

            const res = await postAdjust(makeAdjustRequest({
                movements: [{ itemId, change: 5, expiryDate: '2030-01-01' }],
            }), withToken());

            expect(res.status).toBe(200);
            expect(await res.json()).toEqual({ success: true, applied: 1 });
            expect(await batchesOf(itemId)).toEqual([{ quantity: 8, expiryDate: '2030-01-01' }]);
            expect(await quantityOf(itemId)).toBe(8);
            await expectNoNegativeBatch();
        });

        it('crée un lot pour une date inédite (AC-A8)', async () => {
            const itemId = await seedOneItem([{ quantity: 3, expiryDate: '2030-01-01' }]);

            await postAdjust(makeAdjustRequest({
                movements: [{ itemId, change: 5, expiryDate: '2031-06-01' }],
            }), withToken());

            expect(await batchesOf(itemId)).toEqual([
                { quantity: 3, expiryDate: '2030-01-01' },
                { quantity: 5, expiryDate: '2031-06-01' },
            ]);
            await expectNoNegativeBatch();
        });

        it('alimente ou crée le lot sans date (AC-A9)', async () => {
            const itemId = await seedOneItem([{ quantity: 2, expiryDate: null }]);
            await postAdjust(makeAdjustRequest({ movements: [{ itemId, change: 3, expiryDate: null }] }), withToken());
            expect(await batchesOf(itemId)).toEqual([{ quantity: 5, expiryDate: null }]);

            const vide = await createItem('stock-a', 'Nouveau', [], { id: 'item-2' });
            await postAdjust(makeAdjustRequest({ movements: [{ itemId: vide, change: 4 }] }), withToken());
            expect(await batchesOf(vide)).toEqual([{ quantity: 4, expiryDate: null }]);
            await expectNoNegativeBatch();
        });

        it('plafonne à 0 et journalise la valeur DEMANDÉE (AC-A10)', async () => {
            const itemId = await seedOneItem([{ quantity: 2, expiryDate: null }]);

            await postAdjust(makeAdjustRequest({
                movements: [{ itemId, change: -5, note: 'Scan QR — retrait (-5)' }],
            }), withToken());

            expect(await batchesOf(itemId)).toEqual([{ quantity: 0, expiryDate: null }]);
            expect(await quantityOf(itemId)).toBe(0);
            expect(await logsOf(itemId)).toEqual([
                { change: -5, userName: 'Camille Bénévole', note: 'Scan QR — retrait (-5)' },
            ]);
            await expectNoNegativeBatch();
        });

        it('applique le FEFO sur 3 lots (AC-A11)', async () => {
            const itemId = await seedOneItem([
                { quantity: 2, expiryDate: '2025-01-01' },
                { quantity: 3, expiryDate: '2026-01-01' },
                { quantity: 4, expiryDate: null },
            ]);

            await postAdjust(makeAdjustRequest({ movements: [{ itemId, change: -7 }] }), withToken());

            expect(await batchesOf(itemId)).toEqual([
                { quantity: 0, expiryDate: '2025-01-01' },
                { quantity: 0, expiryDate: '2026-01-01' },
                { quantity: 2, expiryDate: null },
            ]);
            expect(await quantityOf(itemId)).toBe(2);
            await expectNoNegativeBatch();
        });

        it('écrit une ligne d\'historique nominative par mouvement (AC-A12)', async () => {
            const stockId = await createStock('stock-a', 'ul-a', TOKEN);
            const a = await createItem(stockId, 'A', [{ quantity: 5, expiryDate: null }]);
            const b = await createItem(stockId, 'B', [{ quantity: 5, expiryDate: null }]);
            const c = await createItem(stockId, 'C', [{ quantity: 5, expiryDate: null }]);

            const res = await postAdjust(makeAdjustRequest({
                movements: [{ itemId: a, change: -1 }, { itemId: b, change: 2 }, { itemId: c, change: -3 }],
            }), withToken());

            expect(await res.json()).toEqual({ success: true, applied: 3 });
            const logs = [...await logsOf(a), ...await logsOf(b), ...await logsOf(c)];
            expect(logs).toHaveLength(3);
            expect(logs.every(l => l.userName === 'Camille Bénévole')).toBe(true);
        });

        it('retombe sur l\'email puis sur « Inconnu » pour `userName` (AC-A13)', async () => {
            const itemId = await seedOneItem([{ quantity: 9, expiryDate: null }]);

            mockedAuth.mockResolvedValue({ user: { email: 'sansnom@test.com', ulId: 'ul-a', roles: ['CHVL'] } } as never);
            await postAdjust(makeAdjustRequest({ movements: [{ itemId, change: -1 }] }), withToken());

            mockedAuth.mockResolvedValue({ user: { ulId: 'ul-a', roles: ['CHVL'] } } as never);
            await postAdjust(makeAdjustRequest({ movements: [{ itemId, change: -1 }] }), withToken());

            expect((await logsOf(itemId)).map(l => l.userName).sort()).toEqual(['Inconnu', 'sansnom@test.com']);
        });

        it('ajuste avec succès un stock d\'une AUTRE UL (AC-A16)', async () => {
            const itemId = await seedOneItem([{ quantity: 5, expiryDate: null }]);
            mockedAuth.mockResolvedValue(USER_B as never);

            const res = await postAdjust(makeAdjustRequest({ movements: [{ itemId, change: -2 }] }), withToken());

            expect(res.status).toBe(200);
            expect(await quantityOf(itemId)).toBe(3);
        });

        it('garde `InvItem.quantity` égale à la somme des lots sur 3 mouvements du MÊME article (AC-A15)', async () => {
            const itemId = await seedOneItem([]);

            const res = await postAdjust(makeAdjustRequest({
                movements: [
                    { itemId, change: 5, expiryDate: '2030-01-01' },
                    { itemId, change: -3 },
                    { itemId, change: 2, expiryDate: '2031-01-01' },
                ],
            }), withToken());

            expect(res.status).toBe(200);
            expect(await quantityOf(itemId)).toBe(4);

            const sum = await db.execute({
                sql: `SELECT COALESCE(SUM(quantity), 0) AS s FROM "InvBatch" WHERE itemId = ? AND quantity > 0`,
                args: [itemId],
            });
            expect(Number(sum.rows[0].s)).toBe(4);
            await expectNoNegativeBatch();
        });

        it('écrit 0 et non NULL quand tous les lots tombent à vide (AC-A22)', async () => {
            const itemId = await seedOneItem([{ quantity: 3, expiryDate: '2030-01-01' }]);

            await postAdjust(makeAdjustRequest({ movements: [{ itemId, change: -3 }] }), withToken());

            expect(await rawQuantityOf(itemId)).toBe(0);
            expect(await rawQuantityOf(itemId)).not.toBeNull();
        });
    });

    describe('atomicité', () => {
        it('ne laisse AUCUNE écriture quand le dernier mouvement échoue (AC-A14)', async () => {
            const stockId = await createStock('stock-a', 'ul-a', TOKEN);
            const a = await createItem(stockId, 'A', [{ quantity: 5, expiryDate: null }]);
            const b = await createItem(stockId, 'B', [{ quantity: 5, expiryDate: null }]);
            const before = await countAll();

            // `crypto.randomUUID` figé : la 2ᵉ insertion de log entre en collision
            // de clé primaire, ce qui fait échouer le paquet APRÈS que le premier
            // mouvement a déjà été planifié.
            vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('fixed-uuid-0000-0000-0000-000000000000');

            const res = await postAdjust(makeAdjustRequest({
                movements: [{ itemId: a, change: -1 }, { itemId: b, change: -2 }],
            }), withToken());

            vi.restoreAllMocks();

            expect(res.status).toBe(500);
            expect(await countAll()).toEqual(before);
            expect(await quantityOf(a)).toBe(5);
            expect(await quantityOf(b)).toBe(5);
        });

        it('n\'émet que quelques allers-retours pour un panier de 25 (AC-A21)', async () => {
            const itemId = await seedOneItem([{ quantity: 100, expiryDate: null }]);

            // L'espion compte ce qui passe sur la TRANSACTION : `db.transaction`
            // rend un objet distinct de `db`, et c'est sa durée de vie qui verrouille
            // la base.
            const realTransaction = db.transaction.bind(db);
            let calls = 0;
            vi.spyOn(db, 'transaction').mockImplementation(async (mode?: 'write' | 'read' | 'deferred') => {
                const tx = await realTransaction(mode ?? 'write');
                const realExecute = tx.execute.bind(tx);
                const realBatch = tx.batch.bind(tx);
                tx.execute = (...args: Parameters<typeof realExecute>) => { calls++; return realExecute(...args); };
                tx.batch = (...args: Parameters<typeof realBatch>) => { calls++; return realBatch(...args); };
                return tx;
            });

            const movements = Array.from({ length: 25 }, () => ({ itemId, change: -1 }));
            const res = await postAdjust(makeAdjustRequest({ movements }), withToken());
            vi.restoreAllMocks();

            expect(res.status).toBe(200);
            expect(calls).toBeLessThanOrEqual(6);
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('régénération du token (AC-T8)', () => {
    it('invalide l\'ancien token : 404 sur la route de consultation', async () => {
        await createStock('stock-a', 'ul-a', TOKEN);

        mockedAuth.mockResolvedValue(ADMIN_A as never);
        const regen = await regenerateToken(
            new Request('http://localhost/api/inventory/stocks/stock-a/qr-token', { method: 'DELETE' }),
            { params: Promise.resolve({ id: 'stock-a' }) },
        );
        expect(regen.status).toBe(200);
        const { token: nouveau } = await regen.json();

        mockedAuth.mockResolvedValue(USER_A as never);
        expect((await getStock(makeGetRequest(), withToken(TOKEN))).status).toBe(404);
        expect((await getStock(makeGetRequest(nouveau), withToken(nouveau))).status).toBe(200);
    });
});
