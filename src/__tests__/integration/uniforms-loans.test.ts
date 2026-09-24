/**
 * Tests d'intégration — emprunt et rendu d'uniformes :
 *   POST /api/uniforms/loans                     (panier appli)
 *   GET  /api/uniforms/loans/mine                (bandeau)
 *   POST /api/uniforms/loans/[id]/return         (une pièce)
 *   POST /api/uniforms/loan-batches/[id]/return  (« Tout rendre »)
 *   GET  /api/uniforms/loans/ul                  (vue cadre/admin)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { POST as postLoan } from '@/app/api/uniforms/loans/route';
import { GET as getMine } from '@/app/api/uniforms/loans/mine/route';
import { POST as returnOne } from '@/app/api/uniforms/loans/[id]/return/route';
import { POST as returnAll } from '@/app/api/uniforms/loan-batches/[id]/return/route';
import { GET as getUlLoans } from '@/app/api/uniforms/loans/ul/route';
import { GET as getItems } from '@/app/api/uniforms/items/route';
import { createLoanBatch, resolveActor } from '@/lib/uniforms/loans';
import { UL_LOANS_LIMIT } from '@/lib/uniforms/constants';
import { createClient, type InStatement, type Transaction, type TransactionMode } from '@libsql/client';
import { auth } from '@/auth';
import { db, dbPath, seedUniteLocale, seedUniformItem, seedUniformSize, seedUser } from './setup';

const mockedAuth = vi.mocked(auth);

const session = (roles: string[], id: string, ulId = 'ul-paris-18') =>
    ({ user: { id, email: `${id}@test.com`, name: `Nom ${id}`, ulId, roles } }) as never;

const CHVL_18 = session(['CHVL'], 'u-chvl');
const OTHER_18 = session(['CHVL'], 'u-other');
const CADRE_18 = session(['CADRE'], 'u-cadre');
const CADRE_4 = session(['CADRE'], 'u-cadre4', 'ul-paris-4');
const SECOURISTE_4 = session(['CHVL'], 'u-secouriste4', 'ul-paris-4');

function post(body: unknown): Request {
    return new Request('http://localhost/api/uniforms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}
const withId = (id: string) => ({ params: Promise.resolve({ id }) });

async function availableOf(sizeId: string, as = CHVL_18): Promise<number> {
    mockedAuth.mockResolvedValue(as);
    const { items } = await (await getItems()).json();
    for (const item of items) for (const size of item.sizes) if (size.id === sizeId) return size.available;
    throw new Error(`taille ${sizeId} absente`);
}

async function loansOf(borrowerId: string) {
    const res = await db.execute({ sql: `SELECT * FROM "UniformLoan" WHERE borrowerId = ? ORDER BY id`, args: [borrowerId] });
    return res.rows;
}

beforeEach(async () => {
    mockedAuth.mockReset();
    await seedUniteLocale({ id: 'ul-paris-18', name: 'Paris 18', slug: 'paris-18' });
    await seedUniteLocale({ id: 'ul-paris-4', name: 'Paris 4', slug: 'paris-4' });
    await seedUser({ id: 'u-chvl', email: 'u-chvl@test.com', name: 'Camille' });
    await seedUniformItem({ id: 'polo', name: 'Polo' });
    await seedUniformSize({ id: 'polo-m', itemId: 'polo', label: 'M', quantity: 3 });
    await seedUniformSize({ id: 'polo-l', itemId: 'polo', label: 'L', quantity: 2 });
    await seedUniformItem({ id: 'veste-4', ulId: 'ul-paris-4', name: 'Veste' });
    await seedUniformSize({ id: 'veste-4-m', itemId: 'veste-4', label: 'M', quantity: 5 });
});

describe('POST /api/uniforms/loans', () => {
    it('401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        expect((await postLoan(post({ lines: [{ sizeId: 'polo-m', quantity: 1 }] }))).status).toBe(401);
    });

    it('403 pour INACTIF et pour un compte sans rôle (appli)', async () => {
        mockedAuth.mockResolvedValue(session(['INACTIF'], 'u-i'));
        expect((await postLoan(post({ lines: [{ sizeId: 'polo-m', quantity: 1 }] }))).status).toBe(403);
        mockedAuth.mockResolvedValue(session([], 'u-none'));
        expect((await postLoan(post({ lines: [{ sizeId: 'polo-m', quantity: 1 }] }))).status).toBe(403);
    });

    it('400 sur un panier vide ou une quantité nulle', async () => {
        mockedAuth.mockResolvedValue(CHVL_18);
        expect((await postLoan(post({ lines: [] }))).status).toBe(400);
        expect((await postLoan(post({ lines: [{ sizeId: 'polo-m', quantity: 0 }] }))).status).toBe(400);
    });

    it('matrice — CHVL, 2 × Polo M (dispo 3) → 201, 2 pièces en cours', async () => {
        mockedAuth.mockResolvedValue(CHVL_18);
        const res = await postLoan(post({ lines: [{ sizeId: 'polo-m', quantity: 2 }] }));
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.count).toBe(2);

        const loans = await loansOf('u-chvl');
        expect(loans).toHaveLength(2);
        expect(loans.every(l => l.batchId === body.batchId && l.returnedAt === null)).toBe(true);
        expect(await availableOf('polo-m')).toBe(1);
    });

    it('matrice — 4 × Polo M (dispo 3) → 409, aucune ligne créée', async () => {
        mockedAuth.mockResolvedValue(CHVL_18);
        const res = await postLoan(post({ lines: [{ sizeId: 'polo-l', quantity: 1 }, { sizeId: 'polo-m', quantity: 4 }] }));
        expect(res.status).toBe(409);
        expect((await res.json()).error).toMatch(/Polo M/);
        expect((await db.execute(`SELECT COUNT(*) AS c FROM "UniformLoan"`)).rows[0].c).toBe(0);
        expect((await db.execute(`SELECT COUNT(*) AS c FROM "UniformLoanBatch"`)).rows[0].c).toBe(0);
    });

    it('deux lignes sur la même taille sont cumulées pour le contrôle de dispo', async () => {
        mockedAuth.mockResolvedValue(CHVL_18);
        const res = await postLoan(post({ lines: [{ sizeId: 'polo-m', quantity: 2 }, { sizeId: 'polo-m', quantity: 2 }] }));
        expect(res.status).toBe(409);
    });

    it('404 sur une taille d\'une autre UL que l\'UL active', async () => {
        mockedAuth.mockResolvedValue(CHVL_18);
        expect((await postLoan(post({ lines: [{ sizeId: 'veste-4-m', quantity: 1 }] }))).status).toBe(404);
    });

    it('404 sur une taille archivée', async () => {
        await db.execute(`UPDATE "UniformSize" SET archivedAt = '2026-09-01' WHERE id = 'polo-m'`);
        mockedAuth.mockResolvedValue(CHVL_18);
        expect((await postLoan(post({ lines: [{ sizeId: 'polo-m', quantity: 1 }] }))).status).toBe(404);
    });

    // Pas de test de concurrence réelle : sur le fichier SQLite de test, deux
    // transactions d'écriture parallèles laissent la base verrouillée pour les
    // tests suivants. On vérifie la règle séquentielle — le second panier sur
    // la dernière pièce est refusé par le contrôle fait DANS la transaction.
    it('un second panier sur des pièces déjà sorties → 409', async () => {
        const borrower = { id: 'u-a', name: null, email: null };
        await createLoanBatch({ ulId: 'ul-paris-18', borrower, lines: [{ sizeId: 'polo-l', quantity: 2 }], source: 'app' });
        await expect(
            createLoanBatch({ ulId: 'ul-paris-18', borrower, lines: [{ sizeId: 'polo-l', quantity: 1 }], source: 'app' }),
        ).rejects.toMatchObject({ status: 409 });
        const count = await db.execute(`SELECT COUNT(*) AS c FROM "UniformLoan" WHERE sizeId = 'polo-l'`);
        expect(count.rows[0].c).toBe(2);
    });
});

describe('createLoanBatch — écriture concurrente', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    const OPEN_ON_L = `SELECT COUNT(*) AS c FROM "UniformLoan" WHERE sizeId = 'polo-l' AND returnedAt IS NULL`;

    /**
     * Emprunt concurrent, écrit par un AUTRE client sur le même fichier — comme
     * une seconde instance serverless. Client jetable : après un SQLITE_BUSY,
     * sa connexion reste dans un état qui fausserait les tests suivants.
     */
    async function competingLoan(): Promise<void> {
        const rival = createClient({ url: `file:${dbPath}` });
        try {
            const batchId = crypto.randomUUID();
            await rival.batch([
                { sql: `INSERT INTO "UniformLoanBatch" (id, ulId, borrowerId) VALUES (?, 'ul-paris-18', 'u-rival')`, args: [batchId] },
                { sql: `INSERT INTO "UniformLoan" (id, batchId, sizeId, borrowerId) VALUES (?, ?, 'polo-l', 'u-rival')`, args: [crypto.randomUUID(), batchId] },
            ], 'write');
        } finally {
            rival.close();
        }
    }

    /**
     * Enveloppe la transaction ouverte par `createLoanBatch` pour exécuter
     * `onRead` juste APRÈS la lecture du disponible — la fenêtre exacte entre
     * l'état lu et les INSERT.
     */
    function injectAfterAvailabilityRead(onRead: () => Promise<void>) {
        const realTransaction = db.transaction.bind(db);
        let injected = false;
        vi.spyOn(db, 'transaction').mockImplementation(async (mode?: TransactionMode) => {
            const tx: Transaction = await realTransaction(mode);
            const realExecute = tx.execute.bind(tx);
            tx.execute = (async (stmt: InStatement) => {
                const result = await realExecute(stmt);
                const sql = typeof stmt === 'string' ? stmt : stmt.sql;
                if (!injected && /FROM "UniformSize"/.test(sql)) {
                    injected = true;
                    await onRead();
                }
                return result;
            }) as Transaction['execute'];
            return tx;
        });
        return () => injected;
    }

    it('une écriture concurrente pendant la fenêtre lecture → INSERT ne peut pas surréserver', async () => {
        let rivalError: unknown = null;
        const wasInjected = injectAfterAvailabilityRead(async () => {
            // Autre connexion, pendant que la transaction d'écriture est ouverte.
            try { await competingLoan(); } catch (e) { rivalError = e; }
        });

        const result = await createLoanBatch({
            ulId: 'ul-paris-18', borrower: { id: 'u-a', name: null, email: null },
            lines: [{ sizeId: 'polo-l', quantity: 2 }], source: 'app',
        });
        vi.restoreAllMocks();

        expect(wasInjected()).toBe(true);
        expect(result.count).toBe(2);
        // Le verrou d'écriture a refusé l'emprunt concurrent : il n'a rien écrit.
        expect(rivalError).not.toBeNull();
        expect((await db.execute(OPEN_ON_L)).rows[0].c).toBe(2);
    });

    it('un emprunt concurrent validé juste avant → 409, jamais plus de pièces sorties que le parc', async () => {
        const realTransaction = db.transaction.bind(db);
        vi.spyOn(db, 'transaction').mockImplementation(async (mode?: TransactionMode) => {
            await competingLoan();
            return realTransaction(mode);
        });

        await expect(createLoanBatch({
            ulId: 'ul-paris-18', borrower: { id: 'u-a', name: null, email: null },
            lines: [{ sizeId: 'polo-l', quantity: 2 }], source: 'app',
        })).rejects.toMatchObject({ status: 409 });
        vi.restoreAllMocks();

        expect((await db.execute(OPEN_ON_L)).rows[0].c).toBe(1);
        expect((await db.execute(`SELECT COUNT(*) AS c FROM "UniformLoanBatch" WHERE borrowerId = 'u-a'`)).rows[0].c).toBe(0);
    });
});

