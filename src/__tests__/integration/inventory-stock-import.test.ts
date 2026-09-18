// @vitest-environment node
// Environnement node et non jsdom : la route lit un `multipart/form-data` via
// `Request.formData()` (undici). Les `File`/`FormData` de jsdom sont rejetés par
// la validation webidl d'undici — le corps multipart ne serait jamais construit.
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/auth';
import { POST as importStockRoute } from '@/app/api/inventory/stocks/import/route';
import { db } from './setup';

const mockedAuth = vi.mocked(auth);

const ADMIN = { user: { email: 'admin@test.com', name: 'Alex Admin', ulId: 'ul-test', roles: ['ADMIN'] } };

const HEADER = 'nom;categorie;quantite;date_peremption;stock_min;notes';

/**
 * Requête multipart identique à celle du navigateur : `File` porte le nom de
 * fichier, dont la route tire l'extension (le type MIME n'est pas fiable).
 */
function makeRequest(csv: string | null, name: string | null, fileName = 'stock.csv'): Request {
    const formData = new FormData();
    if (name !== null) formData.append('name', name);
    if (csv !== null) formData.append('file', new File([csv], fileName, { type: 'text/csv' }));
    return new Request('http://localhost/api/inventory/stocks/import', {
        method: 'POST',
        body: formData,
    });
}

