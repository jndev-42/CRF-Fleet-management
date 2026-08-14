/**
 * Tests d'intégration — GET/POST/DELETE /api/vehicles/[id]/qr-token.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { GET, POST, DELETE } from '@/app/api/vehicles/[id]/qr-token/route';
import { auth } from '@/auth';
import { db, seedVehicle } from './setup';

const mockedAuth = vi.mocked(auth);

beforeEach(() => {
    vi.resetAllMocks();
});

function makeRequest(method: string): Request {
    return new Request('http://localhost/api/vehicles/VL001/qr-token', { method });
}

describe('GET /api/vehicles/[id]/qr-token', () => {
    it('retourne 401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        const res = await GET(makeRequest('GET'), { params: Promise.resolve({ id: 'VL001' }) });
        expect(res.status).toBe(401);
    });

    it('retourne 404 pour un véhicule inconnu', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'] } } as never);
        const res = await GET(makeRequest('GET'), { params: Promise.resolve({ id: 'unknown' }) });
        expect(res.status).toBe(404);
    });

    it('crée paresseusement un token si absent (happy path)', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'] } } as never);
        await seedVehicle({ id: 'VL001', name: 'VL186' });

        const res = await GET(makeRequest('GET'), { params: Promise.resolve({ id: 'VL001' }) });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.token).toBeTruthy();
    });

    it('retourne le même token à chaque appel', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'] } } as never);
        await seedVehicle({ id: 'VL001', name: 'VL186' });

        const res1 = await GET(makeRequest('GET'), { params: Promise.resolve({ id: 'VL001' }) });
        const body1 = await res1.json();
        const res2 = await GET(makeRequest('GET'), { params: Promise.resolve({ id: 'VL001' }) });
        const body2 = await res2.json();
        expect(body1.token).toBe(body2.token);
    });
});

describe('POST /api/vehicles/[id]/qr-token', () => {
    it('se comporte comme GET (happy path)', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'] } } as never);
        await seedVehicle({ id: 'VL001', name: 'VL186' });

        const res = await POST(makeRequest('POST'), { params: Promise.resolve({ id: 'VL001' }) });
        expect(res.status).toBe(200);
    });
});

describe('DELETE /api/vehicles/[id]/qr-token', () => {
    it('retourne 401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        const res = await DELETE(makeRequest('DELETE'), { params: Promise.resolve({ id: 'VL001' }) });
        expect(res.status).toBe(401);
    });

    it('retourne 403 pour un rôle insuffisant', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'] } } as never);
        const res = await DELETE(makeRequest('DELETE'), { params: Promise.resolve({ id: 'VL001' }) });
        expect(res.status).toBe(403);
    });

    it('régénère le token pour un admin (happy path)', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['ADMIN'] } } as never);
        await seedVehicle({ id: 'VL001', name: 'VL186' });
        await db.execute({ sql: `UPDATE Vehicle SET qrToken = 'old-token' WHERE id = ?`, args: ['VL001'] });

        const res = await DELETE(makeRequest('DELETE'), { params: Promise.resolve({ id: 'VL001' }) });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.token).not.toBe('old-token');
    });
});
