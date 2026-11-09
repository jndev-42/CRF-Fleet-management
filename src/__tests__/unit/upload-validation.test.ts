import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as expensesUploadPOST } from '@/app/api/expenses/upload/route';
import { auth } from '@/auth';
import { issueStagingId, isStagingIdSignedFor } from '@/lib/expenses/receipt-keys';

vi.mock('@/auth', () => ({
    auth: vi.fn().mockResolvedValue({
        user: { id: 'u1', name: 'Test User', email: 'test@example.com' },
    }),
}));

const mockedAuth = vi.mocked(auth);

/** Segment UL résolu par `ulSegmentOf` (base hors périmètre d'un test unitaire). */
const ulSegmentOf = vi.fn(async (ulId: string) => (ulId === 'ul-paris-17' ? 'paris-17' : 'paris-18'));
// Identifiants de dépôt signés avec AUTH_SECRET (lu à l'appel).
process.env.AUTH_SECRET ||= 'secret-de-test-upload';
const SID = issueStagingId('u1');
const SID_RE = '[0-9a-f]{24}-[0-9a-f]{32}';
const KEY_RE = (sid: string, name: string, ul = 'paris-18') => new RegExp(`^expenses-staging/${ul}/${sid}/[0-9a-f-]{36}-${name.replace('.', '\\.')}$`);

/** Vraies fonctions pures de clé de dépôt (R2 lui-même reste mocké). */
async function stagingKeyFns() {
    const actual = await vi.importActual<typeof import('@/lib/r2')>('@/lib/r2');
    return { buildExpenseStagingKey: actual.buildExpenseStagingKey };
}

function createMockRequest(formData: FormData): Request {
    return {
        formData: async () => formData,
    } as unknown as Request;
}

describe('Expenses Upload API — validation de la taille des fichiers', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        mockedAuth.mockResolvedValue({
            user: { id: 'u1', name: 'Test User', email: 'test@example.com' },
        } as never);
    });

    it('retourne 401 sans session', async () => {
        mockedAuth.mockResolvedValueOnce(null as never);

        const request = createMockRequest(new FormData());
        const res = await expensesUploadPOST(request);

        expect(res.status).toBe(401);
    });

    it('retourne une erreur 400 si un justificatif dépasse 4.2 Mo', async () => {
        const bigReceipt = new File(['x'.repeat(100)], 'facture.pdf', { type: 'application/pdf' });
        Object.defineProperty(bigReceipt, 'size', { value: 5 * 1024 * 1024, configurable: true });

        const formData = new FormData();
        formData.append('files', bigReceipt);

        const request = createMockRequest(formData);

        const res = await expensesUploadPOST(request);
        const data = await res.json();

        expect(res.status).toBe(400);
        expect(data.error).toMatch(/dépasse la limite Serverless de 4.2 Mo/i);
    });

    it('retourne une erreur 400 si le total des justificatifs dépasse 4.2 Mo', async () => {
        const file1 = new File(['a'.repeat(100)], 'receipt1.pdf', { type: 'application/pdf' });
        const file2 = new File(['b'.repeat(100)], 'receipt2.pdf', { type: 'application/pdf' });
        Object.defineProperty(file1, 'size', { value: 3 * 1024 * 1024, configurable: true });
        Object.defineProperty(file2, 'size', { value: 2 * 1024 * 1024, configurable: true });

        const formData = new FormData();
        formData.append('files', file1);
        formData.append('files', file2);

        const request = createMockRequest(formData);

        const res = await expensesUploadPOST(request);
        const data = await res.json();

        expect(res.status).toBe(400);
        expect(data.error).toMatch(/dépasse la limite Serverless de 4.2 Mo/i);
    });
});