describe('resolveActor', () => {
    it('refuse (401) une session sans id ni email au lieu d\'inventer un emprunteur partagé', async () => {
        await expect(resolveActor({ id: null, email: null, name: 'X' })).rejects.toMatchObject({ status: 401 });
    });

    it('préfère le User.id résolu par email à l\'id de session', async () => {
        expect((await resolveActor({ id: 'autre', email: 'u-chvl@test.com' })).id).toBe('u-chvl');
    });
});

describe('GET /api/uniforms/loans/mine', () => {
    it('401 / 403 INACTIF', async () => {
        mockedAuth.mockResolvedValue(null as never);
        expect((await getMine()).status).toBe(401);
        mockedAuth.mockResolvedValue(session(['INACTIF'], 'u-i'));
        expect((await getMine()).status).toBe(403);
    });

    it('un compte sans rôle voit ses emprunts (emprunt fait par QR)', async () => {
        await createLoanBatch({ ulId: 'ul-paris-18', borrower: { id: 'u-none', name: null, email: null }, lines: [{ sizeId: 'polo-m', quantity: 1 }], source: 'qr' });
        mockedAuth.mockResolvedValue(session([], 'u-none'));
        const res = await getMine();
        expect(res.status).toBe(200);
        expect((await res.json()).batches).toHaveLength(1);
    });

    it('groupe les pièces non rendues par emprunt, et résout l\'id de session par email', async () => {
        // L'id de session diffère de User.id : c'est l'email qui fait foi.
        const stale = { user: { id: 'u-chvl@test.com', email: 'u-chvl@test.com', name: 'Camille', ulId: 'ul-paris-18', roles: ['CHVL'] } } as never;
        mockedAuth.mockResolvedValue(stale);
        await postLoan(post({ lines: [{ sizeId: 'polo-m', quantity: 2 }, { sizeId: 'polo-l', quantity: 1 }] }));
        await postLoan(post({ lines: [{ sizeId: 'polo-m', quantity: 1 }] }));

        const { batches } = await (await getMine()).json();
        expect(batches).toHaveLength(2);
        expect(batches.flatMap((b: { pieces: unknown[] }) => b.pieces)).toHaveLength(4);
        expect(batches[0].ulName).toBe('Paris 18');
        expect((await loansOf('u-chvl'))).toHaveLength(4);
    });
});

