import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as driveUploadPOST } from '@/app/api/drive/upload/route';
import { POST as expensesUploadPOST } from '@/app/api/expenses/upload/route';

vi.mock('@/auth', () => ({
    auth: vi.fn().mockResolvedValue({
        user: { name: 'Test User', email: 'test@example.com' },
    }),
}));

function createMockRequest(formData: FormData): Request {
    return {
        formData: async () => formData,
    } as unknown as Request;
}

describe('Drive Upload API — validation de la taille des fichiers', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('retourne une erreur 400 si un fichier dépasse 10 Mo', async () => {
        const bigFile = new File(['x'.repeat(100)], 'big_photo.jpg', { type: 'image/jpeg' });
        Object.defineProperty(bigFile, 'size', { value: 11 * 1024 * 1024, configurable: true });

        const formData = new FormData();
        formData.append('vehicleName', 'VSAV 01');
        formData.append('date', '2026-08-10');
        formData.append('stage', 'emprunt');
        formData.append('files', bigFile);

        const request = createMockRequest(formData);

        const res = await driveUploadPOST(request);
        const data = await res.json();

        expect(res.status).toBe(400);
        expect(data.error).toMatch(/dépasse la taille maximale autorisée de 10 Mo/i);
    });

    it('retourne une erreur 400 si la taille totale des fichiers dépasse 150 Mo', async () => {
        const file1 = new File(['a'.repeat(100)], 'photo1.jpg', { type: 'image/jpeg' });
        const file2 = new File(['b'.repeat(100)], 'photo2.jpg', { type: 'image/jpeg' });
        Object.defineProperty(file1, 'size', { value: 100 * 1024 * 1024, configurable: true });
        Object.defineProperty(file2, 'size', { value: 60 * 1024 * 1024, configurable: true });

        const formData = new FormData();
        formData.append('missionName', 'Mission Secours');
        formData.append('date', '2026-08-10');
        formData.append('files', file1);
        formData.append('files', file2);

        const request = createMockRequest(formData);

        const res = await driveUploadPOST(request);
        const data = await res.json();

        expect(res.status).toBe(400);
        expect(data.error).toMatch(/dépasse la limite maximale de 150 Mo/i);
    });
});

describe('Expenses Upload API — validation de la taille des fichiers', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('retourne une erreur 400 si un justificatif dépasse 10 Mo', async () => {
        const bigReceipt = new File(['x'.repeat(100)], 'facture.pdf', { type: 'application/pdf' });
        Object.defineProperty(bigReceipt, 'size', { value: 12 * 1024 * 1024, configurable: true });

        const formData = new FormData();
        formData.append('files', bigReceipt);

        const request = createMockRequest(formData);

        const res = await expensesUploadPOST(request);
        const data = await res.json();

        expect(res.status).toBe(400);
        expect(data.error).toMatch(/dépasse la taille maximale autorisée de 10 Mo/i);
    });

    it('retourne une erreur 400 si le total des justificatifs dépasse 150 Mo', async () => {
        const file1 = new File(['a'.repeat(100)], 'receipt1.pdf', { type: 'application/pdf' });
        const file2 = new File(['b'.repeat(100)], 'receipt2.pdf', { type: 'application/pdf' });
        Object.defineProperty(file1, 'size', { value: 100 * 1024 * 1024, configurable: true });
        Object.defineProperty(file2, 'size', { value: 60 * 1024 * 1024, configurable: true });

        const formData = new FormData();
        formData.append('files', file1);
        formData.append('files', file2);

        const request = createMockRequest(formData);

        const res = await expensesUploadPOST(request);
        const data = await res.json();

        expect(res.status).toBe(400);
        expect(data.error).toMatch(/dépasse la limite maximale de 150 Mo/i);
    });
});
