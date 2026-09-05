import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
  const { db } = await import('./setup');
  return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/auth';
import { GET as getExpenseStats } from '@/app/api/stats/expenses/route';
import { POST as postExpenseCsv } from '@/app/api/stats/expenses/csv/route';
import { POST as postExpensePdf } from '@/app/api/stats/expenses/pdf/route';
import { seedRoles, seedUser, seedUserRole, seedExpenseBudget, db } from './setup';

const mockedAuth = vi.mocked(auth);

beforeEach(async () => {
  await db.execute('DELETE FROM "ExpenseReport"');
  await db.execute('DELETE FROM "ExpenseBudget"');
  await db.execute('DELETE FROM "UserUL"');
  await db.execute('DELETE FROM "UserRole"');
  await db.execute('DELETE FROM "User"');

  await seedRoles();
  await db.execute(`INSERT OR IGNORE INTO "UniteLocale" (id, name, slug) VALUES ('ul-paris-18', 'Paris 18', 'ul-paris-18')`);
  await db.execute(`INSERT OR IGNORE INTO "UniteLocale" (id, name, slug) VALUES ('ul-paris-17', 'Paris 17', 'ul-paris-17')`);

  await seedUser({ id: 'user-standard', email: 'secouriste@test.com', name: 'Standard User' });
  await seedUserRole('user-standard', 'SECOURISTE');

  await seedUser({ id: 'user-president', email: 'president@test.com', name: 'President User' });
  await seedUserRole('user-president', 'PRESIDENT');

  await seedUser({ id: 'user-tresorier', email: 'tresorier@test.com', name: 'Tresorier User' });
  await seedUserRole('user-tresorier', 'TRESORIER');

  // Budgets analytiques de l'UL 18 : « Essence » est archivé, il doit malgré tout
  // conserver son nom dans les agrégats historiques.
  await seedExpenseBudget({ id: 'budget-repas-18', ulId: 'ul-paris-18', name: 'Repas' });
  await seedExpenseBudget({ id: 'budget-essence-18', ulId: 'ul-paris-18', name: 'Essence', archived: true });
  await seedExpenseBudget({ id: 'budget-repas-17', ulId: 'ul-paris-17', name: 'Repas UL17' });

  // Seed expense reports for UL 18
  // exp-1 porte un total SANS aucune ligne : base des pourcentages volontairement
  // divergente de `report.total` (cf. AC-24).
  await db.execute({
    sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, total, items, ulId, imputation, customImputation, requestRefund)
          VALUES ('exp-1', 'user-standard', '2026-07-15T10:00:00Z', 'traité', 150.0, '[]', 'ul-paris-18', 'DLUS', NULL, 1)`,
    args: [],
  });

  // exp-2 porte les lignes rattachées à des budgets : « Repas » actif,
  // « Essence » archivé, et une ligne historique sans budgetId.
  await db.execute({
    sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, total, items, ulId, imputation, customImputation, requestRefund)
          VALUES ('exp-2', 'user-standard', '2026-07-18T10:00:00Z', 'soumis', 50.0, ?, 'ul-paris-18', 'Autre', 'Projet Formation', 1)`,
    args: [JSON.stringify([
      { label: 'Repas équipe', amount: 20, budgetId: 'budget-repas-18' },
      { label: 'Plein', amount: 20, budgetId: 'budget-essence-18' },
      { label: 'Ligne historique', amount: 10, budgetId: null },
    ])],
  });

  // Seed expense report for UL 17
  await db.execute({
    sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, total, items, ulId, imputation, customImputation, requestRefund)
          VALUES ('exp-ul17', 'user-standard', '2026-07-18T10:00:00Z', 'traité', 999.0, '[]', 'ul-paris-17', 'DLAS', NULL, 1)`,
    args: [],
  });
});

describe('GET /api/stats/expenses', () => {
  it('returns 401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null as never);
    const res = await getExpenseStats(new Request('http://localhost/api/stats/expenses?dateFrom=2026-07-01&dateTo=2026-07-31'));
    expect(res.status).toBe(401);
  });

  it('returns 403 for standard non-manager user (SECOURISTE)', async () => {
    mockedAuth.mockResolvedValue({
      user: { id: 'user-standard', email: 'secouriste@test.com', roles: ['SECOURISTE'], ulId: 'ul-paris-18' }
    } as never);

    const res = await getExpenseStats(new Request('http://localhost/api/stats/expenses?dateFrom=2026-07-01&dateTo=2026-07-31'));
    expect(res.status).toBe(403);
  });

  it('returns 200 with aggregated data for PRESIDENT filtered by user UL (ul-paris-18)', async () => {
    mockedAuth.mockResolvedValue({
      user: { id: 'user-president', email: 'president@test.com', roles: ['PRESIDENT'], ulId: 'ul-paris-18' }
    } as never);

    const res = await getExpenseStats(new Request('http://localhost/api/stats/expenses?dateFrom=2026-07-01&dateTo=2026-07-31'));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.global.totalExpensesAmount).toBe(200.0);
    expect(json.data.global.totalRefundedAmount).toBe(150.0);
    expect(json.data.global.totalPendingAmount).toBe(50.0);
    expect(json.data.global.reportsCount).toBe(2);
  });

  it('returns 200 with aggregated data for TRESORIER', async () => {
    mockedAuth.mockResolvedValue({
      user: { id: 'user-tresorier', email: 'tresorier@test.com', roles: ['TRESORIER'], ulId: 'ul-paris-18' }
    } as never);

    const res = await getExpenseStats(new Request('http://localhost/api/stats/expenses?dateFrom=2026-07-01&dateTo=2026-07-31'));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.global.totalExpensesAmount).toBe(200.0);
  });

  it('isolates stats strictly by UL (UL 17 sees only UL 17 stats)', async () => {
    mockedAuth.mockResolvedValue({
      user: { id: 'user-president', email: 'president@test.com', roles: ['PRESIDENT'], ulId: 'ul-paris-17' }
    } as never);

    const res = await getExpenseStats(new Request('http://localhost/api/stats/expenses?dateFrom=2026-07-01&dateTo=2026-07-31'));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.global.totalExpensesAmount).toBe(999.0);
    expect(json.data.global.reportsCount).toBe(1);
  });
});

describe('GET /api/stats/expenses — byBudget', () => {
  function presidentSession() {
    mockedAuth.mockResolvedValue({
      user: { id: 'user-president', email: 'president@test.com', roles: ['PRESIDENT'], ulId: 'ul-paris-18' }
    } as never);
  }

  async function fetchStats() {
    const res = await getExpenseStats(new Request('http://localhost/api/stats/expenses?dateFrom=2026-07-01&dateTo=2026-07-31'));
    expect(res.status).toBe(200);
    return (await res.json()).data;
  }

  it('agrège les lignes par budget avec leurs noms résolus', async () => {
    presidentSession();
    const data = await fetchStats();

    const names = data.byBudget.map((b: { name: string }) => b.name).sort();
    expect(names).toEqual(['Essence', 'N/A', 'Repas']);

    const repas = data.byBudget.find((b: { name: string }) => b.name === 'Repas');
    expect(repas).toMatchObject({ budgetId: 'budget-repas-18', amount: 20, count: 1, percentOfTotal: 40 });

    // Base des pourcentages = somme des LIGNES (50), pas des totaux de notes (200).
    const sum = data.byBudget.reduce((acc: number, b: { percentOfTotal: number }) => acc + b.percentOfTotal, 0);
    expect(sum).toBe(100);
  });

  it('un budget archivé conserve son nom exact dans byBudget', async () => {
    presidentSession();
    const data = await fetchStats();

    const essence = data.byBudget.find((b: { budgetId: string | null }) => b.budgetId === 'budget-essence-18');
    expect(essence?.name).toBe('Essence');
  });

  it('renommer un budget met à jour son nom dans byBudget pour les lignes antérieures', async () => {
    await db.execute({
      sql: `UPDATE "ExpenseBudget" SET name = ? WHERE id = ?`,
      args: ['Restauration', 'budget-repas-18'],
    });

    presidentSession();
    const data = await fetchStats();

    expect(data.byBudget.find((b: { name: string }) => b.name === 'Restauration')).toBeTruthy();
    expect(data.byBudget.find((b: { name: string }) => b.name === 'Repas')).toBeUndefined();
  });

  it('un budgetId non résolu sort sous Budget inconnu et non sous N/A', async () => {
    await db.execute({
      sql: `UPDATE "ExpenseReport" SET items = ? WHERE id = 'exp-2'`,
      args: [JSON.stringify([{ label: 'Orphelin', amount: 50, budgetId: 'budget-fantome' }])],
    });

    presidentSession();
    const data = await fetchStats();

    const unknown = data.byBudget.find((b: { name: string }) => b.name === 'Budget inconnu');
    expect(unknown).toMatchObject({ budgetId: 'budget-fantome', amount: 50 });
    expect(data.byBudget.find((b: { name: string }) => b.name === 'N/A')).toBeUndefined();
  });

  it('ne résout pas un budget d\'une autre UL', async () => {
    await db.execute({
      sql: `UPDATE "ExpenseReport" SET items = ? WHERE id = 'exp-2'`,
      args: [JSON.stringify([{ label: 'Hors UL', amount: 50, budgetId: 'budget-repas-17' }])],
    });

    presidentSession();
    const data = await fetchStats();

    expect(data.byBudget).toHaveLength(1);
    expect(data.byBudget[0].name).toBe('Budget inconnu');
  });

  it('byImputation est inchangé après ajout des budgets', async () => {
    presidentSession();
    const data = await fetchStats();

    // L'imputation reste au niveau NOTE : deux notes, deux imputations, montants
    // issus de `report.total` et non des lignes.
    expect(data.byImputation).toEqual([
      { imputation: 'DLUS', amount: 150, count: 1, percentOfTotal: 75 },
      { imputation: 'Projet Formation', amount: 50, count: 1, percentOfTotal: 25 },
    ]);
    expect(Object.keys(data.global).sort()).toEqual([
      'avgReportAmount',
      'reportsCount',
      'totalExpensesAmount',
      'totalPendingAmount',
      'totalRefundedAmount',
    ]);
  });
});

describe('POST /api/stats/expenses/csv', () => {
  it('génère et retourne directement le CSV pour PRESIDENT (réponse synchrone, plus de job store — H1)', async () => {
    mockedAuth.mockResolvedValue({
      user: { id: 'user-president', email: 'president@test.com', roles: ['PRESIDENT'], ulId: 'ul-paris-18' }
    } as never);

    const req = new Request('http://localhost/api/stats/expenses/csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dateFrom: '2026-07-01', dateTo: '2026-07-31' }),
    });

    const res = await postExpenseCsv(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    expect(res.headers.get('Content-Disposition')).toContain('notes-de-frais-martine.csv');
    const text = await res.text();
    expect(text.length).toBeGreaterThan(0);
  });

  it('le CSV des stats contient une section Par budget', async () => {
    mockedAuth.mockResolvedValue({
      user: { id: 'user-president', email: 'president@test.com', roles: ['PRESIDENT'], ulId: 'ul-paris-18' }
    } as never);

    const req = new Request('http://localhost/api/stats/expenses/csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dateFrom: '2026-07-01', dateTo: '2026-07-31' }),
    });

    const res = await postExpenseCsv(req);
    expect(res.status).toBe(200);
    const text = await res.text();

    expect(text).toContain('Budget,Lignes,Montant (EUR),Part (%)');
    expect(text).toContain('Repas,1,20.00,40');
    expect(text).toContain('Essence,1,20.00,40');
    expect(text).toContain('N/A,1,10.00,20');
  });
});

describe('POST /api/stats/expenses/pdf', () => {
  it('génère et retourne directement le PDF pour TRESORIER (réponse synchrone, plus de job store — H1)', async () => {
    mockedAuth.mockResolvedValue({
      user: { id: 'user-tresorier', email: 'tresorier@test.com', roles: ['TRESORIER'], ulId: 'ul-paris-18' }
    } as never);

    const req = new Request('http://localhost/api/stats/expenses/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dateFrom: '2026-07-01', dateTo: '2026-07-31' }),
    });

    const res = await postExpensePdf(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/pdf');
    expect(res.headers.get('Content-Disposition')).toContain('stats-notes-de-frais-martine.pdf');
    const buffer = await res.arrayBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it('le PDF des stats se génère sur un jeu avec budgets', async () => {
    // Le contenu d'un PDF @react-pdf/renderer n'est pas inspectable ici : on
    // vérifie que la section « Répartition par Budget » ne fait pas planter le
    // rendu sur un jeu portant des budgetId (résolus, archivés et null).
    mockedAuth.mockResolvedValue({
      user: { id: 'user-tresorier', email: 'tresorier@test.com', roles: ['TRESORIER'], ulId: 'ul-paris-18' }
    } as never);

    const req = new Request('http://localhost/api/stats/expenses/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dateFrom: '2026-07-01', dateTo: '2026-07-31' }),
    });

    const res = await postExpensePdf(req);
    expect(res.status).toBe(200);
    const buffer = await res.arrayBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);
  });
});