describe('POST /api/uniforms/loans/[id]/return', () => {
    let loanId: string;

    beforeEach(async () => {
        await createLoanBatch({ ulId: 'ul-paris-18', borrower: { id: 'u-chvl', name: 'Camille', email: null }, lines: [{ sizeId: 'polo-m', quantity: 1 }], source: 'app' });
        loanId = String((await loansOf('u-chvl'))[0].id);
    });

    it('401 / 403 INACTIF / 400 sans returnedClean ou commentaire trop long', async () => {
        mockedAuth.mockResolvedValue(null as never);
        expect((await returnOne(post({ returnedClean: true }), withId(loanId))).status).toBe(401);
        mockedAuth.mockResolvedValue(session(['INACTIF'], 'u-chvl'));
        expect((await returnOne(post({ returnedClean: true }), withId(loanId))).status).toBe(403);
        mockedAuth.mockResolvedValue(CHVL_18);
        expect((await returnOne(post({ comment: 'x' }), withId(loanId))).status).toBe(400);
        expect((await returnOne(post({ returnedClean: true, comment: 'x'.repeat(1001) }), withId(loanId))).status).toBe(400);
    });

    it('matrice — rendu propre → 200, dispo +1', async () => {
        expect(await availableOf('polo-m')).toBe(2);
        mockedAuth.mockResolvedValue(CHVL_18);
        expect((await returnOne(post({ returnedClean: true }), withId(loanId))).status).toBe(200);
        expect(await availableOf('polo-m')).toBe(3);
    });

    it('matrice — rendu sale avec commentaire → 200, dispo inchangée', async () => {
        mockedAuth.mockResolvedValue(CHVL_18);
        expect((await returnOne(post({ returnedClean: false, comment: 'Taché' }), withId(loanId))).status).toBe(200);
        expect(await availableOf('polo-m')).toBe(2);
        const [loan] = await loansOf('u-chvl');
        expect(loan).toMatchObject({ returnedClean: 0, returnComment: 'Taché' });
        expect(loan.returnedAt).not.toBeNull();
    });

    it('matrice — rendu par autrui (même admin) → 404 indiscernable', async () => {
        mockedAuth.mockResolvedValue(OTHER_18);
        expect((await returnOne(post({ returnedClean: true }), withId(loanId))).status).toBe(404);
        mockedAuth.mockResolvedValue(session(['ADMIN'], 'u-admin'));
        expect((await returnOne(post({ returnedClean: true }), withId(loanId))).status).toBe(404);
        mockedAuth.mockResolvedValue(CHVL_18);
        expect((await returnOne(post({ returnedClean: true }), withId('inconnu'))).status).toBe(404);
    });

    it('409 si la pièce est déjà rendue', async () => {
        mockedAuth.mockResolvedValue(CHVL_18);
        await returnOne(post({ returnedClean: true }), withId(loanId));
        expect((await returnOne(post({ returnedClean: true }), withId(loanId))).status).toBe(409);
    });
});

