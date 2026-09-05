import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/auth';
import { GET as listBudgets, POST as createBudget } from '@/app/api/expense-budgets/route';
import { PATCH as renameBudget, DELETE as archiveBudget } from '@/app/api/expense-budgets/[id]/route';
import { POST as createUL } from '@/app/api/ul/route';
import { DEFAULT_EXPENSE_BUDGETS, seedDefaultBudgets } from '@/lib/expenses/budgets';
import { seedRoles, seedUser, seedUserRole, seedExpenseBudget, seedExpenseReport, db } from './setup';

const mockedAuth = vi.mocked(auth);

/** Session type-erased : `auth()` renvoie une Session complète en production. */
function asSession(user: Record<string, unknown>) {
    return { user } as never;
}

const UL_18 = { id: 'ul-paris-18', name: 'Paris 18', slug: 'ul-paris-18', isHome: true };
const UL_17 = { id: 'ul-paris-17', name: 'Paris 17', slug: 'ul-paris-17', isHome: false };

beforeEach(async () => {
    await db.execute('DELETE FROM "ExpenseReport"');
    await seedRoles();
    await db.execute(`INSERT OR IGNORE INTO "UniteLocale" (id, name, slug) VALUES ('ul-paris-18', 'Paris 18', 'ul-paris-18')`);
    await db.execute(`INSERT OR IGNORE INTO "UniteLocale" (id, name, slug) VALUES ('ul-paris-17', 'Paris 17', 'ul-paris-17')`);

    await seedUser({ id: 'user-cadre', email: 'cadre@test.com', name: 'Cadre User' });
    await seedUserRole('user-cadre', 'CADRE');
    await seedUser({ id: 'user-chvl', email: 'chvl@test.com', name: 'Chauffeur User' });
    await seedUserRole('user-chvl', 'CHVL');
    await seedUser({ id: 'user-sa', email: 'sa@test.com', name: 'Super Admin' });
    await seedUserRole('user-sa', 'SUPER_ADMIN');
});

