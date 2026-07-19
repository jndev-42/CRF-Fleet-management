import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/auth';
import { GET as getList, POST as createReport } from '@/app/api/expenses/route';
import { GET as getDetail, PATCH as updateReport, DELETE as deleteReport } from '@/app/api/expenses/[id]/route';
import { seedRoles, seedUser, seedUserRole, db } from './setup';

const mockedAuth = vi.mocked(auth);

beforeEach(async () => {
    // Clear and seed base data
    await db.execute('DELETE FROM "ExpenseReport"');
    await db.execute('DELETE FROM "UserRole"');
    await db.execute('DELETE FROM "User"');
    
    await seedRoles();
    
    // Create users for tests
    await seedUser({ id: 'user-standard', email: 'secouriste@test.com', name: 'Standard User' });
    await seedUserRole('user-standard', 'SECOURISTE');
    
    await seedUser({ id: 'user-president', email: 'president@test.com', name: 'President User' });
    await seedUserRole('user-president', 'PRESIDENT');

    await seedUser({ id: 'user-other', email: 'other@test.com', name: 'Other User' });
    await seedUserRole('user-other', 'SECOURISTE');
});

// Helper functions for mock requests
function makePostRequest(body: Record<string, unknown>): Request {
    return new Request('http://localhost/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

function makePatchRequest(body: Record<string, unknown>): Request {
    return new Request('http://localhost/api/expenses/some-id', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

describe('Expense Report integration tests', () => {

    describe('POST /api/expenses', () => {
        it('returns 401 when unauthenticated', async () => {
            mockedAuth.mockResolvedValue(null);
            const req = makePostRequest({
                status: 'soumis',
                requestRefund: true,
                noReceiptDeclaration: false,
                items: [{ label: 'Decathlon', amount: 45.99 }]
            });
            const res = await createReport(req);
            expect(res.status).toBe(401);
        });

        it('returns 400 on invalid payload (no items)', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-standard', email: 'secouriste@test.com', roles: ['SECOURISTE'] } } as never);
            const req = makePostRequest({
                status: 'soumis',
                requestRefund: true,
                noReceiptDeclaration: false,
                items: [] // invalid
            });
            const res = await createReport(req);
            expect(res.status).toBe(400);
        });

        it('returns 400 on invalid payload (negative amount)', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-standard', email: 'secouriste@test.com', roles: ['SECOURISTE'] } } as never);
            const req = makePostRequest({
                status: 'soumis',
                requestRefund: true,
                noReceiptDeclaration: false,
                items: [{ label: 'Essence', amount: -10 }] // invalid
            });
            const res = await createReport(req);
            expect(res.status).toBe(400);
        });

        it('successfully creates an expense report (status 201)', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-standard', email: 'secouriste@test.com', roles: ['SECOURISTE'], ulId: 'ul-paris-18' } } as never);
            const req = makePostRequest({
                status: 'soumis',
                requestRefund: true,
                noReceiptDeclaration: false,
                items: [
                    { label: 'Essence Boxer', amount: 60 },
                    { label: 'Piles', amount: 15.50 }
                ]
            });
            const res = await createReport(req);
            expect(res.status).toBe(201);
            
            const data = await res.json();
            expect(data.success).toBe(true);
            expect(data.id).toBeDefined();

            // Verify in db
            const dbCheck = await db.execute({
                sql: 'SELECT * FROM "ExpenseReport" WHERE id = ?',
                args: [data.id]
            });
            expect(dbCheck.rows).toHaveLength(1);
            expect(dbCheck.rows[0].userId).toBe('user-standard');
            expect(dbCheck.rows[0].status).toBe('soumis');
            expect(dbCheck.rows[0].total).toBe(75.50);
            expect(JSON.parse(dbCheck.rows[0].items as string)).toHaveLength(2);
        });
    });

    describe('GET /api/expenses', () => {
        beforeEach(async () => {
            // Seed a few reports
            // Standard user has 1 submitted, 1 draft
            await db.execute({
                sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, total, items, ulId)
                      VALUES ('exp-submitted', 'user-standard', '2026-07-19T10:00:00Z', 'soumis', 50.0, '[]', 'ul-paris-18')`
            });
            await db.execute({
                sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, total, items, ulId)
                      VALUES ('exp-draft', 'user-standard', '2026-07-19T11:00:00Z', 'brouillon', 20.0, '[]', 'ul-paris-18')`
            });
            // Other user has 1 submitted
            await db.execute({
                sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, total, items, ulId)
                      VALUES ('exp-other', 'user-other', '2026-07-19T12:00:00Z', 'soumis', 100.0, '[]', 'ul-paris-18')`
            });
        });

        it('returns 401 when unauthenticated', async () => {
            mockedAuth.mockResolvedValue(null);
            const res = await getList(new Request('http://localhost/api/expenses'));
            expect(res.status).toBe(401);
        });

        it('returns only owned reports for a standard user', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-standard', email: 'secouriste@test.com', roles: ['SECOURISTE'], ulId: 'ul-paris-18' } } as never);
            const res = await getList(new Request('http://localhost/api/expenses'));
            expect(res.status).toBe(200);
            
            const data = await res.json();
            expect(data).toHaveLength(2);
            const ids = data.map((r: { id: string }) => r.id);
            expect(ids).toContain('exp-submitted');
            expect(ids).toContain('exp-draft');
            expect(ids).not.toContain('exp-other');
        });

        it('returns all reports in the same UL for a PRESIDENT', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-president', email: 'president@test.com', roles: ['PRESIDENT'], ulId: 'ul-paris-18' } } as never);
            const res = await getList(new Request('http://localhost/api/expenses'));
            expect(res.status).toBe(200);
            
            const data = await res.json();
            expect(data).toHaveLength(3);
            const ids = data.map((r: { id: string }) => r.id);
            expect(ids).toContain('exp-submitted');
            expect(ids).toContain('exp-draft');
            expect(ids).toContain('exp-other');
        });
    });

    describe('GET /api/expenses/[id]', () => {
        beforeEach(async () => {
            await db.execute({
                sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, total, items, ulId)
                      VALUES ('exp-1', 'user-standard', '2026-07-19T10:00:00Z', 'soumis', 50.0, '[]', 'ul-paris-18')`
            });
        });

        it('returns 401 when unauthenticated', async () => {
            mockedAuth.mockResolvedValue(null);
            const res = await getDetail(new Request('http://localhost/api/expenses/exp-1'), { params: Promise.resolve({ id: 'exp-1' }) });
            expect(res.status).toBe(401);
        });

        it('returns 403 when standard user attempts to read another user\'s report', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-other', email: 'other@test.com', roles: ['SECOURISTE'] } } as never);
            const res = await getDetail(new Request('http://localhost/api/expenses/exp-1'), { params: Promise.resolve({ id: 'exp-1' }) });
            expect(res.status).toBe(403);
        });

        it('returns 200 when owner requests report details', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-standard', email: 'secouriste@test.com', roles: ['SECOURISTE'] } } as never);
            const res = await getDetail(new Request('http://localhost/api/expenses/exp-1'), { params: Promise.resolve({ id: 'exp-1' }) });
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.id).toBe('exp-1');
            expect(data.total).toBe(50);
        });

        it('returns 200 when manager (PRESIDENT) requests report details', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-president', email: 'president@test.com', roles: ['PRESIDENT'] } } as never);
            const res = await getDetail(new Request('http://localhost/api/expenses/exp-1'), { params: Promise.resolve({ id: 'exp-1' }) });
            expect(res.status).toBe(200);
        });
    });

    describe('PATCH /api/expenses/[id]', () => {
        beforeEach(async () => {
            await db.execute({
                sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, total, items, ulId)
                      VALUES ('exp-draft', 'user-standard', '2026-07-19T10:00:00Z', 'brouillon', 50.0, '[]', 'ul-paris-18')`
            });
            await db.execute({
                sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, total, items, ulId)
                      VALUES ('exp-submitted', 'user-standard', '2026-07-19T10:00:00Z', 'soumis', 50.0, '[]', 'ul-paris-18')`
            });
        });

        it('allows owner to update draft', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-standard', email: 'secouriste@test.com', roles: ['SECOURISTE'] } } as never);
            const req = makePatchRequest({
                action: 'update',
                requestRefund: false,
                items: [{ label: 'Pharmacie', amount: 30 }]
            });
            const res = await updateReport(req, { params: Promise.resolve({ id: 'exp-draft' }) });
            expect(res.status).toBe(200);

            // check in db
            const dbCheck = await db.execute({ sql: 'SELECT * FROM "ExpenseReport" WHERE id = ?', args: ['exp-draft'] });
            expect(dbCheck.rows[0].total).toBe(30);
            expect(dbCheck.rows[0].requestRefund).toBe(0);
        });

        it('allows owner to submit draft', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-standard', email: 'secouriste@test.com', roles: ['SECOURISTE'] } } as never);
            const req = makePatchRequest({
                action: 'submit'
            });
            const res = await updateReport(req, { params: Promise.resolve({ id: 'exp-draft' }) });
            expect(res.status).toBe(200);

            const dbCheck = await db.execute({ sql: 'SELECT * FROM "ExpenseReport" WHERE id = ?', args: ['exp-draft'] });
            expect(dbCheck.rows[0].status).toBe('soumis');
        });

        it('returns 400 when owner attempts to update a submitted report', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-standard', email: 'secouriste@test.com', roles: ['SECOURISTE'] } } as never);
            const req = makePatchRequest({
                action: 'update',
                items: [{ label: 'Pharmacie', amount: 30 }]
            });
            const res = await updateReport(req, { params: Promise.resolve({ id: 'exp-submitted' }) });
            expect(res.status).toBe(400);
            const data = await res.json();
            expect(data.error).toMatch(/statut brouillon/i);
        });

        it('allows PRESIDENT to validate a submitted report', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-president', email: 'president@test.com', roles: ['PRESIDENT'] } } as never);
            const req = makePatchRequest({
                action: 'validate'
            });
            const res = await updateReport(req, { params: Promise.resolve({ id: 'exp-submitted' }) });
            expect(res.status).toBe(200);

            const dbCheck = await db.execute({ sql: 'SELECT * FROM "ExpenseReport" WHERE id = ?', args: ['exp-submitted'] });
            expect(dbCheck.rows[0].status).toBe('validé');
            expect(dbCheck.rows[0].validatedBy).toBe('user-president');
            expect(dbCheck.rows[0].validatedAt).toBeDefined();
        });

        it('returns 403 when standard user attempts to validate', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-standard', email: 'secouriste@test.com', roles: ['SECOURISTE'] } } as never);
            const req = makePatchRequest({
                action: 'validate'
            });
            const res = await updateReport(req, { params: Promise.resolve({ id: 'exp-submitted' }) });
            expect(res.status).toBe(403);
        });
    });

    describe('DELETE /api/expenses/[id]', () => {
        beforeEach(async () => {
            await db.execute({
                sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, total, items, ulId)
                      VALUES ('exp-draft', 'user-standard', '2026-07-19T10:00:00Z', 'brouillon', 50.0, '[]', 'ul-paris-18')`
            });
            await db.execute({
                sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, total, items, ulId)
                      VALUES ('exp-submitted', 'user-standard', '2026-07-19T10:00:00Z', 'soumis', 50.0, '[]', 'ul-paris-18')`
            });
        });

        it('allows owner to delete their own draft', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-standard', email: 'secouriste@test.com', roles: ['SECOURISTE'] } } as never);
            const res = await deleteReport(new Request('http://localhost/api/expenses/exp-draft'), { params: Promise.resolve({ id: 'exp-draft' }) });
            expect(res.status).toBe(200);

            const dbCheck = await db.execute({ sql: 'SELECT * FROM "ExpenseReport" WHERE id = ?', args: ['exp-draft'] });
            expect(dbCheck.rows).toHaveLength(0);
        });

        it('returns 400 when attempting to delete a submitted report', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-standard', email: 'secouriste@test.com', roles: ['SECOURISTE'] } } as never);
            const res = await deleteReport(new Request('http://localhost/api/expenses/exp-submitted'), { params: Promise.resolve({ id: 'exp-submitted' }) });
            expect(res.status).toBe(400);
            
            const dbCheck = await db.execute({ sql: 'SELECT * FROM "ExpenseReport" WHERE id = ?', args: ['exp-submitted'] });
            expect(dbCheck.rows).toHaveLength(1);
        });

        it('returns 403 when trying to delete another user\'s draft', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-other', email: 'other@test.com', roles: ['SECOURISTE'] } } as never);
            const res = await deleteReport(new Request('http://localhost/api/expenses/exp-draft'), { params: Promise.resolve({ id: 'exp-draft' }) });
            expect(res.status).toBe(403);
        });
    });
});