describe('Expenses Upload API — dépôt effectif', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        mockedAuth.mockResolvedValue({
            user: { id: 'u1', name: 'Test User', email: 'test@example.com' },
        } as never);
    });

    it('sans fichier, répond succès avec une liste de clés vide', async () => {
        const request = createMockRequest(new FormData());
        const res = await expensesUploadPOST(request);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data).toEqual({ success: true, stagingId: null, keys: [] });
    });

    it('dépose une image compressée et un PDF tel quel, sous le même stagingId', async () => {
        vi.doMock('@/lib/expenses/attachments', () => ({
            compressJustificatifImage: vi.fn(async () => Buffer.from('jpeg-compresse')),
        }));
        const putObject = vi.fn(async () => undefined);
        vi.doMock('@/lib/media/server', () => ({ ulSegmentOf }));
        vi.doMock('@/lib/r2', async () => ({
            ...(await stagingKeyFns()),
            putObject,
        }));
        vi.resetModules();
        const { POST } = await import('@/app/api/expenses/upload/route');

        const image = new File(['x'.repeat(10)], 'ticket.jpg', { type: 'image/jpeg' });
        const pdf = new File(['y'.repeat(10)], 'facture.pdf', { type: 'application/pdf' });
        const formData = new FormData();
        formData.append('files', image);
        formData.append('files', pdf);
        formData.append('stagingId', SID);

        const res = await POST(createMockRequest(formData));
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.stagingId).toBe(SID);
        expect(data.keys).toHaveLength(2);
        expect(data.keys[0]).toMatch(KEY_RE(SID, 'ticket.jpg'));
        expect(data.keys[1]).toMatch(KEY_RE(SID, 'facture.pdf'));
        // Sans UL en session : même repli que POST /api/expenses.
        expect(ulSegmentOf).toHaveBeenCalledWith('ul-paris-18');
        expect(putObject).toHaveBeenCalledWith(data.keys[0], Buffer.from('jpeg-compresse'), 'image/jpeg');
        expect(putObject).toHaveBeenCalledWith(data.keys[1], expect.any(Buffer), 'application/pdf');

        vi.doUnmock('@/lib/expenses/attachments');
        vi.doUnmock('@/lib/r2');
        vi.doUnmock('@/lib/media/server');
    });

    it('génère un nouveau stagingId quand aucun n\'est fourni', async () => {
        vi.doMock('@/lib/expenses/attachments', () => ({
            compressJustificatifImage: vi.fn(async () => Buffer.from('jpeg-compresse')),
        }));
        vi.doMock('@/lib/media/server', () => ({ ulSegmentOf }));
        vi.doMock('@/lib/r2', async () => ({
            ...(await stagingKeyFns()),
            putObject: vi.fn(async () => undefined),
        }));
        vi.resetModules();
        const { POST } = await import('@/app/api/expenses/upload/route');

        const formData = new FormData();
        formData.append('files', new File(['x'], 'ticket.jpg', { type: 'image/jpeg' }));

        const res = await POST(createMockRequest(formData));
        const data = await res.json();

        expect(data.stagingId).toMatch(new RegExp(`^${SID_RE}$`));
        expect(isStagingIdSignedFor(data.stagingId, 'u1')).toBe(true);
        expect(data.keys[0]).toMatch(KEY_RE(data.stagingId, 'ticket.jpg'));

        vi.doUnmock('@/lib/expenses/attachments');
        vi.doUnmock('@/lib/r2');
        vi.doUnmock('@/lib/media/server');
    });

    it("range sous l'UL de la session et ignore un stagingId non signé pour le déposant", async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'u1', name: 'Test User', email: 'test@example.com', ulId: 'ul-paris-17' } } as never);
        vi.doMock('@/lib/expenses/attachments', () => ({
            compressJustificatifImage: vi.fn(async () => Buffer.from('jpeg-compresse')),
        }));
        vi.doMock('@/lib/media/server', () => ({ ulSegmentOf }));
        vi.doMock('@/lib/r2', async () => ({
            ...(await stagingKeyFns()),
            putObject: vi.fn(async () => undefined),
        }));
        vi.resetModules();
        const { POST } = await import('@/app/api/expenses/upload/route');

        const formData = new FormData();
        formData.append('files', new File(['x'], 'ticket.jpg', { type: 'image/jpeg' }));
        // Signé pour un autre utilisateur : ignoré comme un identifiant forgé.
        formData.append('stagingId', issueStagingId('u2'));

        const res = await POST(createMockRequest(formData));
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(isStagingIdSignedFor(data.stagingId, 'u1')).toBe(true);
        expect(data.keys[0]).toMatch(KEY_RE(data.stagingId, 'ticket.jpg', 'paris-17'));
        expect(ulSegmentOf).toHaveBeenCalledWith('ul-paris-17');

        vi.doUnmock('@/lib/expenses/attachments');
        vi.doUnmock('@/lib/r2');
        vi.doUnmock('@/lib/media/server');
    });

    it('retourne 500 si le dépôt sur R2 échoue', async () => {
        vi.doMock('@/lib/expenses/attachments', () => ({
            compressJustificatifImage: vi.fn(async () => Buffer.from('jpeg-compresse')),
        }));
        vi.doMock('@/lib/media/server', () => ({ ulSegmentOf }));
        vi.doMock('@/lib/r2', async () => ({
            ...(await stagingKeyFns()),
            putObject: vi.fn(async () => { throw new Error('R2 indisponible'); }),
        }));
        vi.resetModules();
        const { POST } = await import('@/app/api/expenses/upload/route');

        const formData = new FormData();
        formData.append('files', new File(['x'], 'ticket.jpg', { type: 'image/jpeg' }));

        const res = await POST(createMockRequest(formData));
        expect(res.status).toBe(500);
        expect((await res.json()).error).toMatch(/dépôt des justificatifs/i);

        vi.doUnmock('@/lib/expenses/attachments');
        vi.doUnmock('@/lib/r2');
        vi.doUnmock('@/lib/media/server');
    });
});