describe('POST /api/uniforms/loan-batches/[id]/return', () => {
    let batchId: string;

    beforeEach(async () => {
        ({ batchId } = await createLoanBatch({
            ulId: 'ul-paris-18', borrower: { id: 'u-chvl', name: 'Camille', email: null },
            lines: [{ sizeId: 'polo-m', quantity: 2 }, { sizeId: 'polo-l', quantity: 1 }], source: 'app',
        }));
    });

    it('401 / 403 / 400', async () => {
        mockedAuth.mockResolvedValue(null as never);
        expect((await returnAll(post({ returnedClean: true }), withId(batchId))).status).toBe(401);
        mockedAuth.mockResolvedValue(session(['INACTIF'], 'u-chvl'));
        expect((await returnAll(post({ returnedClean: true }), withId(batchId))).status).toBe(403);
        mockedAuth.mockResolvedValue(CHVL_18);
        expect((await returnAll(post({}), withId(batchId))).status).toBe(400);
    });

    it('matrice — 3 pièces dont 1 déjà rendue → les 2 restantes rendues avec le même état', async () => {
        mockedAuth.mockResolvedValue(CHVL_18);
        const first = String((await loansOf('u-chvl'))[0].id);
        await returnOne(post({ returnedClean: true, comment: 'OK' }), withId(first));

        const res = await returnAll(post({ returnedClean: false, comment: 'Boue' }), withId(batchId));
        expect(res.status).toBe(200);
        expect((await res.json()).returned).toBe(2);

        const loans = await loansOf('u-chvl');
        const firstRow = loans.find(l => l.id === first)!;
        expect(firstRow).toMatchObject({ returnedClean: 1, returnComment: 'OK' });
        const others = loans.filter(l => l.id !== first);
        expect(others.every(l => l.returnedClean === 0 && l.returnComment === 'Boue' && l.returnedAt !== null)).toBe(true);

        // Le bandeau disparaît : plus rien en cours.
        expect((await (await getMine()).json()).batches).toEqual([]);
    });

    it('404 pour autrui, 409 quand tout est déjà rendu', async () => {
        mockedAuth.mockResolvedValue(OTHER_18);
        expect((await returnAll(post({ returnedClean: true }), withId(batchId))).status).toBe(404);
        mockedAuth.mockResolvedValue(CHVL_18);
        expect((await returnAll(post({ returnedClean: true }), withId(batchId))).status).toBe(200);
        expect((await returnAll(post({ returnedClean: true }), withId(batchId))).status).toBe(409);
    });
});

