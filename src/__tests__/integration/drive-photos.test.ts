/**
 * Tests d'intégration — GET /api/drive/photos et GET /api/drive/photos/[fileId].
 * Le client Google Drive réel n'est jamais exercé : on couvre les branches
 * auth/autorisation (résolues en DB par driveAuth.ts) et les branches "mock-"
 * utilisées en mode démo/preview, qui court-circuitent l'appel à Google Drive.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { GET as GET_PHOTOS } from '@/app/api/drive/photos/route';
import { GET as GET_FILE } from '@/app/api/drive/photos/[fileId]/route';
import { auth } from '@/auth';
import { db, seedVehicle, seedTrip, seedUser } from './setup';

const mockedAuth = vi.mocked(auth);

beforeEach(() => {
    vi.resetAllMocks();
});

describe('GET /api/drive/photos', () => {
    it('retourne 401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        const res = await GET_PHOTOS(new Request('http://localhost/api/drive/photos?folderId=abc'));
        expect(res.status).toBe(401);
    });

    it('retourne 400 sans folderId', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'] } } as never);
        const res = await GET_PHOTOS(new Request('http://localhost/api/drive/photos'));
        expect(res.status).toBe(400);
    });

    it('retourne 403 pour un dossier appartenant à une autre UL', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'], ulId: 'ul-lyon-3' } } as never);
        await seedVehicle({ id: 'VL001', name: 'VL186', ulId: 'ul-paris-18' });
        await seedUser({ id: 'user-1', email: 'driver@test.com' });
        await seedTrip({ id: 'trip-1', vehicleId: 'VL001', driverId: 'user-1' });
        await db.execute({ sql: `UPDATE "Trip" SET driveFolderId = ? WHERE id = ?`, args: ['folder-abc', 'trip-1'] });

        const res = await GET_PHOTOS(new Request('http://localhost/api/drive/photos?folderId=folder-abc'));
        expect(res.status).toBe(403);
    });

    it('retourne les photos mock en mode démo (flat) sans appeler Google Drive', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'] } } as never);
        const res = await GET_PHOTOS(new Request('http://localhost/api/drive/photos?folderId=mock-folder-1&flat=true'));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.photos.length).toBeGreaterThan(0);
    });
});

describe('GET /api/drive/photos/[fileId]', () => {
    it('retourne 401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        const res = await GET_FILE(new Request('http://localhost/api/drive/photos/abc'), { params: Promise.resolve({ fileId: 'abc' }) });
        expect(res.status).toBe(401);
    });

    it('retourne un PNG mock en mode démo sans appeler Google Drive', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'] } } as never);
        const res = await GET_FILE(new Request('http://localhost/api/drive/photos/mock-photo-1'), { params: Promise.resolve({ fileId: 'mock-photo-1' }) });
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('image/png');
    });

    it('retourne un PDF mock si le fileId mock contient "pdf"', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'] } } as never);
        const res = await GET_FILE(new Request('http://localhost/api/drive/photos/mock-pdf-1'), { params: Promise.resolve({ fileId: 'mock-pdf-1' }) });
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('application/pdf');
    });
});
