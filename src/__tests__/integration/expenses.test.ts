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
    const fakeSeal = (step: 1 | 2 | 3, role: string) => async (reportId: string, signer: { id: string; name: string }) => ({
        buffer: Buffer.from(`%PDF-1.3 scelle-${step}`),
        key: `${reportId}/v${step}-testatt.pdf`,
        revision: {
            step, signerId: signer.id, signerName: signer.name, role,
            signedAt: new Date().toISOString(), businessDate: null,
            r2Key: `${reportId}/v${step}-testatt.pdf`,
        },
    });
    return {
        sealStep1: vi.fn(fakeSeal(1, 'Demandeur')),
        sealStep2: vi.fn(fakeSeal(2, 'Valideur')),
        sealStep3: vi.fn(fakeSeal(3, 'Payeur')),
        // Le vrai résolveur lit R2 ; en test, un justificatif est un simple passe-plat.
        resolvePendingReceipts: vi.fn(async (keys: string[]) =>
            keys.map(key => ({ buffer: Buffer.from('%PDF-1.3 justificatif'), mime: key.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg' }))),
        appendRevision: (existing: unknown, rev: unknown) => {
            const arr = typeof existing === 'string' && existing ? JSON.parse(existing) : [];
            return JSON.stringify([...arr, rev]);
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
            mockedAuth.mockResolvedValue(null);
            const req = makePostRequest({
                status: 'soumis',
                userSignature: SIG,
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

        it('retourne 400 si le nom de la mission est absent', async () => {
            mockedAuth.mockResolvedValue({ user: { id: 'user-standard', email: 'secouriste@test.com', roles: ['SECOURISTE'], ulId: 'ul-paris-18' } } as never);
            const req = makePostRequest({
                missionName: '   ',
                status: 'soumis',
                userSignature: SIG,
                imputation: 'DLUS',
                requestRefund: true,
                noReceiptDeclaration: false,
                items: [{ label: 'Essence', amount: 30 }]
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
                items: [{ label: 'Essence', amount: 30 }]
            }));
            expect(missing.status).toBe(400);

            const malformed = await createReport(makePostRequest({
                missionDate: '12/03/2026',
                status: 'soumis',
                userSignature: SIG,
                imputation: 'DLUS',
                requestRefund: true,
                noReceiptDeclaration: false,
                items: [{ label: 'Essence', amount: 30 }]
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
                items: [{ label: 'Repas', amount: 12 }]
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
                items: [{ label: 'Repas', amount: 20 }],
            });
            const res = await updateReport(req, { params: Promise.resolve({ id: 'exp-draft' }) });
            expect(res.status).toBe(400);
        });

        it('retourne 400 lors de la soumission d\'un brouillon sans date de mission', async () => {
            const req = makePatchRequest({
                action: 'submit',
                missionName: 'Maraude Nord',
                items: [{ label: 'Repas', amount: 20 }],
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
                items: [{ label: 'Repas', amount: 20 }],
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
                items: [{ label: 'Repas', amount: 20 }],
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
                items: [{ label: 'Repas', amount: 20 }],
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
                items: [{ label: 'Repas', amount: 20 }],
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
                items: [{ label: 'Repas', amount: 20 }],
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
                items: [{ label: 'Repas', amount: 20 }],
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
                items: Array.from({ length: 10 }, (_, i) => ({ label: `D${i}`, amount: 1 })),
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
                items: [{ label: 'Repas', amount: 20 }],
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
                    items: [{ label: 'Péage', amount: 10 }],
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
                    items: Array.from({ length: 10 }, (_, i) => ({ label: `D${i}`, amount: 1 })),
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
                    items: Array.from({ length: 9 }, (_, i) => ({ label: `D${i}`, amount: 1 })),
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
                    items: [{ label: 'Péage', amount: 10 }],
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
                    items: [{ label: 'Péage', amount: 10 }],
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
                args: ['exp-v', 'user-president', new Date().toISOString(), 'soumis', 'DLUS', 10, '[]', 'ul-paris-18', 'exp-v/v1-a.pdf', '[{}]'] });
            const res = await updateReport(makePatchRequest({ action: 'validate' }), { params: Promise.resolve({ id: 'exp-v' }) });
            expect(res.status).toBe(400);
        });

        it('refuse le paiement sans signature du payeur (400)', async () => {
            await db.execute({ sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, imputation, total, items, ulId, r2Key, signatureRevisions) VALUES (?,?,?,?,?,?,?,?,?,?)`,
                args: ['exp-p', 'user-president', new Date().toISOString(), 'en_attente_paiement', 'DLUS', 10, '[]', 'ul-paris-18', 'exp-p/v2-a.pdf', '[{},{}]'] });
            const res = await updateReport(makePatchRequest({ action: 'pay' }), { params: Promise.resolve({ id: 'exp-p' }) });
            expect(res.status).toBe(400);
        });

        it('persiste la signature du valideur lors d\'un REFUS (décision D5)', async () => {
            await db.execute({ sql: `INSERT INTO "ExpenseReport" (id, userId, submittedAt, status, imputation, total, items, ulId, r2Key, signatureRevisions) VALUES (?,?,?,?,?,?,?,?,?,?)`,
                args: ['exp-r', 'user-president', new Date().toISOString(), 'soumis', 'DLUS', 10, '[]', 'ul-paris-18', 'exp-r/v1-a.pdf', '[{}]'] });
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
                args: ['exp-c', 'user-president', new Date().toISOString(), 'refusé', 'DLUS', 10, '[]', 'ul-paris-18', 'exp-c/v2-a.pdf'] });

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
                args: ['exp-err', 'user-president', new Date().toISOString(), 'soumis', 'DLUS', 10, '[]', 'ul-paris-18', 'exp-err/v1-a.pdf', '[{}]'],
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
});