describe('GET /api/uniforms/loans/ul', () => {
    const req = (status?: string) => new Request(`http://localhost/api/uniforms/loans/ul${status ? `?status=${status}` : ''}`);

    beforeEach(async () => {
        // Le secouriste de l'UL 4 emprunte des pièces de l'UL 18 (via le QR de l'UL 18)…
        await createLoanBatch({ ulId: 'ul-paris-18', borrower: { id: 'u-secouriste4', name: 'Sam UL4', email: null }, lines: [{ sizeId: 'polo-m', quantity: 1 }], source: 'qr' });
        // … et le CHVL de l'UL 18 emprunte une veste de l'UL 4.
        await createLoanBatch({ ulId: 'ul-paris-4', borrower: { id: 'u-chvl', name: 'Camille', email: null }, lines: [{ sizeId: 'veste-4-m', quantity: 1 }], source: 'qr' });
    });

    it('401 / 403 pour un CHVL', async () => {
        mockedAuth.mockResolvedValue(null as never);
        expect((await getUlLoans(req())).status).toBe(401);
        mockedAuth.mockResolvedValue(CHVL_18);
        expect((await getUlLoans(req())).status).toBe(403);
        mockedAuth.mockResolvedValue(SECOURISTE_4);
        expect((await getUlLoans(req())).status).toBe(403);
    });

    it('matrice — CADRE UL 18 : pièces UL 18 dont emprunteur UL 4, rien des articles UL 4', async () => {
        mockedAuth.mockResolvedValue(CADRE_18);
        const { loans } = await (await getUlLoans(req())).json();
        expect(loans).toHaveLength(1);
        expect(loans[0]).toMatchObject({ borrowerName: 'Sam UL4', itemName: 'Polo', sizeLabel: 'M', returnedAt: null });

        mockedAuth.mockResolvedValue(CADRE_4);
        const ul4 = await (await getUlLoans(req())).json();
        expect(ul4.loans.map((l: { itemName: string }) => l.itemName)).toEqual(['Veste']);
    });

    it('signale la troncature au-delà du plafond de lignes', async () => {
        await db.execute(`UPDATE "UniformSize" SET quantity = 1000 WHERE id = 'polo-m'`);
        await createLoanBatch({ ulId: 'ul-paris-18', borrower: { id: 'u-many', name: null, email: null }, lines: [{ sizeId: 'polo-m', quantity: 50 }], source: 'app' });
        const batchId = String((await db.execute(`SELECT batchId FROM "UniformLoan" WHERE borrowerId = 'u-many' LIMIT 1`)).rows[0].batchId);
        // Complète au-delà du plafond sans passer par la borne de 50 pièces par panier.
        for (let i = 0; i < UL_LOANS_LIMIT; i++) {
            await db.execute({ sql: `INSERT INTO "UniformLoan" (id, batchId, sizeId, borrowerId) VALUES (?, ?, 'polo-m', 'u-many')`, args: [crypto.randomUUID(), batchId] });
        }

        mockedAuth.mockResolvedValue(CADRE_18);
        const body = await (await getUlLoans(req())).json();
        expect(body.truncated).toBe(true);
        expect(body.loans).toHaveLength(UL_LOANS_LIMIT);
    });

    it('truncated = false sous le plafond', async () => {
        mockedAuth.mockResolvedValue(CADRE_18);
        expect((await (await getUlLoans(req())).json()).truncated).toBe(false);
    });

    it('AC4 — une taille archivée reste dans l\'historique des emprunts', async () => {
        await db.execute(`UPDATE "UniformLoan" SET returnedAt = '2026-09-02', returnedClean = 1 WHERE sizeId = 'polo-m'`);
        await db.execute(`UPDATE "UniformSize" SET archivedAt = '2026-09-03' WHERE id = 'polo-m'`);

        mockedAuth.mockResolvedValue(CADRE_18);
        expect((await (await getUlLoans(req('open'))).json()).loans).toEqual([]);
        const all = await (await getUlLoans(req('all'))).json();
        expect(all.loans).toHaveLength(1);
        expect(all.loans[0]).toMatchObject({ sizeLabel: 'M', returnedClean: true });
    });
});
