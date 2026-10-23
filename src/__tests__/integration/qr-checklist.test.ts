/**
 * GET /api/qr/[token]/checklist — checklist des formulaires QR, ouverte entre ULs
 * (pendant de `GET /api/vehicles/[id]/checklist`, désormais cloisonné).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { GET } from '@/app/api/qr/[token]/checklist/route';
import { auth } from '@/auth';
import { seedVehicle, seedChecklistItem } from './setup';

const mockedAuth = vi.mocked(auth);
const params = { params: Promise.resolve({ token: 'qr-tok' }) };
const get = (query = '') => GET(new Request(`http://localhost/api/qr/qr-tok/checklist${query}`), params);

beforeEach(async () => {
    await seedVehicle({ id: 'VL001', name: 'VL186', ulId: 'ul-paris-18', qrToken: 'qr-tok' });
    await seedChecklistItem({ id: 'item-out', type: 'checkout', label: 'Pneus' });
    await seedChecklistItem({ id: 'item-in', type: 'checkin', label: 'Propreté' });
});

describe('GET /api/qr/[token]/checklist', () => {
    it('401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        expect((await get()).status).toBe(401);
    });

    it('403 pour un compte INACTIF', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'u1', roles: ['INACTIF'], ulId: 'ul-paris-18' } } as never);
        expect((await get()).status).toBe(403);
    });

    it('403 pour un compte INACTIF portant aussi un rôle actif', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'u1', roles: ['INACTIF', 'CHVL'], ulId: 'ul-paris-18' } } as never);
        expect((await get()).status).toBe(403);
    });

    it('400 pour un type inconnu', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'u1', roles: ['CHVL'], ulId: 'ul-paris-18' } } as never);
        expect((await get('?type=autre')).status).toBe(400);
    });

    it('404 pour un token inconnu', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'u1', roles: ['CHVL'], ulId: 'ul-paris-18' } } as never);
        const res = await GET(new Request('http://localhost/api/qr/x/checklist'), { params: Promise.resolve({ token: 'x' }) });
        expect(res.status).toBe(404);
    });

    it("renvoie la checklist filtrée par type à un bénévole d'une autre UL (le QR fait foi)", async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'u1', roles: [], ulId: 'ul-lyon-3' } } as never);
        const res = await get('?type=checkin');
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toHaveLength(1);
        expect(body[0]).toMatchObject({ id: 'item-in', label: 'Propreté', type: 'checkin', required: false });
    });
});