async function stocksOf(ulId: string) {
    const res = await db.execute({
        sql: `SELECT id, name, isDefault FROM "InvStockList" WHERE ulId = ?`,
        args: [ulId],
    });
    return res.rows;
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
        sql: `SELECT quantity, expiryDate FROM "InvBatch" WHERE itemId = ?`,
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

describe('POST /api/inventory/stocks/import', () => {
    describe('auth', () => {
        it('retourne 401 sans session', async () => {
            // @ts-expect-error — session nulle pour le test
            mockedAuth.mockResolvedValue(null);
            const res = await importStockRoute(makeRequest(`${HEADER}\nGarrot;;1;;;\n`, 'Import'));
            expect(res.status).toBe(401);
            expect(await countAll()).toMatchObject({ InvStockList: 0 });
        });

        it('retourne 403 pour un rôle inférieur à ADMIN', async () => {
            mockedAuth.mockResolvedValue({ user: { email: 'cadre@test.com', ulId: 'ul-test', roles: ['CADRE'] } } as never);
            const res = await importStockRoute(makeRequest(`${HEADER}\nGarrot;;1;;;\n`, 'Import'));
            expect(res.status).toBe(403);
            expect(await countAll()).toMatchObject({ InvStockList: 0 });
        });
    });

    describe('validation du fichier', () => {
        it('retourne 400 sans nom de stock', async () => {
            const res = await importStockRoute(makeRequest(`${HEADER}\nGarrot;;1;;;\n`, '   '));
            expect(res.status).toBe(400);
            expect((await res.json()).error).toBe('Le nom du stock est requis');
            expect(await countAll()).toMatchObject({ InvStockList: 0 });
        });

        it('retourne 400 sans fichier', async () => {
            const res = await importStockRoute(makeRequest(null, 'Import'));
            expect(res.status).toBe(400);
            expect((await res.json()).error).toBe('Un fichier CSV est requis');
        });

        it('retourne 400 pour une extension autre que .csv', async () => {
            const res = await importStockRoute(makeRequest(`${HEADER}\nGarrot;;1;;;\n`, 'Import', 'stock.xlsx'));
            expect(res.status).toBe(400);
            expect((await res.json()).error).toContain('.csv');
            expect(await countAll()).toMatchObject({ InvStockList: 0 });
        });

        it('retourne 400 au-delà de 2 Mo, sans lire le contenu', async () => {
            // Fichier volumineux mais parfaitement valide : seul le plafond doit le refuser.
            const padding = 'x'.repeat(2 * 1024 * 1024 + 1);
            const res = await importStockRoute(makeRequest(`${HEADER}\nGarrot;;1;;;${padding}\n`, 'Import'));
            expect(res.status).toBe(400);
            expect((await res.json()).error).toContain('2 Mo');
            expect(await countAll()).toMatchObject({ InvStockList: 0 });
        });

        it('retourne 400 pour un fichier réduit à son en-tête, sans rien créer', async () => {
            const res = await importStockRoute(makeRequest(`${HEADER}\n`, 'Import'));
            expect(res.status).toBe(400);
            const body = await res.json();
            expect(body.error).toContain('aucune ligne de données');
            expect(await countAll()).toEqual({ InvStockList: 0, InvItem: 0, InvBatch: 0, InvStockLog: 0 });
        });

        it('retourne 400 pour un fichier réellement vide, sans rien créer', async () => {
            const res = await importStockRoute(makeRequest('', 'Import'));
            expect(res.status).toBe(400);
            expect(await countAll()).toEqual({ InvStockList: 0, InvItem: 0, InvBatch: 0, InvStockLog: 0 });
        });

        it('retourne 400 avec le détail des lignes invalides, sans rien créer', async () => {
            const res = await importStockRoute(makeRequest(
                `${HEADER}\nGarrot;;1;;;\n;Protection;5;;;\nAttelle;;deux;;;\n`,
                'Import'
            ));
            expect(res.status).toBe(400);
            const body = await res.json();
            expect(body.lines).toEqual([
                { line: 3, column: 'nom', reason: expect.any(String) },
                { line: 4, column: 'quantite', reason: expect.any(String) },
            ]);
            expect(await countAll()).toEqual({ InvStockList: 0, InvItem: 0, InvBatch: 0, InvStockLog: 0 });
        });
    });

    describe('import réussi', () => {
        it('crée le stock, les articles, les lots et l\'historique', async () => {
            const res = await importStockRoute(makeRequest(
                `${HEADER}\n` +
                'Pansement stérile;Matériel médical;50;2027-06-30;10;\n' +
                'Gants latex M;Protection;200;;;boîte de 100\n' +
                'Attelle;;0;;5;réserve\n',
                '  Stock Import  '
            ));

            expect(res.status).toBe(201);
            const body = await res.json();
            expect(body.itemCount).toBe(3);
            expect(body.stockId).toBeTruthy();

            const stocks = await stocksOf('ul-test');
            expect(stocks).toHaveLength(1);
            expect(stocks[0].name).toBe('Stock Import');
            expect(Number(stocks[0].isDefault)).toBe(0);

            const items = await itemsOf(body.stockId);
            expect(items.map(i => i.name)).toEqual(['Attelle', 'Gants latex M', 'Pansement stérile']);

            const pansement = items.find(i => i.name === 'Pansement stérile')!;
            expect(pansement.category).toBe('Matériel médical');
            expect(Number(pansement.quantity)).toBe(50);
            expect(Number(pansement.minStock)).toBe(10);
            expect(pansement.notes).toBeNull();
            expect(pansement.ulId).toBe('ul-test');
            expect(await batchesOf(pansement.id as string)).toEqual([{ quantity: 50, expiryDate: '2027-06-30' }]);

            const logs = await logsOf(pansement.id as string);
            expect(logs).toHaveLength(1);
            expect(Number(logs[0].change)).toBe(50);
            expect(logs[0].userName).toBe('Alex Admin');
            expect(logs[0].note).toBe('Import initial');

            // Sans date de péremption : lot créé quand même, expiryDate NULL.
            const gants = items.find(i => i.name === 'Gants latex M')!;
            expect(await batchesOf(gants.id as string)).toEqual([{ quantity: 200, expiryDate: null }]);
            expect(gants.notes).toBe('boîte de 100');

            // Quantité nulle : ni lot ni historique — aucun mouvement à tracer.
            const attelle = items.find(i => i.name === 'Attelle')!;
            expect(await batchesOf(attelle.id as string)).toHaveLength(0);
            expect(await logsOf(attelle.id as string)).toHaveLength(0);
        });

        it('n\'impose aucune unicité sur le nom du stock, comme la création manuelle', async () => {
            await db.execute({
                sql: `INSERT INTO "InvStockList" (id, name, ulId, isDefault) VALUES (?, ?, ?, 0)`,
                args: [crypto.randomUUID(), 'Stock Import', 'ul-test'],
            });

            const res = await importStockRoute(makeRequest(`${HEADER}\nGarrot;;1;;;\n`, 'Stock Import'));
            expect(res.status).toBe(201);
            expect(await stocksOf('ul-test')).toHaveLength(2);
        });

        it('importe un CSV franchissant la tranche d\'écriture de 500 instructions', async () => {
            // 200 articles × (article + lot + historique) + 1 stock = 601 instructions.
            const lines = Array.from({ length: 200 }, (_, i) => `Article ${String(i).padStart(3, '0')};;${i + 1};;;`);
            const res = await importStockRoute(makeRequest(`${HEADER}\n${lines.join('\n')}\n`, 'Gros import'));

            expect(res.status).toBe(201);
            const body = await res.json();
            expect(body.itemCount).toBe(200);

            const items = await itemsOf(body.stockId);
            expect(items).toHaveLength(200);
            expect(Number(items.find(i => i.name === 'Article 199')!.quantity)).toBe(200);
        });
    });

    describe('atomicité', () => {
        it('ne laisse aucune ligne derrière lui quand une écriture échoue', async () => {
            const before = await countAll();
            // Un uuid constant : le 1er article s'insère, le 2e viole la clé primaire.
            vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('fixed-uuid-0000-0000-0000-000000000000');

            const res = await importStockRoute(makeRequest(`${HEADER}\nGarrot;;0;;;\nAttelle;;0;;;\n`, 'Import'));
            expect(res.status).toBe(500);
            expect(await countAll()).toEqual(before);
        });
    });
});
