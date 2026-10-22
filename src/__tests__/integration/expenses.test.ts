import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

// R2 est un service externe : toujours mocké (règle src/__tests__/CLAUDE.md).
vi.mock('@/lib/r2', () => ({
    putObject: vi.fn(async () => undefined),
    getObject: vi.fn(async () => Buffer.from('%PDF-1.3 scelle')),
    headObject: vi.fn(async () => true),
    deleteObject: vi.fn(async () => undefined),
    buildExpenseKey: (id: string, rev: number, att: string) => `${id}/v${rev}-${att}.pdf`,
    buildExpenseStagingKey: (stagingId: string, name: string) => `expenses-staging/${stagingId}/${name}`,
    newAttemptId: () => 'testatt',
    R2Error: class R2Error extends Error {},
    R2ConfigError: class R2ConfigError extends Error {},
}));

// Dérogation ASSUMÉE à « ne mocker que les services externes » : le scellement
// est du métier interne, mais chaque passe coûte une signature RSA (~1 s). La
// chaîne cryptographique réelle est couverte par `unit/pdf-signature.test.ts`,
// qui enchaîne trois scellements via le sealPdf de production.
vi.mock('@/lib/expenses/sealing', () => {
    const fakeSeal = (step: 1 | 2 | 3 | 4, role: string, columns?: Record<string, number>) =>
        async (reportId: string, signer: { id: string; name: string }) => ({
            // Chaque buffer prolonge le précédent, comme un vrai incremental update :
            // `persistSealed` le vérifie pour une suite de scellements.
            buffer: Buffer.from(`%PDF-1.3 scelle${'-x'.repeat(step)}`),
            key: `${reportId}/v${step}-testatt.pdf`,
            revision: {
                step, signerId: signer.id, signerName: signer.name, role,
                signedAt: new Date().toISOString(), businessDate: null,
                r2Key: `${reportId}/v${step}-testatt.pdf`,
            },
            ...(columns ? { columns } : {}),
        });
    return {
        // Le vrai sealStep1 pose les quatre champs et bascule la note sur le circuit v2.
        sealStep1: vi.fn(fakeSeal(1, 'Demandeur', { workflowVersion: 2 })),
        sealStep2: vi.fn(async (reportId: string, signer: { id: string; name: string }, opts: { stage?: string } = {}) =>
            fakeSeal(2, opts.stage === 'legacy' ? 'Valideur' : 'Responsable d\'activité')(reportId, signer)),
        sealStep3: vi.fn(fakeSeal(3, 'Payeur')),
        sealPresident: vi.fn(fakeSeal(4, 'Président')),
        // Le vrai résolveur lit R2 ; en test, un justificatif est un simple passe-plat.
        resolvePendingReceipts: vi.fn(async (keys: string[]) =>
            keys.map(key => ({ buffer: Buffer.from('%PDF-1.3 justificatif'), mime: key.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg' }))),
        appendRevision: (existing: unknown, ...revs: unknown[]) => {
            const arr = typeof existing === 'string' && existing ? JSON.parse(existing) : [];
            return JSON.stringify([...arr, ...revs]);
        },
        SealingError: class SealingError extends Error {},
        RevisionMismatchError: class RevisionMismatchError extends Error {},
        TooManyItemsError: class TooManyItemsError extends Error {},
    };
});

/** Signature factice au format produit par ElectronicSignatureModal. */
const SIG = { mode: 'draw', image: 'data:image/png;base64,iVBORw0KGgo=', name: 'Testeur', date: '2026-08-28', hash: 'abc123' };

import { auth } from '@/auth';
import { GET as getList, POST as createReport } from '@/app/api/expenses/route';
import { GET as getReport, PATCH as updateReport } from '@/app/api/expenses/[id]/route';
import { seedRoles, seedUser, seedUserRole, seedExpenseBudget, seedExpenseBudgetFixtures, EXPENSE_BUDGET_FIXTURES, db } from './setup';

const mockedAuth = vi.mocked(auth);

/** Budget actif de référence de `ul-paris-18` — chaque ligne de dépense doit en porter un. */
const BUDGET_18 = EXPENSE_BUDGET_FIXTURES['ul-paris-18'];
const BUDGET_17 = EXPENSE_BUDGET_FIXTURES['ul-paris-17'];

beforeEach(async () => {
    // Clear and seed base data
    await db.execute('DELETE FROM "ExpenseReport"');
    await db.execute('DELETE FROM "UserUL"');
    await db.execute('DELETE FROM "UserRole"');
    await db.execute('DELETE FROM "User"');
    
    await seedRoles();
    await db.execute(`INSERT OR IGNORE INTO "UniteLocale" (id, name, slug) VALUES ('ul-paris-18', 'Paris 18', 'ul-paris-18')`);
    await db.execute(`INSERT OR IGNORE INTO "UniteLocale" (id, name, slug) VALUES ('ul-paris-17', 'Paris 17', 'ul-paris-17')`);
    // Un budget actif par UL : sans lui, toute écriture de lignes est refusée en 400.
    await seedExpenseBudgetFixtures();

    // Create users for tests
    await seedUser({ id: 'user-standard', email: 'secouriste@test.com', name: 'Standard User' });
    await seedUserRole('user-standard', 'SECOURISTE');
    
    await seedUser({ id: 'user-president', email: 'president@test.com', name: 'President User' });
    await seedUserRole('user-president', 'PRESIDENT');
    await db.execute({
        sql: `INSERT INTO "UserUL" (userId, ulId, is_home) VALUES ('user-president', 'ul-paris-18', 1)`,
      args: [],
    });

    await seedUser({ id: 'user-tresorier', email: 'tresorier@test.com', name: 'Tresorier User' });
    await seedUserRole('user-tresorier', 'TRESORIER');
    await db.execute({
        sql: `INSERT INTO "UserUL" (userId, ulId, is_home) VALUES ('user-tresorier', 'ul-paris-18', 1)`,
      args: [],
    });

    await seedUser({ id: 'user-other', email: 'other@test.com', name: 'Other User' });
    await seedUserRole('user-other', 'SECOURISTE');
});

// Helper functions for mock requests
// missionName / missionDate sont obligatoires : valeurs par défaut ici, surchargeables par test.
function makePostRequest(body: Record<string, unknown>): Request {
    return new Request('http://localhost/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ missionName: 'Maraude Nord', missionDate: '2026-03-12', ...body }),
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
            mockedAuth.mockResolvedValue(null as never);
            const req = makePostRequest({
                status: 'soumis',
                userSignature: SIG,
                imputation: 'DLUS',
                requestRefund: true,
                noReceiptDeclaration: false,
                items: [{ label: 'Decathlon', amount: 45.99, budgetId: BUDGET_18 }]
            } as never);
            const res = await createReport(req);
            expect(res.status).toBe(401);
        });

        it('returns 400 on invalid payload (no items)', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-standard', email: 'secouriste@test.com', roles: ['SECOURISTE'] } } as never);
            const req = makePostRequest({
                status: 'soumis',
                userSignature: SIG,
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
                userSignature: SIG,
                imputation: 'Autre',
                customImputation: 'Projet Formation 2026',
                requestRefund: true,
                noReceiptDeclaration: false,
                items: [
                    { label: 'Essence Boxer', amount: 60, budgetId: BUDGET_18 },
                    { label: 'Piles', amount: 15.50, budgetId: BUDGET_18 }
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

        it('retourne 400 si le nom de la mission est absent', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-standard', email: 'secouriste@test.com', roles: ['SECOURISTE'], ulId: 'ul-paris-18' } } as never);
            const req = makePostRequest({
                missionName: '   ',
                status: 'soumis',
                userSignature: SIG,
                imputation: 'DLUS',
                requestRefund: true,
                noReceiptDeclaration: false,
                items: [{ label: 'Essence', amount: 30, budgetId: BUDGET_18 }]
            });
            const res = await createReport(req);
            expect(res.status).toBe(400);
        });

        it('retourne 400 si la date de la mission est absente ou mal formatée', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-standard', email: 'secouriste@test.com', roles: ['SECOURISTE'], ulId: 'ul-paris-18' } } as never);

            const missing = await createReport(makePostRequest({
                missionDate: undefined,
                status: 'soumis',
                userSignature: SIG,
                imputation: 'DLUS',
                requestRefund: true,
                noReceiptDeclaration: false,
                items: [{ label: 'Essence', amount: 30, budgetId: BUDGET_18 }]
            }));
            expect(missing.status).toBe(400);

            const malformed = await createReport(makePostRequest({
                missionDate: '12/03/2026',
                status: 'soumis',
                userSignature: SIG,
                imputation: 'DLUS',
                requestRefund: true,
                noReceiptDeclaration: false,
                items: [{ label: 'Essence', amount: 30, budgetId: BUDGET_18 }]
            }));
            expect(malformed.status).toBe(400);
        });

        it('persiste le nom et la date de mission en base', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-standard', email: 'secouriste@test.com', roles: ['SECOURISTE'], ulId: 'ul-paris-18' } } as never);
            const req = makePostRequest({
                missionName: '  Poste de secours Marathon  ',
                missionDate: '2026-04-05',
                status: 'brouillon',
                imputation: 'DLUS',
                requestRefund: true,
                noReceiptDeclaration: false,
                items: [{ label: 'Repas', amount: 12, budgetId: BUDGET_18 }]
            });
            const res = await createReport(req);
            expect(res.status).toBe(201);
            const { id } = await res.json();

            const dbCheck = await db.execute({
                sql: 'SELECT missionName, missionDate FROM "ExpenseReport" WHERE id = ?',
                args: [id]
            });
            expect(dbCheck.rows[0].missionName).toBe('Poste de secours Marathon');
            expect(dbCheck.rows[0].missionDate).toBe('2026-04-05');
        });

        it('creates a notification for PRESIDENT when a report is submitted', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-standard', email: 'secouriste@test.com', roles: ['SECOURISTE'], ulId: 'ul-paris-18', name: 'Standard User' } } as never);
            const req = makePostRequest({
                status: 'soumis',
                userSignature: SIG,
                imputation: 'DLUS',
                requestRefund: true,
                noReceiptDeclaration: false,
                items: [{ label: 'Fournitures', amount: 50, budgetId: BUDGET_18 }]
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
                      VALUES ('exp-submitted', 'user-standard', '2026-07-19T10:00:00Z', 'soumis', 50.0, '[]', 'ul-paris-18', 1)`,
              args: [],
            });
            await db.execute({
                sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, total, items, ulId, requestRefund)
                      VALUES ('exp-pending-pay', 'user-other', '2026-07-19T11:00:00Z', 'en_attente_paiement', 80.0, '[]', 'ul-paris-18', 1)`,
              args: [],
            });
            await db.execute({
                sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, total, items, ulId, requestRefund)
                      VALUES ('exp-processed', 'user-other', '2026-07-19T12:00:00Z', 'traité', 100.0, '[]', 'ul-paris-18', 1)`,
              args: [],
            });
            await db.execute({
                sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, total, items, ulId, requestRefund)
                      VALUES ('exp-draft', 'user-standard', '2026-07-19T13:00:00Z', 'brouillon', 20.0, '[]', 'ul-paris-18', 1)`,
              args: [],
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
                      VALUES ('exp-submitted-refund', 'user-standard', '2026-07-19T10:00:00Z', 'soumis', 50.0, '[]', 'ul-paris-18', 1)`,
              args: [],
            });
            await db.execute({
                sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, total, items, ulId, requestRefund)
                      VALUES ('exp-submitted-norefund', 'user-standard', '2026-07-19T10:00:00Z', 'soumis', 50.0, '[]', 'ul-paris-18', 0)`,
              args: [],
            });
            await db.execute({
                sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, total, items, ulId, requestRefund)
                      VALUES ('exp-pending', 'user-standard', '2026-07-19T10:00:00Z', 'en_attente_paiement', 50.0, '[]', 'ul-paris-18', 1)`,
              args: [],
            });
        });

        it('validating report with requestRefund=1 transitions to en_attente_paiement', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-president', email: 'president@test.com', roles: ['PRESIDENT'] } } as never);
            const req = makePatchRequest({ action: 'validate', validatorSignature: SIG });
            const res = await updateReport(req, { params: Promise.resolve({ id: 'exp-submitted-refund' }) });
            expect(res.status).toBe(200);

            const dbCheck = await db.execute({ sql: 'SELECT * FROM "ExpenseReport" WHERE id = ?', args: ['exp-submitted-refund'] });
            expect(dbCheck.rows[0].status).toBe('en_attente_paiement');
            expect(dbCheck.rows[0].validatedBy).toBe('user-president');
        });

        it('validating report with requestRefund=0 transitions directly to traité', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-president', email: 'president@test.com', roles: ['PRESIDENT'] } } as never);
            const req = makePatchRequest({ action: 'validate', validatorSignature: SIG });
            const res = await updateReport(req, { params: Promise.resolve({ id: 'exp-submitted-norefund' }) });
            expect(res.status).toBe(200);

            const dbCheck = await db.execute({ sql: 'SELECT * FROM "ExpenseReport" WHERE id = ?', args: ['exp-submitted-norefund'] });
            expect(dbCheck.rows[0].status).toBe('traité');
        });

        it('allows manager to reject a report with a comment', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-president', email: 'president@test.com', roles: ['PRESIDENT'] } } as never);
            const req = makePatchRequest({ action: 'reject', rejectionComment: 'Justificatif manquant', validatorSignature: SIG });
            const res = await updateReport(req, { params: Promise.resolve({ id: 'exp-submitted-refund' }) });
            expect(res.status).toBe(200);

            const dbCheck = await db.execute({ sql: 'SELECT * FROM "ExpenseReport" WHERE id = ?', args: ['exp-submitted-refund'] });
            expect(dbCheck.rows[0].status).toBe('refusé');
            expect(dbCheck.rows[0].rejectionComment).toBe('Justificatif manquant');
            expect(dbCheck.rows[0].rejectedBy).toBe('user-president');
        });

        it('returns 400 when rejecting without a comment', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-president', email: 'president@test.com', roles: ['PRESIDENT'] } } as never);
            const req = makePatchRequest({ action: 'reject', rejectionComment: '', validatorSignature: SIG });
            const res = await updateReport(req, { params: Promise.resolve({ id: 'exp-submitted-refund' }) });
            expect(res.status).toBe(400);
        });

        it('returns 403 when PRESIDENT attempts to mark report as paid', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-president', email: 'president@test.com', roles: ['PRESIDENT'] } } as never);
            const req = makePatchRequest({ action: 'pay', payerSignature: SIG });
            const res = await updateReport(req, { params: Promise.resolve({ id: 'exp-pending' }) });
            expect(res.status).toBe(403);
        });

        it('allows TRESORIER to mark pending payment report as paid (traité)', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-tresorier', email: 'tresorier@test.com', roles: ['TRESORIER'] } } as never);
            const req = makePatchRequest({ action: 'pay', payerSignature: SIG });
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
            const req = makePatchRequest({ action: 'validate', validatorSignature: SIG });
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

    describe('GET /api/expenses/[id]', () => {
        beforeEach(async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-standard', email: 'secouriste@test.com', roles: ['SECOURISTE'], ulId: 'ul-paris-18' } } as never);
        });

        it('restitue les justificatifs en attente sous forme de tableau', async () => {
            await db.execute({
                sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, imputation, total, items, ulId, pendingReceiptKeys)
                      VALUES ('exp-recus', 'user-standard', '2026-07-19T10:00:00Z', 'brouillon', 'DLUS', 20.0, '[]', 'ul-paris-18', ?)`,
                args: [JSON.stringify(['expenses-staging/s1/a.jpg'])],
            });
            const res = await getReport(new Request('http://localhost/api/expenses/exp-recus'), { params: Promise.resolve({ id: 'exp-recus' }) });
            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.pendingReceiptKeys).toEqual(['expenses-staging/s1/a.jpg']);
        });

        it('retombe sur un tableau vide si le journal de justificatifs est corrompu', async () => {
            await db.execute({
                sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, imputation, total, items, ulId, pendingReceiptKeys)
                      VALUES ('exp-corrompu', 'user-standard', '2026-07-19T10:00:00Z', 'brouillon', 'DLUS', 20.0, '[]', 'ul-paris-18', '{pas du JSON valide')`,
                args: [],
            });
            const res = await getReport(new Request('http://localhost/api/expenses/exp-corrompu'), { params: Promise.resolve({ id: 'exp-corrompu' }) });
            expect(res.status).toBe(200);
            expect((await res.json()).pendingReceiptKeys).toEqual([]);
        });
    });

    describe('GET /api/expenses/[id]/pdf', () => {
        beforeEach(async () => {
            await db.execute({
                // `r2Key` est indispensable : la route ne régénère plus rien, elle
                // ne fait que servir le document scellé.
                sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, total, items, ulId, requestRefund, userFunction, userSignature, r2Key)
                      VALUES ('exp-pdf-test', 'user-standard', '2026-07-19T10:00:00Z', 'soumis', 45.0, '[{"label":"Carburant","amount":45.0}]', 'ul-paris-18', 1, 'Bénévole local', '{"name":"Standard User"}', 'exp-pdf-test/v1-abc.pdf')`,
              args: [],
            });
        });

        it('returns 401 when unauthenticated', async () => {
            mockedAuth.mockResolvedValue(null as never);
            const { GET: getPdf } = await import('@/app/api/expenses/[id]/pdf/route');
            const res = await getPdf(new Request('http://localhost/api/expenses/exp-pdf-test/pdf'), { params: Promise.resolve({ id: 'exp-pdf-test' }) });
            expect(res.status).toBe(401);
        });

        it('sert le document scellé avec le bon Content-Type', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-standard', email: 'secouriste@test.com', roles: ['SECOURISTE'] } } as never);
            const { GET: getPdf } = await import('@/app/api/expenses/[id]/pdf/route');
            const res = await getPdf(new Request('http://localhost/api/expenses/exp-pdf-test/pdf'), { params: Promise.resolve({ id: 'exp-pdf-test' }) });
            expect(res.status).toBe(200);
            expect(res.headers.get('Content-Type')).toBe('application/pdf');
            expect(res.headers.get('Content-Disposition')).toContain('note-de-frais-exp-pdf-test.pdf');
        });
    });

    describe('PATCH /api/expenses/[id] — mission obligatoire', () => {
        beforeEach(async () => {
            // Brouillon créé avant l'ajout du champ mission : missionName / missionDate à NULL.
            await db.execute({
                sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, imputation, total, items, ulId, requestRefund)
                      VALUES ('exp-draft', 'user-standard', '2026-07-19T10:00:00Z', 'brouillon', 'DLUS', 20.0, '[{"label":"Repas","amount":20.0}]', 'ul-paris-18', 1)`,
                args: [],
            });
            mockedAuth.mockResolvedValue({ user: { id: 'user-standard', email: 'secouriste@test.com', roles: ['SECOURISTE'], ulId: 'ul-paris-18' } } as never);
        });

        it('retourne 400 lors de la mise à jour d\'un brouillon sans nom de mission', async () => {
            const req = makePatchRequest({
                action: 'update',
                status: 'brouillon',
                items: [{ label: 'Repas', amount: 20, budgetId: BUDGET_18 }],
            });
            const res = await updateReport(req, { params: Promise.resolve({ id: 'exp-draft' }) });
            expect(res.status).toBe(400);
        });

        it('retourne 400 lors de la soumission d\'un brouillon sans date de mission', async () => {
            const req = makePatchRequest({
                action: 'submit',
                missionName: 'Maraude Nord',
                items: [{ label: 'Repas', amount: 20, budgetId: BUDGET_18 }],
            });
            const res = await updateReport(req, { params: Promise.resolve({ id: 'exp-draft' }) });
            expect(res.status).toBe(400);
        });

        it('met à jour le brouillon et persiste la mission (happy path)', async () => {
            const req = makePatchRequest({
                action: 'update',
                status: 'brouillon',
                missionName: '  Maraude Nord  ',
                missionDate: '2026-03-12',
                items: [{ label: 'Repas', amount: 20, budgetId: BUDGET_18 }],
            });
            const res = await updateReport(req, { params: Promise.resolve({ id: 'exp-draft' }) });
            expect(res.status).toBe(200);

            const dbCheck = await db.execute({
                sql: 'SELECT missionName, missionDate FROM "ExpenseReport" WHERE id = ?',
                args: ['exp-draft'],
            });
            expect(dbCheck.rows[0].missionName).toBe('Maraude Nord');
            expect(dbCheck.rows[0].missionDate).toBe('2026-03-12');
        });

        it('n\'exige pas la mission pour les actions de validation', async () => {
            await db.execute({
                sql: `UPDATE "ExpenseReport" SET status = 'soumis' WHERE id = 'exp-draft'`,
                args: [],
            });
            mockedAuth.mockResolvedValue({ user: { id: 'user-president', email: 'president@test.com', roles: ['PRESIDENT'], ulId: 'ul-paris-18' } } as never);

            const res = await updateReport(makePatchRequest({ action: 'validate', validatorSignature: SIG }), { params: Promise.resolve({ id: 'exp-draft' }) });
            expect(res.status).toBe(200);
        });

        // Régression : la soumission d'un BROUILLON existant via PATCH (relecture
        // puis envoi) ne déclenchait AUCUN scellement — la note passait « soumise »
        // sans jamais produire de PDF signé. Seule la création directe (POST, note
        // jamais enregistrée en brouillon au préalable) scellait.
        it('scelle réellement le PDF lors de la soumission d\'un brouillon existant (PATCH)', async () => {
            const req = makePatchRequest({
                action: 'submit',
                missionName: 'Maraude Nord',
                missionDate: '2026-03-12',
                userSignature: SIG,
                items: [{ label: 'Repas', amount: 20, budgetId: BUDGET_18 }],
            });
            const res = await updateReport(req, { params: Promise.resolve({ id: 'exp-draft' }) });
            expect(res.status).toBe(200);

            const row = (await db.execute({
                sql: 'SELECT status, r2Key, signatureRevisions FROM "ExpenseReport" WHERE id = ?',
                args: ['exp-draft'],
            })).rows[0];
            expect(row.status).toBe('soumis');
            expect(row.r2Key).toBeTruthy();
            expect(JSON.parse(row.signatureRevisions as string)).toHaveLength(1);
        });

        it('refuse la soumission d\'un brouillon existant sans signature du demandeur (PATCH, 400)', async () => {
            const req = makePatchRequest({
                action: 'submit',
                missionName: 'Maraude Nord',
                missionDate: '2026-03-12',
                items: [{ label: 'Repas', amount: 20, budgetId: BUDGET_18 }],
            });
            const res = await updateReport(req, { params: Promise.resolve({ id: 'exp-draft' }) });
            expect(res.status).toBe(400);

            // La note reste modifiable — jamais « soumise » sans document scellé.
            const row = (await db.execute({
                sql: 'SELECT status, r2Key FROM "ExpenseReport" WHERE id = ?', args: ['exp-draft'],
            })).rows[0];
            expect(row.status).toBe('brouillon');
            expect(row.r2Key).toBeFalsy();
        });

        it('persiste les justificatifs déposés lors d\'un enregistrement de brouillon', async () => {
            const req = makePatchRequest({
                action: 'update',
                status: 'brouillon',
                missionName: 'Maraude Nord',
                missionDate: '2026-03-12',
                receiptKeys: ['expenses-staging/s1/a.jpg', 'expenses-staging/s1/b.pdf'],
                items: [{ label: 'Repas', amount: 20, budgetId: BUDGET_18 }],
            });
            const res = await updateReport(req, { params: Promise.resolve({ id: 'exp-draft' }) });
            expect(res.status).toBe(200);

            const row = (await db.execute({
                sql: 'SELECT pendingReceiptKeys FROM "ExpenseReport" WHERE id = ?', args: ['exp-draft'],
            })).rows[0];
            expect(JSON.parse(row.pendingReceiptKeys as string)).toEqual([
                'expenses-staging/s1/a.jpg', 'expenses-staging/s1/b.pdf',
            ]);
        });

        it('intègre les justificatifs au scellement puis nettoie le dépôt transitoire', async () => {
            await db.execute({
                sql: `UPDATE "ExpenseReport" SET pendingReceiptKeys = ? WHERE id = 'exp-draft'`,
                args: [JSON.stringify(['expenses-staging/s1/a.jpg'])],
            });

            const { sealStep1, resolvePendingReceipts } = await import('@/lib/expenses/sealing');
            const { deleteObject } = await import('@/lib/r2');

            const req = makePatchRequest({
                action: 'submit',
                missionName: 'Maraude Nord',
                missionDate: '2026-03-12',
                userSignature: SIG,
                items: [{ label: 'Repas', amount: 20, budgetId: BUDGET_18 }],
            });
            const res = await updateReport(req, { params: Promise.resolve({ id: 'exp-draft' }) });
            expect(res.status).toBe(200);

            expect(vi.mocked(resolvePendingReceipts)).toHaveBeenCalledWith(['expenses-staging/s1/a.jpg']);
            expect(vi.mocked(sealStep1)).toHaveBeenCalledWith(
                'exp-draft', expect.anything(), expect.any(Date),
                [{ buffer: expect.anything(), mime: 'image/jpeg' }]
            );
            expect(vi.mocked(deleteObject)).toHaveBeenCalledWith('expenses-staging/s1/a.jpg');

            const row = (await db.execute({
                sql: 'SELECT pendingReceiptKeys FROM "ExpenseReport" WHERE id = ?', args: ['exp-draft'],
            })).rows[0];
            expect(row.pendingReceiptKeys).toBeFalsy();
        });

        it('retombe sur aucun justificatif si le journal en base est corrompu, sans faire échouer la soumission', async () => {
            await db.execute({
                sql: `UPDATE "ExpenseReport" SET pendingReceiptKeys = '{pas du JSON valide' WHERE id = 'exp-draft'`,
                args: [],
            });
            const { resolvePendingReceipts } = await import('@/lib/expenses/sealing');

            const req = makePatchRequest({
                action: 'submit',
                missionName: 'Maraude Nord',
                missionDate: '2026-03-12',
                userSignature: SIG,
                items: [{ label: 'Repas', amount: 20, budgetId: BUDGET_18 }],
            });
            const res = await updateReport(req, { params: Promise.resolve({ id: 'exp-draft' }) });
            expect(res.status).toBe(200);
            expect(vi.mocked(resolvePendingReceipts)).toHaveBeenCalledWith([]);
        });

        it('refuse la soumission d\'un brouillon existant dépassant 9 postes (400)', async () => {
            const req = makePatchRequest({
                action: 'submit',
                missionName: 'Maraude Nord',
                missionDate: '2026-03-12',
                userSignature: SIG,
                items: Array.from({ length: 10 }, (_, i) => ({ label: `D${i}`, amount: 1, budgetId: BUDGET_18 })),
            });
            const res = await updateReport(req, { params: Promise.resolve({ id: 'exp-draft' }) });
            expect(res.status).toBe(400);
            expect((await res.json()).error).toContain('scinder');
        });

        it('500 si le scellement échoue lors de la soumission d\'un brouillon existant, sans changer son statut', async () => {
            const { sealStep1 } = await import('@/lib/expenses/sealing');
            vi.mocked(sealStep1).mockRejectedValueOnce(new Error('signature RSA indisponible'));

            const req = makePatchRequest({
                action: 'submit',
                missionName: 'Maraude Nord',
                missionDate: '2026-03-12',
                userSignature: SIG,
                items: [{ label: 'Repas', amount: 20, budgetId: BUDGET_18 }],
            });
            const res = await updateReport(req, { params: Promise.resolve({ id: 'exp-draft' }) });
            expect(res.status).toBe(500);

            const row = (await db.execute({
                sql: 'SELECT status FROM "ExpenseReport" WHERE id = ?', args: ['exp-draft'],
            })).rows[0];
            expect(row.status).toBe('brouillon');
        });
    });

    describe('Scellement cryptographique — signatures obligatoires', () => {
        beforeEach(async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-president', email: 'president@test.com', name: 'President User', roles: ['SUPER_ADMIN', 'PRESIDENT', 'TRESORIER'], ulId: 'ul-paris-18' } } as never);
        });

        it('refuse la soumission sans signature du demandeur (400)', async () => {
            const req = new Request('http://localhost/api/expenses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: 'soumis', missionName: 'M', missionDate: '2026-08-20',
                    requestRefund: true, noReceiptDeclaration: false,
                    items: [{ label: 'Péage', amount: 10, budgetId: BUDGET_18 }],
                }),
            });
            const res = await createReport(req);
            expect(res.status).toBe(400);
            // Sceller un PDF dont la colonne demandeur est vide produirait un
            // artefact définitivement invalide : DocMDP interdit de le corriger.
            expect((await res.json()).error).toContain('signature');
        });

        it('refuse une note de plus de 9 postes (400) — elle déborderait sur 2 pages', async () => {
            const req = new Request('http://localhost/api/expenses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: 'soumis', missionName: 'M', missionDate: '2026-08-20',
                    requestRefund: true, noReceiptDeclaration: false, userSignature: SIG,
                    items: Array.from({ length: 10 }, (_, i) => ({ label: `D${i}`, amount: 1, budgetId: BUDGET_18 })),
                }),
            });
            const res = await createReport(req);
            expect(res.status).toBe(400);
            expect((await res.json()).error).toContain('scinder');
        });

        it('accepte une note de 9 postes exactement', async () => {
            const req = new Request('http://localhost/api/expenses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: 'soumis', missionName: 'M', missionDate: '2026-08-20',
                    requestRefund: true, noReceiptDeclaration: false, userSignature: SIG,
                    items: Array.from({ length: 9 }, (_, i) => ({ label: `D${i}`, amount: 1, budgetId: BUDGET_18 })),
                }),
            });
            expect((await createReport(req)).status).toBe(201);
        });

        it('enregistre r2Key et le journal des révisions à la soumission', async () => {
            const req = new Request('http://localhost/api/expenses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: 'soumis', missionName: 'M', missionDate: '2026-08-20',
                    requestRefund: true, noReceiptDeclaration: false, userSignature: SIG,
                    items: [{ label: 'Péage', amount: 10, budgetId: BUDGET_18 }],
                }),
            });
            const { id } = await (await createReport(req)).json();
            const row = (await db.execute({ sql: 'SELECT status, r2Key, signatureRevisions FROM "ExpenseReport" WHERE id = ?', args: [id] })).rows[0];
            expect(row.status).toBe('soumis');
            expect(row.r2Key).toBeTruthy();
            expect(JSON.parse(row.signatureRevisions as string)).toHaveLength(1);
        });

        it('intègre les justificatifs déposés au PDF puis nettoie le dépôt transitoire', async () => {
            const { sealStep1, resolvePendingReceipts } = await import('@/lib/expenses/sealing');
            const { deleteObject } = await import('@/lib/r2');

            const req = new Request('http://localhost/api/expenses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: 'soumis', missionName: 'M', missionDate: '2026-08-20',
                    requestRefund: true, noReceiptDeclaration: false, userSignature: SIG,
                    receiptKeys: ['expenses-staging/s1/ticket.jpg', 'expenses-staging/s1/facture.pdf'],
                    items: [{ label: 'Péage', amount: 10, budgetId: BUDGET_18 }],
                }),
            });
            const { id } = await (await createReport(req)).json();

            expect(vi.mocked(resolvePendingReceipts)).toHaveBeenCalledWith([
                'expenses-staging/s1/ticket.jpg', 'expenses-staging/s1/facture.pdf',
            ]);
            expect(vi.mocked(sealStep1)).toHaveBeenCalledWith(
                id, expect.anything(), expect.any(Date),
                [
                    { buffer: expect.anything(), mime: 'image/jpeg' },
                    { buffer: expect.anything(), mime: 'application/pdf' },
                ]
            );
            expect(vi.mocked(deleteObject)).toHaveBeenCalledWith('expenses-staging/s1/ticket.jpg');
            expect(vi.mocked(deleteObject)).toHaveBeenCalledWith('expenses-staging/s1/facture.pdf');

            const row = (await db.execute({
                sql: 'SELECT pendingReceiptKeys FROM "ExpenseReport" WHERE id = ?', args: [id],
            })).rows[0];
            expect(row.pendingReceiptKeys).toBeFalsy();
        });

        it('refuse la validation sans signature du valideur (400)', async () => {
            await db.execute({ sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, imputation, total, items, ulId, r2Key, signatureRevisions) VALUES (?,?,?,?,?,?,?,?,?,?)`,
                args: ['exp-v', 'user-standard', new Date().toISOString(), 'soumis', 'DLUS', 10, '[]', 'ul-paris-18', 'exp-v/v1-a.pdf', '[{}]'] });
            const res = await updateReport(makePatchRequest({ action: 'validate' }), { params: Promise.resolve({ id: 'exp-v' }) });
            expect(res.status).toBe(400);
        });

        it('refuse le paiement sans signature du payeur (400)', async () => {
            await db.execute({ sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, imputation, total, items, ulId, r2Key, signatureRevisions) VALUES (?,?,?,?,?,?,?,?,?,?)`,
                args: ['exp-p', 'user-standard', new Date().toISOString(), 'en_attente_paiement', 'DLUS', 10, '[]', 'ul-paris-18', 'exp-p/v2-a.pdf', '[{},{}]'] });
            const res = await updateReport(makePatchRequest({ action: 'pay' }), { params: Promise.resolve({ id: 'exp-p' }) });
            expect(res.status).toBe(400);
        });

        it('persiste la signature du valideur lors d\'un REFUS (décision D5)', async () => {
            await db.execute({ sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, imputation, total, items, ulId, r2Key, signatureRevisions) VALUES (?,?,?,?,?,?,?,?,?,?)`,
                args: ['exp-r', 'user-standard', new Date().toISOString(), 'soumis', 'DLUS', 10, '[]', 'ul-paris-18', 'exp-r/v1-a.pdf', '[{}]'] });
            const res = await updateReport(
                makePatchRequest({ action: 'reject', rejectionComment: 'Justificatif manquant', validatorSignature: SIG }),
                { params: Promise.resolve({ id: 'exp-r' }) });
            expect(res.status).toBe(200);

            const row = (await db.execute({ sql: 'SELECT status, validatorSignature, signatureRevisions FROM "ExpenseReport" WHERE id = ?', args: ['exp-r'] })).rows[0];
            expect(row.status).toBe('refusé');
            // Le refus est un événement signé, pas une simple annotation.
            expect(row.validatorSignature).toBeTruthy();
            expect(JSON.parse(row.signatureRevisions as string)).toHaveLength(2);
        });

        it('interdit toute transition depuis « refusé » — le document est clos', async () => {
            await db.execute({ sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, imputation, total, items, ulId, r2Key) VALUES (?,?,?,?,?,?,?,?,?)`,
                args: ['exp-c', 'user-standard', new Date().toISOString(), 'refusé', 'DLUS', 10, '[]', 'ul-paris-18', 'exp-c/v2-a.pdf'] });

            for (const body of [{ action: 'validate', validatorSignature: SIG }, { action: 'pay', payerSignature: SIG }]) {
                const res = await updateReport(makePatchRequest(body), { params: Promise.resolve({ id: 'exp-c' }) });
                expect(res.status).toBe(400);
            }
        });
    });

    describe('Échecs de scellement — codes HTTP', () => {
        beforeEach(async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-president', email: 'president@test.com', name: 'President User', roles: ['SUPER_ADMIN', 'TRESORIER'], ulId: 'ul-paris-18' } } as never);
            await db.execute({
                sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, imputation, total, items, ulId, r2Key, signatureRevisions) VALUES (?,?,?,?,?,?,?,?,?,?)`,
                args: ['exp-err', 'user-standard', new Date().toISOString(), 'soumis', 'DLUS', 10, '[]', 'ul-paris-18', 'exp-err/v1-a.pdf', '[{}]'],
            });
        });

        async function validateWithSealError(err: Error): Promise<Response> {
            const { sealStep2 } = await import('@/lib/expenses/sealing');
            vi.mocked(sealStep2).mockRejectedValueOnce(err);
            return updateReport(
                makePatchRequest({ action: 'validate', validatorSignature: SIG }),
                { params: Promise.resolve({ id: 'exp-err' }) },
            );
        }

        /** Reproduit un type d'erreur par son nom de constructeur, comme en production. */
        function namedError(name: string, message: string): Error {
            const E = { [name]: class extends Error {} }[name];
            Object.defineProperty(E, 'name', { value: name });
            return new E(message);
        }

        it('409 quand le journal de révisions et le PDF divergent', async () => {
            const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const res = await validateWithSealError(namedError('RevisionMismatchError', 'divergence'));
            expect(res.status).toBe(409);
            // Une divergence se diagnostique, elle ne se répare jamais en silence.
            expect((await res.json()).error).toContain('Incohérence');
            spy.mockRestore();
        });

        it('409 quand un appel concurrent a déjà fait avancer la note', async () => {
            const res = await validateWithSealError(namedError('ConcurrentTransitionError', 'concurrence'));
            expect(res.status).toBe(409);
            expect((await res.json()).error).toContain('changé d\'état');
        });

        it('400 quand la note dépasse une page', async () => {
            const res = await validateWithSealError(namedError('TooManyItemsError', 'Trop de lignes, scindez votre note.'));
            expect(res.status).toBe(400);
            expect((await res.json()).error).toContain('scindez');
        });

        it('500 sur échec imprévu, sans modifier la note', async () => {
            const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const res = await validateWithSealError(new Error('R2 injoignable'));
            expect(res.status).toBe(500);

            // Le scellement n'est pas accessoire : son échec annule la transition.
            const row = (await db.execute({ sql: 'SELECT status FROM "ExpenseReport" WHERE id = ?', args: ['exp-err'] })).rows[0];
            expect(row.status).toBe('soumis');
            spy.mockRestore();
        });
    });
    describe('Budget analytique par ligne de dépense', () => {
        beforeEach(async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-standard', email: 'secouriste@test.com', roles: ['SECOURISTE'], ulId: 'ul-paris-18' } } as never);
        });

        it('POST retourne 400 si une ligne n\'a pas de budgetId', async () => {
            const req = makePostRequest({
                status: 'brouillon',
                imputation: 'DLUS',
                requestRefund: false,
                noReceiptDeclaration: false,
                items: [{ label: 'Repas', amount: 12 }],
            });
            const res = await createReport(req);
            expect(res.status).toBe(400);
        });

        it('POST retourne 400 pour un budgetId hors UL de la note', async () => {
            const req = makePostRequest({
                status: 'brouillon',
                imputation: 'DLUS',
                requestRefund: false,
                noReceiptDeclaration: false,
                // Budget de l'UL 17 sur une note créée dans l'UL 18.
                items: [{ label: 'Repas', amount: 12, budgetId: BUDGET_17 }],
            });
            const res = await createReport(req);
            expect(res.status).toBe(400);
            expect((await res.json()).error).toBe('Ligne 1 : budget inconnu.');
        });

        it('le message d\'erreur nomme la ligne et le budget fautifs', async () => {
            await seedExpenseBudget({ id: 'b-arch-msg', ulId: 'ul-paris-18', name: 'Essence', archived: true });
            const req = makePostRequest({
                status: 'brouillon',
                imputation: 'DLUS',
                requestRefund: false,
                noReceiptDeclaration: false,
                items: [
                    { label: 'Repas', amount: 12, budgetId: BUDGET_18 },
                    { label: 'Plein', amount: 40, budgetId: 'b-arch-msg' },
                ],
            });
            const res = await createReport(req);
            expect(res.status).toBe(400);
            expect((await res.json()).error).toBe('Ligne 2 : le budget « Essence » est archivé et ne peut plus être utilisé.');
        });

        it('le budgetId d\'une ligne survit à un POST puis GET', async () => {
            const created = await createReport(makePostRequest({
                status: 'brouillon',
                imputation: 'DLUS',
                requestRefund: false,
                noReceiptDeclaration: false,
                items: [{ label: 'Repas', amount: 12, budgetId: BUDGET_18 }],
            }));
            expect(created.status).toBe(201);
            const { id } = await created.json();

            const res = await getReport(new Request(`http://localhost/api/expenses/${id}`), { params: Promise.resolve({ id }) });
            expect(res.status).toBe(200);
            const report = await res.json();
            expect(report.items).toEqual([{ label: 'Repas', amount: 12, budgetId: BUDGET_18 }]);
        });

        it('PATCH update retourne 400 si une ligne n\'a pas de budgetId', async () => {
            await db.execute({
                sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, imputation, total, items, ulId, requestRefund)
                      VALUES ('exp-budget-draft', 'user-standard', '2026-07-19T10:00:00Z', 'brouillon', 'DLUS', 20.0, '[]', 'ul-paris-18', 0)`,
              args: [],
            });
            const res = await updateReport(makePatchRequest({
                action: 'update',
                status: 'brouillon',
                missionName: 'Maraude Nord',
                missionDate: '2026-03-12',
                items: [{ label: 'Repas', amount: 20 }],
            }), { params: Promise.resolve({ id: 'exp-budget-draft' }) });
            expect(res.status).toBe(400);
        });

        it('la validation référentielle se fait sur l\'UL de la note', async () => {
            // Note figée dans l'UL 17 ; l'auteur a l'UL 18 pour UL de session.
            await db.execute({
                sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, imputation, total, items, ulId, requestRefund)
                      VALUES ('exp-ul17', 'user-standard', '2026-07-19T10:00:00Z', 'brouillon', 'DLUS', 20.0, '[]', 'ul-paris-17', 0)`,
              args: [],
            });

            const rejected = await updateReport(makePatchRequest({
                action: 'update',
                status: 'brouillon',
                missionName: 'Maraude Nord',
                missionDate: '2026-03-12',
                items: [{ label: 'Repas', amount: 20, budgetId: BUDGET_18 }],
            }), { params: Promise.resolve({ id: 'exp-ul17' }) });
            expect(rejected.status).toBe(400);

            const accepted = await updateReport(makePatchRequest({
                action: 'update',
                status: 'brouillon',
                missionName: 'Maraude Nord',
                missionDate: '2026-03-12',
                items: [{ label: 'Repas', amount: 20, budgetId: BUDGET_17 }],
            }), { params: Promise.resolve({ id: 'exp-ul17' }) });
            expect(accepted.status).toBe(200);
        });

        it('un budget archivé déjà présent dans la note reste accepté', async () => {
            await seedExpenseBudget({ id: 'b-arch-ok', ulId: 'ul-paris-18', name: 'Essence', archived: true });
            await db.execute({
                sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, imputation, total, items, ulId, requestRefund)
                      VALUES ('exp-arch-ok', 'user-standard', '2026-07-19T10:00:00Z', 'brouillon', 'DLUS', 20.0,
                              '[{"label":"Plein","amount":20,"budgetId":"b-arch-ok"}]', 'ul-paris-18', 0)`,
              args: [],
            });

            const res = await updateReport(makePatchRequest({
                action: 'update',
                status: 'brouillon',
                missionName: 'Maraude Nord',
                missionDate: '2026-03-12',
                items: [{ label: 'Plein', amount: 25, budgetId: 'b-arch-ok' }],
            }), { params: Promise.resolve({ id: 'exp-arch-ok' }) });
            expect(res.status).toBe(200);
        });

        it('un budget archivé nouvellement introduit est rejeté', async () => {
            await seedExpenseBudget({ id: 'b-arch-ko', ulId: 'ul-paris-18', name: 'Essence', archived: true });
            await db.execute({
                sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, imputation, total, items, ulId, requestRefund)
                      VALUES ('exp-arch-ko', 'user-standard', '2026-07-19T10:00:00Z', 'brouillon', 'DLUS', 20.0,
                              '[{"label":"Repas","amount":20,"budgetId":"budget-test-18"}]', 'ul-paris-18', 0)`,
              args: [],
            });

            const res = await updateReport(makePatchRequest({
                action: 'update',
                status: 'brouillon',
                missionName: 'Maraude Nord',
                missionDate: '2026-03-12',
                items: [{ label: 'Plein', amount: 25, budgetId: 'b-arch-ko' }],
            }), { params: Promise.resolve({ id: 'exp-arch-ko' }) });
            expect(res.status).toBe(400);
        });

        // ⚠️ Non-régression du circuit scellé : validate / reject / pay n'envoient
        // JAMAIS d'items. Rendre `items` requis bloquerait le paiement sur des
        // notes déjà scellées, donc non corrigeables par ré-édition.
        it('validate reste valide sans items', async () => {
            await db.execute({
                sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, imputation, total, items, ulId, requestRefund)
                      VALUES ('exp-val', 'user-standard', '2026-07-19T10:00:00Z', 'soumis', 'DLUS', 20.0, '[]', 'ul-paris-18', 0)`,
              args: [],
            });
            mockedAuth.mockResolvedValue({ user: { id: 'user-president', email: 'president@test.com', roles: ['PRESIDENT'] } } as never);

            const res = await updateReport(makePatchRequest({ action: 'validate', validatorSignature: SIG }), { params: Promise.resolve({ id: 'exp-val' }) });
            expect(res.status).toBe(200);
        });

        it('reject reste valide sans items', async () => {
            await db.execute({
                sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, imputation, total, items, ulId, requestRefund)
                      VALUES ('exp-rej', 'user-standard', '2026-07-19T10:00:00Z', 'soumis', 'DLUS', 20.0, '[]', 'ul-paris-18', 1)`,
              args: [],
            });
            mockedAuth.mockResolvedValue({ user: { id: 'user-president', email: 'president@test.com', roles: ['PRESIDENT'] } } as never);

            const res = await updateReport(
                makePatchRequest({ action: 'reject', rejectionComment: 'Justificatif manquant', validatorSignature: SIG }),
                { params: Promise.resolve({ id: 'exp-rej' }) },
            );
            expect(res.status).toBe(200);
        });

        it('pay reste valide sans items', async () => {
            await db.execute({
                sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, imputation, total, items, ulId, requestRefund)
                      VALUES ('exp-pay', 'user-standard', '2026-07-19T10:00:00Z', 'en_attente_paiement', 'DLUS', 20.0, '[]', 'ul-paris-18', 1)`,
              args: [],
            });
            mockedAuth.mockResolvedValue({ user: { id: 'user-tresorier', email: 'tresorier@test.com', roles: ['TRESORIER'] } } as never);

            const res = await updateReport(makePatchRequest({ action: 'pay', payerSignature: SIG }), { params: Promise.resolve({ id: 'exp-pay' }) });
            expect(res.status).toBe(200);
        });
    });

    describe('PATCH /api/expenses/[id] — notification du demandeur', () => {
        async function seedReport(id: string, status: string, requestRefund: number, userId = 'user-standard') {
            await db.execute({
                sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, total, items, ulId, requestRefund)
                      VALUES (?, ?, '2026-07-19T10:00:00Z', ?, 50.0, '[]', 'ul-paris-18', ?)`,
                args: [id, userId, status, requestRefund],
            });
        }
        async function notifsFor(userId: string) {
            const r = await db.execute({ sql: `SELECT title, message, url FROM "Notification" WHERE userId = ?`, args: [userId] });
            return r.rows;
        }

        it('validation sans remboursement : le demandeur reçoit « validée », le trésorier rien', async () => {
            await seedReport('exp-n1', 'soumis', 0);
            mockedAuth.mockResolvedValue({ user: { id: 'user-president', email: 'president@test.com', roles: ['PRESIDENT'] } } as never);

            const res = await updateReport(makePatchRequest({ action: 'validate', validatorSignature: SIG }), { params: Promise.resolve({ id: 'exp-n1' }) });
            expect(res.status).toBe(200);

            const mine = await notifsFor('user-standard');
            expect(mine).toHaveLength(1);
            expect(mine[0].message).toBe('Votre note de frais a été validée.');
            expect(mine[0].url).toBe('/expenses');
            expect(await notifsFor('user-tresorier')).toHaveLength(0);
        });

        it('validation avec remboursement : « validée, en attente de paiement » + notification au trésorier', async () => {
            await seedReport('exp-n2', 'soumis', 1);
            mockedAuth.mockResolvedValue({ user: { id: 'user-president', email: 'president@test.com', roles: ['PRESIDENT'] } } as never);

            await updateReport(makePatchRequest({ action: 'validate', validatorSignature: SIG }), { params: Promise.resolve({ id: 'exp-n2' }) });

            const mine = await notifsFor('user-standard');
            expect(mine).toHaveLength(1);
            expect(mine[0].message).toContain('en attente de paiement');
            expect(await notifsFor('user-tresorier')).toHaveLength(1);
        });

        it('paiement : le demandeur est prévenu', async () => {
            await seedReport('exp-n3', 'en_attente_paiement', 1);
            mockedAuth.mockResolvedValue({ user: { id: 'user-tresorier', email: 'tresorier@test.com', roles: ['TRESORIER'] } } as never);

            await updateReport(makePatchRequest({ action: 'pay', payerSignature: SIG }), { params: Promise.resolve({ id: 'exp-n3' }) });

            const mine = await notifsFor('user-standard');
            expect(mine).toHaveLength(1);
            expect(mine[0].message).toBe('Votre note de frais a été payée.');
        });

        it('refus : le demandeur reçoit le motif', async () => {
            await seedReport('exp-n4', 'soumis', 1);
            mockedAuth.mockResolvedValue({ user: { id: 'user-president', email: 'president@test.com', roles: ['PRESIDENT'] } } as never);

            await updateReport(
                makePatchRequest({ action: 'reject', rejectionComment: 'Justificatif manquant', validatorSignature: SIG }),
                { params: Promise.resolve({ id: 'exp-n4' }) },
            );

            const mine = await notifsFor('user-standard');
            expect(mine).toHaveLength(1);
            expect(mine[0].message).toContain('Justificatif manquant');
        });

        // D2 : on ne valide plus sa propre note — ni validation, ni notification.
        it('le valideur ne peut pas valider sa propre note, et n\'est donc pas notifié', async () => {
            await seedReport('exp-n5', 'soumis', 0, 'user-president');
            mockedAuth.mockResolvedValue({ user: { id: 'user-president', email: 'president@test.com', roles: ['PRESIDENT'] } } as never);

            const res = await updateReport(makePatchRequest({ action: 'validate', validatorSignature: SIG }), { params: Promise.resolve({ id: 'exp-n5' }) });
            expect(res.status).toBe(403);
            expect(await notifsFor('user-president')).toHaveLength(0);
        });
    });

    // ── Circuit v2 : responsable d'activité puis président ──────────────────
    describe('Circuit RESPO puis président (workflowVersion 2)', () => {
        const respoSession = { user: { id: 'user-respo', email: 'respo@test.com', name: 'Respo User', roles: ['RESPO'], ulId: 'ul-paris-18' } };
        const presidentSession = { user: { id: 'user-president', email: 'president@test.com', name: 'President User', roles: ['PRESIDENT'], ulId: 'ul-paris-18' } };

        beforeEach(async () => {
            await db.execute('DELETE FROM "Notification"');
            for (const id of ['user-respo', 'user-respo2']) {
                await seedUser({ id, email: `${id}@test.com`, name: id });
                await seedUserRole(id, 'RESPO');
                await db.execute({ sql: `INSERT INTO "UserUL" (userId, ulId, is_home) VALUES (?, 'ul-paris-18', 1)`, args: [id] });
            }
        });

        /** Note v2 déjà scellée (#1), au statut voulu. */
        async function seedV2(id: string, status: string, opts: { userId?: string; requestRefund?: 0 | 1; revisions?: number; ulId?: string } = {}) {
            await db.execute({
                sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, imputation, total, items, ulId, requestRefund, r2Key, signatureRevisions, workflowVersion)
                      VALUES (?, ?, ?, ?, 'DLUS', 42, '[]', ?, ?, ?, ?, 2)`,
                args: [id, opts.userId ?? 'user-standard', '2026-10-20T10:00:00Z', status, opts.ulId ?? 'ul-paris-18', opts.requestRefund ?? 1,
                       `${id}/v1-a.pdf`, JSON.stringify(Array.from({ length: opts.revisions ?? 1 }, (_, i) => ({ step: i + 1 })))],
            });
        }

        const validate = (id: string, body: Record<string, unknown> = { action: 'validate', validatorSignature: SIG }) =>
            updateReport(makePatchRequest(body), { params: Promise.resolve({ id }) });

        const row = async (id: string) =>
            (await db.execute({ sql: 'SELECT * FROM "ExpenseReport" WHERE id = ?', args: [id] })).rows[0];

        const notifiedUsers = async () =>
            (await db.execute('SELECT userId, title FROM "Notification"')).rows.map(r => r.userId as string);

        it('RESPO valide : signature dans le champ RESPO, statut valide_respo, push au président seul (D3)', async () => {
            await seedV2('exp-a', 'soumis');
            mockedAuth.mockResolvedValue(respoSession as never);

            const res = await validate('exp-a');
            expect(res.status).toBe(200);
            expect((await res.json()).status).toBe('valide_respo');

            const r = await row('exp-a');
            expect(r.status).toBe('valide_respo');
            expect(r.respoValidatedBy).toBe('user-respo');
            expect(r.respoValidatedAt).toBeTruthy();
            expect(r.respoSignature).toContain('abc123');
            expect(r.validatedBy).toBeNull();
            const revisions = JSON.parse(r.signatureRevisions as string);
            expect(revisions.at(-1)).toMatchObject({ step: 2, role: 'Responsable d\'activité', signerId: 'user-respo' });

            const notified = await notifiedUsers();
            expect(notified).toContain('user-president');
            expect(notified).not.toContain('user-respo2');
            expect(notified).not.toContain('user-tresorier');
        });

        it('président finalise une note validée par le RESPO : révision président, push au trésorier', async () => {
            await seedV2('exp-b', 'valide_respo', { revisions: 2 });
            mockedAuth.mockResolvedValue(presidentSession as never);

            const res = await validate('exp-b');
            expect(res.status).toBe(200);

            const r = await row('exp-b');
            expect(r.status).toBe('en_attente_paiement');
            expect(r.validatedBy).toBe('user-president');
            const revisions = JSON.parse(r.signatureRevisions as string);
            expect(revisions).toHaveLength(3);
            expect(revisions.at(-1)).toMatchObject({ step: 4, role: 'Président', signerId: 'user-president' });

            const { sealPresident } = await import('@/lib/expenses/sealing');
            expect(vi.mocked(sealPresident)).toHaveBeenLastCalledWith('exp-b', expect.objectContaining({ id: 'user-president' }));
            expect(await notifiedUsers()).toContain('user-tresorier');
        });

        it('président finalise sans remboursement : statut traité, aucun push au trésorier', async () => {
            await seedV2('exp-b2', 'valide_respo', { revisions: 2, requestRefund: 0 });
            mockedAuth.mockResolvedValue(presidentSession as never);

            expect((await validate('exp-b2')).status).toBe(200);
            expect((await row('exp-b2')).status).toBe('traité');
            expect(await notifiedUsers()).not.toContain('user-tresorier');
        });

        it('président à la place du RESPO : deux révisions du même signataire, deux étapes horodatées', async () => {
            await seedV2('exp-c', 'soumis');
            mockedAuth.mockResolvedValue(presidentSession as never);

            const res = await validate('exp-c');
            expect(res.status).toBe(200);

            const r = await row('exp-c');
            expect(r.status).toBe('en_attente_paiement');
            expect(r.respoValidatedBy).toBe('user-president');
            expect(r.respoValidatedAt).toBeTruthy();
            expect(r.validatedBy).toBe('user-president');
            expect(r.validatedAt).toBeTruthy();

            const revisions = JSON.parse(r.signatureRevisions as string);
            expect(revisions.slice(1).map((v: { step: number }) => v.step)).toEqual([2, 4]);
            expect(revisions.slice(1).every((v: { signerId: string }) => v.signerId === 'user-president')).toBe(true);
            // Une seule écriture R2 : le dernier buffer, qui contient le précédent.
            expect(r.r2Key).toBe('exp-c/v4-testatt.pdf');

            // La révision président est posée sur le buffer RESPO, en mémoire.
            const { sealPresident } = await import('@/lib/expenses/sealing');
            expect(vi.mocked(sealPresident)).toHaveBeenLastCalledWith(
                'exp-c', expect.anything(), expect.objectContaining({ after: expect.objectContaining({ key: 'exp-c/v2-testatt.pdf' }) }));
        });

        it('le SUPER_ADMIN valide les deux étapes d\'un coup, quelle que soit son UL active', async () => {
            await seedUser({ id: 'user-sa', email: 'sa@test.com', name: 'Super Admin' });
            await seedV2('exp-sa', 'soumis');
            mockedAuth.mockResolvedValue({ user: { id: 'user-sa', email: 'sa@test.com', roles: ['SUPER_ADMIN', 'RESPO'], ulId: 'ul-paris-17' } } as never);

            expect((await validate('exp-sa')).status).toBe(200);
            expect((await row('exp-sa')).status).toBe('en_attente_paiement');
        });

        it('403 quand un RESPO agit à l\'étape président', async () => {
            await seedV2('exp-d', 'valide_respo', { revisions: 2 });
            mockedAuth.mockResolvedValue(respoSession as never);

            expect((await validate('exp-d')).status).toBe(403);
            expect((await validate('exp-d', { action: 'reject', rejectionComment: 'Non', validatorSignature: SIG })).status).toBe(403);
            expect((await row('exp-d')).status).toBe('valide_respo');
        });

        it('RESPO refuse : refus signé dans le champ RESPO, statut refusé', async () => {
            await seedV2('exp-e', 'soumis');
            mockedAuth.mockResolvedValue(respoSession as never);

            const res = await validate('exp-e', { action: 'reject', rejectionComment: 'Justificatif manquant', validatorSignature: SIG });
            expect(res.status).toBe(200);

            const r = await row('exp-e');
            expect(r.status).toBe('refusé');
            expect(r.rejectedBy).toBe('user-respo');
            expect(r.respoSignature).toBeTruthy();
            expect(JSON.parse(r.signatureRevisions as string).at(-1)).toMatchObject({ step: 2 });
            const { sealStep2 } = await import('@/lib/expenses/sealing');
            expect(vi.mocked(sealStep2)).toHaveBeenLastCalledWith('exp-e', expect.anything(), { rejected: true, stage: 'respo' });
        });

        it('RESPO refuse : 400 sans commentaire ou sans signature', async () => {
            await seedV2('exp-f', 'soumis');
            mockedAuth.mockResolvedValue(respoSession as never);

            expect((await validate('exp-f', { action: 'reject', rejectionComment: '  ', validatorSignature: SIG })).status).toBe(400);
            expect((await validate('exp-f', { action: 'reject', rejectionComment: 'Non conforme' })).status).toBe(400);
            expect((await row('exp-f')).status).toBe('soumis');
        });

        it('le refus du président à son étape se signe dans son champ, SANS tampon', async () => {
            await seedV2('exp-g', 'valide_respo', { revisions: 2 });
            mockedAuth.mockResolvedValue(presidentSession as never);

            const res = await validate('exp-g', { action: 'reject', rejectionComment: 'Hors budget', validatorSignature: SIG });
            expect(res.status).toBe(200);
            expect((await row('exp-g')).status).toBe('refusé');

            const { sealPresident } = await import('@/lib/expenses/sealing');
            expect(vi.mocked(sealPresident)).toHaveBeenLastCalledWith('exp-g', expect.anything(), { rejected: true });
        });

        it('NDF héritée (v1) : le président valide en une étape, le RESPO n\'a aucune action', async () => {
            await db.execute({
                sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, imputation, total, items, ulId, requestRefund, r2Key, signatureRevisions)
                      VALUES ('exp-v1', 'user-standard', '2026-10-01T10:00:00Z', 'soumis', 'DLUS', 10, '[]', 'ul-paris-18', 1, 'exp-v1/v1-a.pdf', '[{}]')`,
                args: [],
            });

            mockedAuth.mockResolvedValue(respoSession as never);
            expect((await validate('exp-v1')).status).toBe(403);
            expect((await validate('exp-v1', { action: 'reject', rejectionComment: 'Non', validatorSignature: SIG })).status).toBe(403);

            mockedAuth.mockResolvedValue(presidentSession as never);
            const res = await validate('exp-v1');
            expect(res.status).toBe(200);
            expect((await row('exp-v1')).status).toBe('en_attente_paiement');

            const { sealStep2, sealPresident } = await import('@/lib/expenses/sealing');
            expect(vi.mocked(sealStep2)).toHaveBeenLastCalledWith('exp-v1', expect.anything(), { stage: 'legacy' });
            expect(vi.mocked(sealPresident)).not.toHaveBeenCalledWith('exp-v1', expect.anything(), expect.anything());
        });

        it('409 quand une validation concurrente a fait avancer la note entre-temps', async () => {
            await seedV2('exp-h', 'soumis');
            mockedAuth.mockResolvedValue(respoSession as never);

            // Simule l'autre appel : il valide la note pendant que celui-ci scelle.
            const { sealStep2 } = await import('@/lib/expenses/sealing');
            const realImpl = vi.mocked(sealStep2).getMockImplementation()!;
            vi.mocked(sealStep2).mockImplementationOnce(async (...args) => {
                await db.execute(`UPDATE "ExpenseReport" SET status = 'valide_respo' WHERE id = 'exp-h'`);
                return realImpl(...args);
            });

            const res = await validate('exp-h');
            expect(res.status).toBe(409);
            expect((await res.json()).error).toContain('changé d\'état');
        });

        it('auto-validation interdite (D2) : un RESPO ne valide pas sa propre note, un autre RESPO ou le président si', async () => {
            await seedV2('exp-i', 'soumis', { userId: 'user-respo' });
            await seedV2('exp-j', 'soumis', { userId: 'user-respo' });

            mockedAuth.mockResolvedValue(respoSession as never);
            expect((await validate('exp-i')).status).toBe(403);
            expect((await validate('exp-i', { action: 'reject', rejectionComment: 'Non', validatorSignature: SIG })).status).toBe(403);

            mockedAuth.mockResolvedValue({ user: { id: 'user-respo2', email: 'r2@test.com', roles: ['RESPO'], ulId: 'ul-paris-18' } } as never);
            expect((await validate('exp-i')).status).toBe(200);

            mockedAuth.mockResolvedValue(presidentSession as never);
            expect((await validate('exp-j')).status).toBe(200);
        });

        it('une note sans UL relève de l\'UL par défaut : le RESPO de cette UL la valide', async () => {
            await seedV2('exp-noul', 'soumis');
            // ulId est NOT NULL dans le schéma : on simule une valeur vide héritée.
            await db.execute(`UPDATE "ExpenseReport" SET ulId = '' WHERE id = 'exp-noul'`);
            mockedAuth.mockResolvedValue(respoSession as never);
            expect((await validate('exp-noul')).status).toBe(200);
        });

        it('liste : un RESPO aussi trésorier garde la file des notes à payer', async () => {
            await seedV2('exp-t1', 'soumis');
            await seedV2('exp-t2', 'en_attente_paiement', { revisions: 3 });
            await seedV2('exp-t3', 'traité', { revisions: 4 });
            mockedAuth.mockResolvedValue({ user: { ...respoSession.user, roles: ['RESPO', 'TRESORIER'] } } as never);
            const ids = (await (await getList(new Request('http://localhost/api/expenses?scope=ul'))).json()).map((r: { id: string }) => r.id);
            expect(ids.sort()).toEqual(['exp-t1', 'exp-t2']);
        });

        it('403 pour un RESPO d\'une autre UL — les rôles valent pour l\'UL active', async () => {
            await seedV2('exp-k', 'soumis');
            mockedAuth.mockResolvedValue({ user: { ...respoSession.user, ulId: 'ul-paris-17' } } as never);
            expect((await validate('exp-k')).status).toBe(403);
        });

        it('liste : le RESPO voit les notes soumises et validées par le responsable de son UL', async () => {
            await seedV2('exp-l1', 'soumis');
            await seedV2('exp-l2', 'valide_respo', { revisions: 2 });
            await seedV2('exp-l3', 'en_attente_paiement', { revisions: 3 });
            await seedV2('exp-l4', 'soumis', { ulId: 'ul-paris-17' });
            await db.execute(`INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, total, items, ulId) VALUES ('exp-l5', 'user-standard', '2026-10-20T10:00:00Z', 'brouillon', 1, '[]', 'ul-paris-18')`);

            mockedAuth.mockResolvedValue(respoSession as never);
            const ids = (await (await getList(new Request('http://localhost/api/expenses?scope=ul'))).json()).map((r: { id: string }) => r.id);
            expect(ids.sort()).toEqual(['exp-l1', 'exp-l2']);

            const all = (await (await getList(new Request('http://localhost/api/expenses?scope=ul&includeProcessed=true'))).json()).map((r: { id: string }) => r.id);
            expect(all.sort()).toEqual(['exp-l1', 'exp-l2', 'exp-l3']);

            mockedAuth.mockResolvedValue(presidentSession as never);
            const pres = await (await getList(new Request('http://localhost/api/expenses?scope=ul'))).json();
            const l2 = pres.find((r: { id: string }) => r.id === 'exp-l2');
            expect(l2).toMatchObject({ status: 'valide_respo', workflowVersion: 2 });
        });

        it('détail : le RESPO lit une note soumise de son UL, pas celle d\'une autre UL', async () => {
            await seedV2('exp-m1', 'soumis');
            await seedV2('exp-m2', 'soumis', { ulId: 'ul-paris-17' });
            mockedAuth.mockResolvedValue(respoSession as never);

            const ok = await getReport(new Request('http://localhost/api/expenses/exp-m1'), { params: Promise.resolve({ id: 'exp-m1' }) });
            expect(ok.status).toBe(200);
            expect((await ok.json()).workflowVersion).toBe(2);

            const ko = await getReport(new Request('http://localhost/api/expenses/exp-m2'), { params: Promise.resolve({ id: 'exp-m2' }) });
            expect(ko.status).toBe(403);
        });

        it('la soumission écrit workflowVersion 2 et notifie les RESPO et le président (D3)', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-standard', email: 'secouriste@test.com', name: 'Standard User', roles: ['SECOURISTE'], ulId: 'ul-paris-18' } } as never);
            const res = await createReport(makePostRequest({
                status: 'soumis', userSignature: SIG, imputation: 'DLUS', requestRefund: true, noReceiptDeclaration: false,
                items: [{ label: 'Fournitures', amount: 12, budgetId: BUDGET_18 }],
            }));
            expect(res.status).toBe(201);
            const { id } = await res.json();
            expect(Number((await row(id)).workflowVersion)).toBe(2);

            const notified = await notifiedUsers();
            expect(notified).toEqual(expect.arrayContaining(['user-respo', 'user-respo2', 'user-president']));
        });
    });

    describe('Création interdite au président', () => {
        const body = {
            status: 'soumis', userSignature: SIG, imputation: 'DLUS', requestRefund: true, noReceiptDeclaration: false,
            items: [{ label: 'Péage', amount: 10, budgetId: BUDGET_18 }],
        };

        it('403 quand un PRESIDENT de l\'UL active crée une note', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-president', email: 'president@test.com', roles: ['PRESIDENT', 'CHVL'], ulId: 'ul-paris-18' } } as never);
            const res = await createReport(makePostRequest(body));
            expect(res.status).toBe(403);
            const count = await db.execute(`SELECT COUNT(*) AS n FROM "ExpenseReport" WHERE userId = 'user-president'`);
            expect(Number(count.rows[0].n)).toBe(0);
        });

        it('403 quand un PRESIDENT soumet un ancien brouillon', async () => {
            await db.execute(`INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, total, items, ulId) VALUES ('exp-pres-draft', 'user-president', '2026-10-20T10:00:00Z', 'brouillon', 10, '[]', 'ul-paris-18')`);
            mockedAuth.mockResolvedValue({ user: { id: 'user-president', email: 'president@test.com', roles: ['PRESIDENT'], ulId: 'ul-paris-18' } } as never);
            const res = await updateReport(
                makePatchRequest({ action: 'submit', missionName: 'M', missionDate: '2026-10-01', userSignature: SIG, items: [{ label: 'Péage', amount: 10, budgetId: BUDGET_18 }] }),
                { params: Promise.resolve({ id: 'exp-pres-draft' }) },
            );
            expect(res.status).toBe(403);
        });

        it('le SUPER_ADMIN, même président, n\'est jamais bloqué', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-president', email: 'president@test.com', roles: ['SUPER_ADMIN', 'PRESIDENT'], ulId: 'ul-paris-18' } } as never);
            const res = await createReport(makePostRequest(body));
            expect(res.status).toBe(201);
        });
    });
});
