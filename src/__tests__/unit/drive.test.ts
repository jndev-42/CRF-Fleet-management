import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockDelete = vi.fn();

vi.mock('googleapis', () => ({
    google: {
        auth: {
            OAuth2: vi.fn().mockImplementation(function (this: { setCredentials: () => void }) {
                this.setCredentials = vi.fn();
            }),
        },
        drive: vi.fn().mockImplementation(() => ({ files: { delete: mockDelete } })),
    },
}));

describe('deleteDriveFolder', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        vi.resetModules();
        mockDelete.mockReset();
        process.env.GOOGLE_CLIENT_ID = 'client-id';
        process.env.GOOGLE_CLIENT_SECRET = 'client-secret';
        process.env.GOOGLE_DRIVE_REFRESH_TOKEN = 'refresh-token';
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it('retourne false pour un folderId vide, sans appeler l\'API', async () => {
        const { deleteDriveFolder } = await import('@/lib/drive');
        const result = await deleteDriveFolder('');
        expect(result).toBe(false);
        expect(mockDelete).not.toHaveBeenCalled();
    });

    it('supprime le dossier et retourne true (happy path)', async () => {
        mockDelete.mockResolvedValue({});
        const { deleteDriveFolder } = await import('@/lib/drive');
        const result = await deleteDriveFolder('folder-1');
        expect(result).toBe(true);
        expect(mockDelete).toHaveBeenCalledWith({ fileId: 'folder-1' });
    });

    it('traite un 404 comme un succès (déjà supprimé)', async () => {
        mockDelete.mockRejectedValue({ code: 404, message: 'Not found' });
        const { deleteDriveFolder } = await import('@/lib/drive');
        const result = await deleteDriveFolder('folder-1');
        expect(result).toBe(true);
    });

    it('retourne false pour une autre erreur API', async () => {
        mockDelete.mockRejectedValue({ code: 500, message: 'Server error' });
        const { deleteDriveFolder } = await import('@/lib/drive');
        const result = await deleteDriveFolder('folder-1');
        expect(result).toBe(false);
    });
});
