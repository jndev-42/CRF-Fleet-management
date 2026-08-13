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
import { seedRoles, seedUser, seedUserRole, db } from './setup';

const mockedAuth = vi.mocked(auth);

beforeEach(async () => {
  await db.execute('DELETE FROM "ExpenseReport"');
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

  // Seed expense reports for UL 18
  await db.execute({
    sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, total, items, ulId, imputation, customImputation, requestRefund)
          VALUES ('exp-1', 'user-standard', '2026-07-15T10:00:00Z', 'traité', 150.0, '[]', 'ul-paris-18', 'DLUS', NULL, 1)`
  });
  await db.execute({
    sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, total, items, ulId, imputation, customImputation, requestRefund)
          VALUES ('exp-2', 'user-standard', '2026-07-18T10:00:00Z', 'soumis', 50.0, '[]', 'ul-paris-18', 'Autre', 'Projet Formation', 1)`
  });

  // Seed expense report for UL 17
  await db.execute({
    sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, total, items, ulId, imputation, customImputation, requestRefund)
          VALUES ('exp-ul17', 'user-standard', '2026-07-18T10:00:00Z', 'traité', 999.0, '[]', 'ul-paris-17', 'DLAS', NULL, 1)`
  });
});

describe('GET /api/stats/expenses', () => {
  it('returns 401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
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
});

