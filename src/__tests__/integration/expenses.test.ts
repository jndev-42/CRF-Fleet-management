import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/auth';
import { GET as getList, POST as createReport } from '@/app/api/expenses/route';
import { PATCH as updateReport } from '@/app/api/expenses/[id]/route';
import { seedRoles, seedUser, seedUserRole, db } from './setup';

const mockedAuth = vi.mocked(auth);

beforeEach(async () => {
    // Clear and seed base data
    await db.execute('DELETE FROM "ExpenseReport"');
    await db.execute('DELETE FROM "UserUL"');
    await db.execute('DELETE FROM "UserRole"');
    await db.execute('DELETE FROM "User"');
    
    await seedRoles();
    await db.execute(`INSERT OR IGNORE INTO "UniteLocale" (id, name, slug) VALUES ('ul-paris-18', 'Paris 18', 'ul-paris-18')`);
    
    // Create users for tests
    await seedUser({ id: 'user-standard', email: 'secouriste@test.com', name: 'Standard User' });
    await seedUserRole('user-standard', 'SECOURISTE');
    
    await seedUser({ id: 'user-president', email: 'president@test.com', name: 'President User' });
    await seedUserRole('user-president', 'PRESIDENT');
    await db.execute({
        sql: `INSERT INTO "UserUL" (userId, ulId, is_home) VALUES ('user-president', 'ul-paris-18', 1)`
    });

    await seedUser({ id: 'user-tresorier', email: 'tresorier@test.com', name: 'Tresorier User' });
    await seedUserRole('user-tresorier', 'TRESORIER');
    await db.execute({
        sql: `INSERT INTO "UserUL" (userId, ulId, is_home) VALUES ('user-tresorier', 'ul-paris-18', 1)`
    });

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
                imputation: 'DLUS',
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
                imputation: 'DLUS',
                requestRefund: true,
                noReceiptDeclaration: false,
                items: [] // invalid
            });
            const res = await createReport(req);
            expect(res.status).toBe(400);
        });

        it('successfully creates an expense report with custom imputation (status 201)', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-standard', email: 'secouriste@test.com', roles: ['SECOURISTE'], ulId: 'ul-paris-18' } } as never);
            const req = makePostRequest({
                status: 'soumis',
                imputation: 'Autre',
                customImputation: 'Projet Formation 2026',
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
            expect(dbCheck.rows[0].imputation).toBe('Autre');
            expect(dbCheck.rows[0].customImputation).toBe('Projet Formation 2026');
            expect(dbCheck.rows[0].total).toBe(75.50);
            expect(JSON.parse(dbCheck.rows[0].items as string)).toHaveLength(2);
        });

        it('creates a notification for PRESIDENT when a report is submitted', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-standard', email: 'secouriste@test.com', roles: ['SECOURISTE'], ulId: 'ul-paris-18', name: 'Standard User' } } as never);
            const req = makePostRequest({
                status: 'soumis',
                imputation: 'DLUS',
                requestRefund: true,
                noReceiptDeclaration: false,
                items: [{ label: 'Fournitures', amount: 50 }]
            });
            const res = await createReport(req);
            expect(res.status).toBe(201);

            const notifs = await db.execute({
                sql: 'SELECT * FROM "Notification" WHERE userId = ?',
                args: ['user-president']
            });
            expect(notifs.rows.length).toBeGreaterThanOrEqual(1);
            expect(notifs.rows[0].title).toContain('Note de frais à valider');
        });
    });

    describe('GET /api/expenses', () => {
        beforeEach(async () => {
            await db.execute({
                sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, total, items, ulId, requestRefund)
                      VALUES ('exp-submitted', 'user-standard', '2026-07-19T10:00:00Z', 'soumis', 50.0, '[]', 'ul-paris-18', 1)`
            });
            await db.execute({
                sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, total, items, ulId, requestRefund)
                      VALUES ('exp-pending-pay', 'user-other', '2026-07-19T11:00:00Z', 'en_attente_paiement', 80.0, '[]', 'ul-paris-18', 1)`
            });
            await db.execute({
                sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, total, items, ulId, requestRefund)
                      VALUES ('exp-processed', 'user-other', '2026-07-19T12:00:00Z', 'traité', 100.0, '[]', 'ul-paris-18', 1)`
            });
            await db.execute({
                sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, total, items, ulId, requestRefund)
                      VALUES ('exp-draft', 'user-standard', '2026-07-19T13:00:00Z', 'brouillon', 20.0, '[]', 'ul-paris-18', 1)`
            });
        });

        it('returns only owned reports for a standard user regardless of scope param', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-standard', email: 'secouriste@test.com', roles: ['SECOURISTE'], ulId: 'ul-paris-18' } } as never);
            const res = await getList(new Request('http://localhost/api/expenses?scope=ul'));
            expect(res.status).toBe(200);
            
            const data = await res.json();
            expect(data).toHaveLength(2);
            const ids = data.map((r: { id: string }) => r.id);
            expect(ids).toContain('exp-submitted');
            expect(ids).toContain('exp-draft');
            expect(ids).not.toContain('exp-pending-pay');
        });

        it('returns pending payment reports for a TRESORIER when in UL scope', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-tresorier', email: 'tresorier@test.com', roles: ['TRESORIER'], ulId: 'ul-paris-18' } } as never);
            const res = await getList(new Request('http://localhost/api/expenses?scope=ul'));
            expect(res.status).toBe(200);
            
            const data = await res.json();
            expect(data).toHaveLength(1);
            expect(data[0].id).toBe('exp-pending-pay');
        });

        it('returns only own reports for a TRESORIER when in my scope', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-tresorier', email: 'tresorier@test.com', roles: ['TRESORIER'], ulId: 'ul-paris-18' } } as never);
            const res = await getList(new Request('http://localhost/api/expenses?scope=my'));
            expect(res.status).toBe(200);
            
            const data = await res.json();
            expect(data).toHaveLength(0); // tresorier has no reports of their own seeded
        });

        it('returns non-processed reports for a PRESIDENT by default (without includeProcessed)', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-president', email: 'president@test.com', roles: ['PRESIDENT'], ulId: 'ul-paris-18' } } as never);
            const res = await getList(new Request('http://localhost/api/expenses?scope=ul'));
            expect(res.status).toBe(200);
            
            const data = await res.json();
            expect(data).toHaveLength(3);
            const ids = data.map((r: { id: string }) => r.id);
            expect(ids).toContain('exp-submitted');
            expect(ids).toContain('exp-pending-pay');
            expect(ids).toContain('exp-draft');
            expect(ids).not.toContain('exp-processed');
        });

        it('returns all reports for a PRESIDENT when includeProcessed=true', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-president', email: 'president@test.com', roles: ['PRESIDENT'], ulId: 'ul-paris-18' } } as never);
            const res = await getList(new Request('http://localhost/api/expenses?scope=ul&includeProcessed=true'));
            expect(res.status).toBe(200);
            
            const data = await res.json();
            expect(data).toHaveLength(4);
            const ids = data.map((r: { id: string }) => r.id);
            expect(ids).toContain('exp-processed');
        });
    });

    describe('PATCH /api/expenses/[id]', () => {
        beforeEach(async () => {
            await db.execute({
                sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, total, items, ulId, requestRefund)
                      VALUES ('exp-submitted-refund', 'user-standard', '2026-07-19T10:00:00Z', 'soumis', 50.0, '[]', 'ul-paris-18', 1)`
            });
            await db.execute({
                sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, total, items, ulId, requestRefund)
                      VALUES ('exp-submitted-norefund', 'user-standard', '2026-07-19T10:00:00Z', 'soumis', 50.0, '[]', 'ul-paris-18', 0)`
            });
            await db.execute({
                sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, total, items, ulId, requestRefund)
                      VALUES ('exp-pending', 'user-standard', '2026-07-19T10:00:00Z', 'en_attente_paiement', 50.0, '[]', 'ul-paris-18', 1)`
            });
        });

        it('validating report with requestRefund=1 transitions to en_attente_paiement', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-president', email: 'president@test.com', roles: ['PRESIDENT'] } } as never);
            const req = makePatchRequest({ action: 'validate' });
            const res = await updateReport(req, { params: Promise.resolve({ id: 'exp-submitted-refund' }) });
            expect(res.status).toBe(200);

            const dbCheck = await db.execute({ sql: 'SELECT * FROM "ExpenseReport" WHERE id = ?', args: ['exp-submitted-refund'] });
            expect(dbCheck.rows[0].status).toBe('en_attente_paiement');
            expect(dbCheck.rows[0].validatedBy).toBe('user-president');
        });

        it('validating report with requestRefund=0 transitions directly to traité', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-president', email: 'president@test.com', roles: ['PRESIDENT'] } } as never);
            const req = makePatchRequest({ action: 'validate' });
            const res = await updateReport(req, { params: Promise.resolve({ id: 'exp-submitted-norefund' }) });
            expect(res.status).toBe(200);

            const dbCheck = await db.execute({ sql: 'SELECT * FROM "ExpenseReport" WHERE id = ?', args: ['exp-submitted-norefund'] });
            expect(dbCheck.rows[0].status).toBe('traité');
        });

        it('allows manager to reject a report with a comment', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-president', email: 'president@test.com', roles: ['PRESIDENT'] } } as never);
            const req = makePatchRequest({ action: 'reject', rejectionComment: 'Justificatif manquant' });
            const res = await updateReport(req, { params: Promise.resolve({ id: 'exp-submitted-refund' }) });
            expect(res.status).toBe(200);

            const dbCheck = await db.execute({ sql: 'SELECT * FROM "ExpenseReport" WHERE id = ?', args: ['exp-submitted-refund'] });
            expect(dbCheck.rows[0].status).toBe('refusé');
            expect(dbCheck.rows[0].rejectionComment).toBe('Justificatif manquant');
            expect(dbCheck.rows[0].rejectedBy).toBe('user-president');
        });

        it('returns 400 when rejecting without a comment', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-president', email: 'president@test.com', roles: ['PRESIDENT'] } } as never);
            const req = makePatchRequest({ action: 'reject', rejectionComment: '' });
            const res = await updateReport(req, { params: Promise.resolve({ id: 'exp-submitted-refund' }) });
            expect(res.status).toBe(400);
        });

        it('returns 403 when PRESIDENT attempts to mark report as paid', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-president', email: 'president@test.com', roles: ['PRESIDENT'] } } as never);
            const req = makePatchRequest({ action: 'pay' });
            const res = await updateReport(req, { params: Promise.resolve({ id: 'exp-pending' }) });
            expect(res.status).toBe(403);
        });

        it('allows TRESORIER to mark pending payment report as paid (traité)', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-tresorier', email: 'tresorier@test.com', roles: ['TRESORIER'] } } as never);
            const req = makePatchRequest({ action: 'pay' });
            const res = await updateReport(req, { params: Promise.resolve({ id: 'exp-pending' }) });
            expect(res.status).toBe(200);

            const dbCheck = await db.execute({ sql: 'SELECT * FROM "ExpenseReport" WHERE id = ?', args: ['exp-pending'] });
            expect(dbCheck.rows[0].status).toBe('traité');
            expect(dbCheck.rows[0].paidBy).toBe('user-tresorier');
        });

        it('saves validatorSignature upon validation', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-president', email: 'president@test.com', roles: ['PRESIDENT'] } } as never);
            const sigObj = { mode: 'typed', name: 'President User', date: '2026-07-21T10:00:00Z', hash: 'ysg_test_123' };
            const req = makePatchRequest({ action: 'validate', validatorSignature: sigObj });
            const res = await updateReport(req, { params: Promise.resolve({ id: 'exp-submitted-refund' }) });
            expect(res.status).toBe(200);

            const dbCheck = await db.execute({ sql: 'SELECT * FROM "ExpenseReport" WHERE id = ?', args: ['exp-submitted-refund'] });
            expect(dbCheck.rows[0].validatorSignature).toContain('ysg_test_123');
        });

        it('creates a notification for TRESORIER when a report is validated with refund requirement', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-president', email: 'president@test.com', roles: ['PRESIDENT'] } } as never);
            const req = makePatchRequest({ action: 'validate' });
            const res = await updateReport(req, { params: Promise.resolve({ id: 'exp-submitted-refund' }) });
            expect(res.status).toBe(200);

            const notifs = await db.execute({
                sql: 'SELECT * FROM "Notification" WHERE userId = ?',
                args: ['user-tresorier']
            });
            expect(notifs.rows.length).toBeGreaterThanOrEqual(1);
            expect(notifs.rows[0].title).toContain('Note de frais à payer');
        });
    });

    describe('GET /api/expenses/[id]/pdf', () => {
        beforeEach(async () => {
            await db.execute({
                sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, total, items, ulId, requestRefund, userFunction, userSignature)
                      VALUES ('exp-pdf-test', 'user-standard', '2026-07-19T10:00:00Z', 'soumis', 45.0, '[{"label":"Carburant","amount":45.0}]', 'ul-paris-18', 1, 'Bénévole local', '{"name":"Standard User"}')`
            });
        });

        it('returns 401 when unauthenticated', async () => {
            mockedAuth.mockResolvedValue(null);
            const { GET: getPdf } = await import('@/app/api/expenses/[id]/pdf/route');
            const res = await getPdf(new Request('http://localhost/api/expenses/exp-pdf-test/pdf'), { params: Promise.resolve({ id: 'exp-pdf-test' }) });
            expect(res.status).toBe(401);
        });

        it('returns a PDF response with Content-Type application/pdf', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-standard', email: 'secouriste@test.com', roles: ['SECOURISTE'] } } as never);
            const { GET: getPdf } = await import('@/app/api/expenses/[id]/pdf/route');
            const res = await getPdf(new Request('http://localhost/api/expenses/exp-pdf-test/pdf'), { params: Promise.resolve({ id: 'exp-pdf-test' }) });
            expect(res.status).toBe(200);
            expect(res.headers.get('Content-Type')).toBe('application/pdf');
            expect(res.headers.get('Content-Disposition')).toContain('note-de-frais-exp-pdf-test.pdf');
        });
    });
});
