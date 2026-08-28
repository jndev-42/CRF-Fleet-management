import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as driveUploadPOST } from '@/app/api/drive/upload/route';
import { POST as expensesUploadPOST } from '@/app/api/expenses/upload/route';
import { auth } from '@/auth';

vi.mock('@/auth', () => ({
    auth: vi.fn().mockResolvedValue({
        user: { name: 'Test User', email: 'test@example.com' },
    }),
}));

const mockedAuth = vi.mocked(auth);

function createMockRequest(formData: FormData): Request {
    return {
        formData: async () => formData,
    } as unknown as Request;
}

describe('Drive Upload API — validation de la taille des fichiers', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        mockedAuth.mockResolvedValue({
            user: { name: 'Test User', email: 'test@example.com' },
        } as never);
    });

    it('retourne 401 sans session', async () => {
        mockedAuth.mockResolvedValueOnce(null as never);

        const request = createMockRequest(new FormData());
        const res = await driveUploadPOST(request);

        expect(res.status).toBe(401);
    });

    it('retourne une erreur 400 si un fichier dépasse 4.2 Mo', async () => {
        const bigFile = new File(['x'.repeat(100)], 'big_photo.jpg', { type: 'image/jpeg' });
        Object.defineProperty(bigFile, 'size', { value: 5 * 1024 * 1024, configurable: true });

        const formData = new FormData();
        formData.append('vehicleName', 'VSAV 01');
        formData.append('date', '2026-08-10');
        formData.append('stage', 'emprunt');
        formData.append('files', bigFile);

        const request = createMockRequest(formData);

        const res = await driveUploadPOST(request);
        const data = await res.json();

        expect(res.status).toBe(400);
        expect(data.error).toMatch(/dépasse la limite Serverless de 4.2 Mo/i);
    });

    it('retourne une erreur 400 si la taille totale des fichiers dépasse 4.2 Mo', async () => {
        const file1 = new File(['a'.repeat(100)], 'photo1.jpg', { type: 'image/jpeg' });
        const file2 = new File(['b'.repeat(100)], 'photo2.jpg', { type: 'image/jpeg' });
        Object.defineProperty(file1, 'size', { value: 3 * 1024 * 1024, configurable: true });
        Object.defineProperty(file2, 'size', { value: 2 * 1024 * 1024, configurable: true });

        const formData = new FormData();
        formData.append('missionName', 'Mission Secours');
        formData.append('date', '2026-08-10');
        formData.append('files', file1);
        formData.append('files', file2);

        const request = createMockRequest(formData);

        const res = await driveUploadPOST(request);
        const data = await res.json();

        expect(res.status).toBe(400);
        expect(data.error).toMatch(/dépasse la limite Serverless de 4.2 Mo/i);
    });
});

describe('Expenses Upload API — validation de la taille des fichiers', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        mockedAuth.mockResolvedValue({
            user: { name: 'Test User', email: 'test@example.com' },
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
            user: { name: 'Test User', email: 'test@example.com' },
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
        vi.doMock('@/lib/r2', () => ({
            buildExpenseStagingKey: (stagingId: string, name: string) => `expenses-staging/${stagingId}/${name}`,
            putObject,
        }));
        vi.resetModules();
        const { POST } = await import('@/app/api/expenses/upload/route');

        const image = new File(['x'.repeat(10)], 'ticket.jpg', { type: 'image/jpeg' });
        const pdf = new File(['y'.repeat(10)], 'facture.pdf', { type: 'application/pdf' });
        const formData = new FormData();
        formData.append('files', image);
        formData.append('files', pdf);
        formData.append('stagingId', 'staging-existant');

        const res = await POST(createMockRequest(formData));
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.stagingId).toBe('staging-existant');
        expect(data.keys).toEqual([
            'expenses-staging/staging-existant/ticket.jpg',
            'expenses-staging/staging-existant/facture.pdf',
        ]);
        expect(putObject).toHaveBeenCalledWith('expenses-staging/staging-existant/ticket.jpg', Buffer.from('jpeg-compresse'), 'image/jpeg');
        expect(putObject).toHaveBeenCalledWith('expenses-staging/staging-existant/facture.pdf', expect.any(Buffer), 'application/pdf');

        vi.doUnmock('@/lib/expenses/attachments');
        vi.doUnmock('@/lib/r2');
    });

    it('génère un nouveau stagingId quand aucun n\'est fourni', async () => {
        vi.doMock('@/lib/expenses/attachments', () => ({
            compressJustificatifImage: vi.fn(async () => Buffer.from('jpeg-compresse')),
        }));
        vi.doMock('@/lib/r2', () => ({
            buildExpenseStagingKey: (stagingId: string, name: string) => `expenses-staging/${stagingId}/${name}`,
            putObject: vi.fn(async () => undefined),
        }));
        vi.resetModules();
        const { POST } = await import('@/app/api/expenses/upload/route');

        const formData = new FormData();
        formData.append('files', new File(['x'], 'ticket.jpg', { type: 'image/jpeg' }));

        const res = await POST(createMockRequest(formData));
        const data = await res.json();

        expect(data.stagingId).toBeTruthy();
        expect(data.keys[0]).toContain(`expenses-staging/${data.stagingId}/`);

        vi.doUnmock('@/lib/expenses/attachments');
        vi.doUnmock('@/lib/r2');
    });

    it('retourne 500 si le dépôt sur R2 échoue', async () => {
        vi.doMock('@/lib/expenses/attachments', () => ({
            compressJustificatifImage: vi.fn(async () => Buffer.from('jpeg-compresse')),
        }));
        vi.doMock('@/lib/r2', () => ({
            buildExpenseStagingKey: (stagingId: string, name: string) => `expenses-staging/${stagingId}/${name}`,
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
    });
});