function makeRequest(url: string, method: string, body?: Record<string, unknown>): Request {
    return new Request(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
}

const cadreSession = (ulId = 'ul-paris-18', availableULs = [UL_18]) =>
    asSession({ id: 'user-cadre', email: 'cadre@test.com', roles: ['CADRE'], ulId, availableULs });

describe('Budgets analytiques — routes API', () => {

    describe('GET /api/expense-budgets', () => {
        it('GET retourne 401 sans session', async () => {
            mockedAuth.mockResolvedValue(null as never);
            const res = await listBudgets(makeRequest('http://localhost/api/expense-budgets', 'GET'));
            expect(res.status).toBe(401);
        });

        it('GET retourne 403 pour un utilisateur inactif', async () => {
            mockedAuth.mockResolvedValue(asSession({ id: 'user-chvl', email: 'chvl@test.com', roles: [], ulId: 'ul-paris-18' }));
            const res = await listBudgets(makeRequest('http://localhost/api/expense-budgets', 'GET'));
            expect(res.status).toBe(403);
        });

        it('GET ne retourne que les budgets non archivés de l\'UL', async () => {
            await seedExpenseBudget({ id: 'b-actif', ulId: 'ul-paris-18', name: 'Repas' });
            await seedExpenseBudget({ id: 'b-archive', ulId: 'ul-paris-18', name: 'Essence', archived: true });
            await seedExpenseBudget({ id: 'b-autre-ul', ulId: 'ul-paris-17', name: 'Matériel' });

            mockedAuth.mockResolvedValue(cadreSession());
            const res = await listBudgets(makeRequest('http://localhost/api/expense-budgets', 'GET'));
            expect(res.status).toBe(200);

            const budgets = await res.json();
            expect(budgets.map((b: { id: string }) => b.id)).toEqual(['b-actif']);
        });

        it('GET trie les budgets par nom croissant', async () => {
            await seedExpenseBudget({ id: 'b-1', ulId: 'ul-paris-18', name: 'Zèbre' });
            await seedExpenseBudget({ id: 'b-2', ulId: 'ul-paris-18', name: 'Alpha' });

            mockedAuth.mockResolvedValue(cadreSession());
            const res = await listBudgets(makeRequest('http://localhost/api/expense-budgets', 'GET'));
            const budgets = await res.json();
            expect(budgets.map((b: { name: string }) => b.name)).toEqual(['Alpha', 'Zèbre']);
        });

        it('le paramètre ulId est honoré pour un membre de l\'UL demandée', async () => {
            await seedExpenseBudget({ id: 'b-18', ulId: 'ul-paris-18', name: 'Repas 18' });
            await seedExpenseBudget({ id: 'b-17', ulId: 'ul-paris-17', name: 'Repas 17' });

            // Bénévole NON super-admin, membre des deux ULs, actif sur la 17.
            mockedAuth.mockResolvedValue(cadreSession('ul-paris-17', [UL_18, UL_17]));
            const res = await listBudgets(makeRequest('http://localhost/api/expense-budgets?ulId=ul-paris-18', 'GET'));
            const budgets = await res.json();
            expect(budgets.map((b: { id: string }) => b.id)).toEqual(['b-18']);
        });

        it('le paramètre ulId est ignoré pour un non-membre', async () => {
            await seedExpenseBudget({ id: 'b-18', ulId: 'ul-paris-18', name: 'Repas 18' });
            await seedExpenseBudget({ id: 'b-17', ulId: 'ul-paris-17', name: 'Repas 17' });

            // Membre de la 18 uniquement : la demande sur la 17 est silencieusement ignorée.
            mockedAuth.mockResolvedValue(cadreSession('ul-paris-18', [UL_18]));
            const res = await listBudgets(makeRequest('http://localhost/api/expense-budgets?ulId=ul-paris-17', 'GET'));
            expect(res.status).toBe(200);
            const budgets = await res.json();
            expect(budgets.map((b: { id: string }) => b.id)).toEqual(['b-18']);
        });

        it('le paramètre ulId est honoré pour un SUPER_ADMIN non membre', async () => {
            await seedExpenseBudget({ id: 'b-17', ulId: 'ul-paris-17', name: 'Repas 17' });

            mockedAuth.mockResolvedValue(asSession({
                id: 'user-sa', email: 'sa@test.com', roles: ['SUPER_ADMIN'], ulId: 'ul-paris-18', availableULs: [UL_18],
            }));
            const res = await listBudgets(makeRequest('http://localhost/api/expense-budgets?ulId=ul-paris-17', 'GET'));
            const budgets = await res.json();
            expect(budgets.map((b: { id: string }) => b.id)).toEqual(['b-17']);
        });
    });

    describe('POST /api/expense-budgets', () => {
        it('POST retourne 401 sans session', async () => {
            mockedAuth.mockResolvedValue(null as never);
            const res = await createBudget(makeRequest('http://localhost/api/expense-budgets', 'POST', { name: 'Divers' } as never));
            expect(res.status).toBe(401);
        });

        it('POST retourne 400 sur nom vide', async () => {
            mockedAuth.mockResolvedValue(cadreSession());
            const res = await createBudget(makeRequest('http://localhost/api/expense-budgets', 'POST', { name: '   ' }));
            expect(res.status).toBe(400);
        });

        it('POST retourne 400 sur doublon', async () => {
            await seedExpenseBudget({ id: 'b-actif', ulId: 'ul-paris-18', name: 'Repas' });
            mockedAuth.mockResolvedValue(cadreSession());

            // Casse différente : la garde applicative est COLLATE NOCASE.
            const res = await createBudget(makeRequest('http://localhost/api/expense-budgets', 'POST', { name: 'repas' }));
            expect(res.status).toBe(400);
            expect((await res.json()).error).toBe('Un budget porte déjà ce nom.');
        });

        it('un nom réutilisé depuis un budget archivé est accepté', async () => {
            await seedExpenseBudget({ id: 'b-archive', ulId: 'ul-paris-18', name: 'Essence', archived: true });
            mockedAuth.mockResolvedValue(cadreSession());

            const res = await createBudget(makeRequest('http://localhost/api/expense-budgets', 'POST', { name: 'Essence' }));
            expect(res.status).toBe(201);

            const rows = await db.execute({
                sql: `SELECT id FROM "ExpenseBudget" WHERE ulId = ? AND name = ? AND archived = 0`,
                args: ['ul-paris-18', 'Essence'],
            });
            expect(rows.rows).toHaveLength(1);
        });

        it('POST crée le budget dans l\'UL de session (happy path)', async () => {
            mockedAuth.mockResolvedValue(cadreSession());
            const res = await createBudget(makeRequest('http://localhost/api/expense-budgets', 'POST', { name: '  Formation  ' }));
            expect(res.status).toBe(201);

            const created = await res.json();
            expect(created.name).toBe('Formation');
            expect(created.ulId).toBe('ul-paris-18');

            const rows = await db.execute({ sql: `SELECT * FROM "ExpenseBudget" WHERE id = ?`, args: [created.id] });
            expect(rows.rows).toHaveLength(1);
            expect(rows.rows[0].archived).toBe(0);
        });

        it('l\'index unique partiel rejette un doublon de budget actif dans une même UL', async () => {
            await seedExpenseBudget({ id: 'b-1', ulId: 'ul-paris-18', name: 'Repas' });
            // Insertion directe : contourne la garde applicative, seul l'index protège.
            await expect(seedExpenseBudget({ id: 'b-2', ulId: 'ul-paris-18', name: 'Repas' })).rejects.toThrow();
        });
    });

    describe('POST, PATCH et DELETE retournent 403 pour CHVL', () => {
        it('POST, PATCH et DELETE retournent 403 pour CHVL', async () => {
            await seedExpenseBudget({ id: 'b-1', ulId: 'ul-paris-18', name: 'Repas' });
            mockedAuth.mockResolvedValue(asSession({ id: 'user-chvl', email: 'chvl@test.com', roles: ['CHVL'], ulId: 'ul-paris-18' }));

            const post = await createBudget(makeRequest('http://localhost/api/expense-budgets', 'POST', { name: 'Divers' }));
            expect(post.status).toBe(403);

            const patch = await renameBudget(
                makeRequest('http://localhost/api/expense-budgets/b-1', 'PATCH', { name: 'Autre' }),
                { params: Promise.resolve({ id: 'b-1' }) },
            );
            expect(patch.status).toBe(403);

            const del = await archiveBudget(
                makeRequest('http://localhost/api/expense-budgets/b-1', 'DELETE'),
                { params: Promise.resolve({ id: 'b-1' }) },
            );
            expect(del.status).toBe(403);
        });
    });

    describe('PATCH /api/expense-budgets/[id]', () => {
        it('PATCH retourne 401 sans session', async () => {
            mockedAuth.mockResolvedValue(null as never);
            const res = await renameBudget(
                makeRequest('http://localhost/api/expense-budgets/b-1', 'PATCH', { name: 'Autre' }),
                { params: Promise.resolve({ id: 'b-1' }) },
            );
            expect(res.status).toBe(401);
        });

        it('PATCH retourne 400 sur nom vide', async () => {
            await seedExpenseBudget({ id: 'b-1', ulId: 'ul-paris-18', name: 'Repas' });
            mockedAuth.mockResolvedValue(cadreSession());
            const res = await renameBudget(
                makeRequest('http://localhost/api/expense-budgets/b-1', 'PATCH', { name: '' }),
                { params: Promise.resolve({ id: 'b-1' }) },
            );
            expect(res.status).toBe(400);
        });

        it('PATCH retourne 400 si le nouveau nom est déjà pris', async () => {
            await seedExpenseBudget({ id: 'b-1', ulId: 'ul-paris-18', name: 'Repas' });
            await seedExpenseBudget({ id: 'b-2', ulId: 'ul-paris-18', name: 'Essence' });
            mockedAuth.mockResolvedValue(cadreSession());

            const res = await renameBudget(
                makeRequest('http://localhost/api/expense-budgets/b-2', 'PATCH', { name: 'Repas' }),
                { params: Promise.resolve({ id: 'b-2' }) },
            );
            expect(res.status).toBe(400);
            expect((await res.json()).error).toBe('Un budget porte déjà ce nom.');
        });

        it('PATCH renomme le budget (happy path)', async () => {
            await seedExpenseBudget({ id: 'b-1', ulId: 'ul-paris-18', name: 'Repas' });
            mockedAuth.mockResolvedValue(cadreSession());

            const res = await renameBudget(
                makeRequest('http://localhost/api/expense-budgets/b-1', 'PATCH', { name: 'Restauration' }),
                { params: Promise.resolve({ id: 'b-1' }) },
            );
            expect(res.status).toBe(200);

            const rows = await db.execute({ sql: `SELECT name FROM "ExpenseBudget" WHERE id = ?`, args: ['b-1'] });
            expect(rows.rows[0].name).toBe('Restauration');
        });

        it('PATCH et DELETE retournent 404 hors UL', async () => {
            await seedExpenseBudget({ id: 'b-17a', ulId: 'ul-paris-17', name: 'Repas' });
            await seedExpenseBudget({ id: 'b-17b', ulId: 'ul-paris-17', name: 'Essence' });
            mockedAuth.mockResolvedValue(cadreSession('ul-paris-18', [UL_18]));

            const patch = await renameBudget(
                makeRequest('http://localhost/api/expense-budgets/b-17a', 'PATCH', { name: 'Autre' }),
                { params: Promise.resolve({ id: 'b-17a' }) },
            );
            expect(patch.status).toBe(404);

            const del = await archiveBudget(
                makeRequest('http://localhost/api/expense-budgets/b-17a', 'DELETE'),
                { params: Promise.resolve({ id: 'b-17a' }) },
            );
            expect(del.status).toBe(404);
        });
    });

    describe('DELETE /api/expense-budgets/[id]', () => {
        it('DELETE retourne 401 sans session', async () => {
            mockedAuth.mockResolvedValue(null as never);
            const res = await archiveBudget(
                makeRequest('http://localhost/api/expense-budgets/b-1', 'DELETE'),
                { params: Promise.resolve({ id: 'b-1' }) },
            );
            expect(res.status).toBe(401);
        });

        it('DELETE refuse d\'archiver le dernier budget actif de l\'UL', async () => {
            await seedExpenseBudget({ id: 'b-seul', ulId: 'ul-paris-18', name: 'Repas' });
            await seedExpenseBudget({ id: 'b-deja-archive', ulId: 'ul-paris-18', name: 'Essence', archived: true });
            mockedAuth.mockResolvedValue(cadreSession());

            const res = await archiveBudget(
                makeRequest('http://localhost/api/expense-budgets/b-seul', 'DELETE'),
                { params: Promise.resolve({ id: 'b-seul' }) },
            );
            expect(res.status).toBe(400);
            expect((await res.json()).error).toContain('dernier budget actif');

            const rows = await db.execute({ sql: `SELECT archived FROM "ExpenseBudget" WHERE id = ?`, args: ['b-seul'] });
            expect(rows.rows[0].archived).toBe(0);
        });

        it('DELETE archive sans toucher aux items des notes', async () => {
            await seedExpenseBudget({ id: 'b-1', ulId: 'ul-paris-18', name: 'Repas' });
            await seedExpenseBudget({ id: 'b-2', ulId: 'ul-paris-18', name: 'Essence' });
            await seedExpenseReport({
                id: 'exp-1', userId: 'user-cadre', ulId: 'ul-paris-18',
                items: [{ label: 'Repas', amount: 12, budgetId: 'b-1' }],
            });
            const before = await db.execute({ sql: `SELECT items FROM "ExpenseReport" WHERE id = ?`, args: ['exp-1'] });

            mockedAuth.mockResolvedValue(cadreSession());
            const res = await archiveBudget(
                makeRequest('http://localhost/api/expense-budgets/b-1', 'DELETE'),
                { params: Promise.resolve({ id: 'b-1' }) },
            );
            expect(res.status).toBe(200);

            const budget = await db.execute({ sql: `SELECT archived FROM "ExpenseBudget" WHERE id = ?`, args: ['b-1'] });
            expect(budget.rows[0].archived).toBe(1);

            const after = await db.execute({ sql: `SELECT items FROM "ExpenseReport" WHERE id = ?`, args: ['exp-1'] });
            expect(after.rows[0].items).toBe(before.rows[0].items);
        });
    });

    describe('POST /api/ul', () => {
        it('POST /api/ul sème les 5 budgets par défaut', async () => {
            mockedAuth.mockResolvedValue(asSession({ id: 'user-sa', email: 'sa@test.com', roles: ['SUPER_ADMIN'], ulId: 'ul-paris-18' }));

            const res = await createUL(makeRequest('http://localhost/api/ul', 'POST', {
                name: 'Paris 19', slug: 'paris-19', phoneNumbers: [], defaultParkingSpots: [],
            }));
            expect(res.status).toBe(201);

            const budgets = await db.execute({
                sql: `SELECT name FROM "ExpenseBudget" WHERE ulId = ? ORDER BY name ASC`,
                args: ['ul-paris-19'],
            });
            expect(budgets.rows).toHaveLength(DEFAULT_EXPENSE_BUDGETS.length);
            expect(budgets.rows.map(r => String(r.name)).sort()).toEqual([...DEFAULT_EXPENSE_BUDGETS].sort());
        });

        it('POST /api/ul retourne 403 hors SUPER_ADMIN et ne sème aucun budget', async () => {
            mockedAuth.mockResolvedValue(cadreSession());
            const res = await createUL(makeRequest('http://localhost/api/ul', 'POST', {
                name: 'Paris 20', slug: 'paris-20', phoneNumbers: [], defaultParkingSpots: [],
            }));
            expect(res.status).toBe(403);

            const budgets = await db.execute({ sql: `SELECT id FROM "ExpenseBudget" WHERE ulId = ?`, args: ['ul-paris-20'] });
            expect(budgets.rows).toHaveLength(0);
        });
    });

    describe('seedDefaultBudgets', () => {
        it('seedDefaultBudgets ne sème que les ULs sans aucun budget', async () => {
            // Reproduit la garde du script de migration : le comptage est fait par
            // l'appelant, `seedDefaultBudgets` n'effectue aucun contrôle.
            await seedExpenseBudget({ id: 'b-existant', ulId: 'ul-paris-18', name: 'Restauration' });

            for (const ulId of ['ul-paris-18', 'ul-paris-17']) {
                const count = await db.execute({ sql: `SELECT COUNT(*) AS n FROM "ExpenseBudget" WHERE ulId = ?`, args: [ulId] });
                if (Number(count.rows[0].n) === 0) await seedDefaultBudgets(db, ulId, new Date().toISOString());
            }

            const ul18 = await db.execute({ sql: `SELECT name FROM "ExpenseBudget" WHERE ulId = ?`, args: ['ul-paris-18'] });
            expect(ul18.rows.map(r => String(r.name))).toEqual(['Restauration']);

            const ul17 = await db.execute({ sql: `SELECT id FROM "ExpenseBudget" WHERE ulId = ?`, args: ['ul-paris-17'] });
            expect(ul17.rows).toHaveLength(DEFAULT_EXPENSE_BUDGETS.length);
        });

        it('le semis des budgets ne modifie aucun items de note existante', async () => {
            await seedExpenseReport({
                id: 'exp-scelle', userId: 'user-cadre', ulId: 'ul-paris-17', status: 'traité',
                items: [{ label: 'Péage', amount: 42.5 }],
            });
            const before = await db.execute({ sql: `SELECT items, total FROM "ExpenseReport" WHERE id = ?`, args: ['exp-scelle'] });

            await seedDefaultBudgets(db, 'ul-paris-17', new Date().toISOString());

            const after = await db.execute({ sql: `SELECT items, total FROM "ExpenseReport" WHERE id = ?`, args: ['exp-scelle'] });
            expect(after.rows[0].items).toBe(before.rows[0].items);
            expect(after.rows[0].total).toBe(before.rows[0].total);
        });
    });
});
