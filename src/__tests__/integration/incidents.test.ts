/**
 * Tests d'intégration — GET/PATCH/DELETE /api/incidents/[id] et GET /api/incidents/[id]/pdf.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { GET, PATCH, DELETE } from '@/app/api/incidents/[id]/route';
import { GET as GET_PDF } from '@/app/api/incidents/[id]/pdf/route';
import { auth } from '@/auth';
import { seedVehicle, seedUser, seedIncident } from './setup';

const mockedAuth = vi.mocked(auth);

beforeEach(() => {
    vi.resetAllMocks();
});

describe('GET /api/incidents/[id]', () => {
    it('retourne 401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        const res = await GET(new Request('http://localhost/api/incidents/incident-1'), { params: Promise.resolve({ id: 'incident-1' }) });
        expect(res.status).toBe(401);
    });

    it('retourne 404 pour un incident inconnu', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'], ulId: 'ul-paris-18' } } as never);
        const res = await GET(new Request('http://localhost/api/incidents/unknown'), { params: Promise.resolve({ id: 'unknown' }) });
        expect(res.status).toBe(404);
    });

    it('retourne 403 pour un utilisateur hors UL du véhicule', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'], ulId: 'ul-lyon-3' } } as never);
        await seedVehicle({ id: 'VL001', name: 'VL186', ulId: 'ul-paris-18' });
        await seedUser({ id: 'user-1', email: 'reporter@test.com' });
        await seedIncident({ id: 'incident-1', vehicleId: 'VL001', userId: 'user-1' });

        const res = await GET(new Request('http://localhost/api/incidents/incident-1'), { params: Promise.resolve({ id: 'incident-1' }) });
        expect(res.status).toBe(403);
    });

    it('retourne le rapport pour un utilisateur de la même UL (happy path)', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'], ulId: 'ul-paris-18' } } as never);
        await seedVehicle({ id: 'VL001', name: 'VL186', ulId: 'ul-paris-18' });
        await seedUser({ id: 'user-1', email: 'reporter@test.com' });
        await seedIncident({ id: 'incident-1', vehicleId: 'VL001', userId: 'user-1' });

        const res = await GET(new Request('http://localhost/api/incidents/incident-1'), { params: Promise.resolve({ id: 'incident-1' }) });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.id).toBe('incident-1');
    });
});

describe('PATCH /api/incidents/[id]', () => {
    it('retourne 401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        const res = await PATCH(
            new Request('http://localhost/api/incidents/incident-1', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'SUBMITTED' }) }),
            { params: Promise.resolve({ id: 'incident-1' }) }
        );
        expect(res.status).toBe(401);
    });

    it('retourne 400 pour un type invalide (Zod)', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'user-1', email: 'reporter@test.com', roles: ['CHVL'] } } as never);
        await seedVehicle({ id: 'VL001', name: 'VL186' });
        await seedUser({ id: 'user-1', email: 'reporter@test.com' });
        await seedIncident({ id: 'incident-1', vehicleId: 'VL001', userId: 'user-1' });

        const res = await PATCH(
            new Request('http://localhost/api/incidents/incident-1', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'INVALID' }) }),
            { params: Promise.resolve({ id: 'incident-1' }) }
        );
        expect(res.status).toBe(400);
    });

    it('retourne 403 pour un autre utilisateur non-admin', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'user-2', email: 'autre@test.com', roles: ['CHVL'] } } as never);
        await seedVehicle({ id: 'VL001', name: 'VL186' });
        await seedUser({ id: 'user-1', email: 'reporter@test.com' });
        await seedUser({ id: 'user-2', email: 'autre@test.com' });
        await seedIncident({ id: 'incident-1', vehicleId: 'VL001', userId: 'user-1' });

        const res = await PATCH(
            new Request('http://localhost/api/incidents/incident-1', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'SUBMITTED' }) }),
            { params: Promise.resolve({ id: 'incident-1' }) }
        );
        expect(res.status).toBe(403);
    });

    it('retourne 404 pour un incident inconnu', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'user-1', email: 'reporter@test.com', roles: ['CHVL'] } } as never);
        const res = await PATCH(
            new Request('http://localhost/api/incidents/unknown', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'SUBMITTED' }) }),
            { params: Promise.resolve({ id: 'unknown' }) }
        );
        expect(res.status).toBe(404);
    });

    it('met à jour le rapport par son auteur (happy path)', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'user-1', email: 'reporter@test.com', roles: ['CHVL'] } } as never);
        await seedVehicle({ id: 'VL001', name: 'VL186' });
        await seedUser({ id: 'user-1', email: 'reporter@test.com' });
        await seedIncident({ id: 'incident-1', vehicleId: 'VL001', userId: 'user-1' });

        const res = await PATCH(
            new Request('http://localhost/api/incidents/incident-1', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'SUBMITTED', description: 'Détail' }) }),
            { params: Promise.resolve({ id: 'incident-1' }) }
        );
        expect(res.status).toBe(200);
    });
});

describe('DELETE /api/incidents/[id]', () => {
    it('retourne 401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        const res = await DELETE(new Request('http://localhost/api/incidents/incident-1', { method: 'DELETE' }), { params: Promise.resolve({ id: 'incident-1' }) });
        expect(res.status).toBe(401);
    });

    it('retourne 403 pour un autre utilisateur non-admin', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'user-2', email: 'autre@test.com', roles: ['CHVL'] } } as never);
        await seedVehicle({ id: 'VL001', name: 'VL186' });
        await seedUser({ id: 'user-1', email: 'reporter@test.com' });
        await seedUser({ id: 'user-2', email: 'autre@test.com' });
        await seedIncident({ id: 'incident-1', vehicleId: 'VL001', userId: 'user-1' });

        const res = await DELETE(new Request('http://localhost/api/incidents/incident-1', { method: 'DELETE' }), { params: Promise.resolve({ id: 'incident-1' }) });
        expect(res.status).toBe(403);
    });

    it('supprime le rapport par son auteur (happy path)', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'user-1', email: 'reporter@test.com', roles: ['CHVL'] } } as never);
        await seedVehicle({ id: 'VL001', name: 'VL186' });
        await seedUser({ id: 'user-1', email: 'reporter@test.com' });
        await seedIncident({ id: 'incident-1', vehicleId: 'VL001', userId: 'user-1' });

        const res = await DELETE(new Request('http://localhost/api/incidents/incident-1', { method: 'DELETE' }), { params: Promise.resolve({ id: 'incident-1' }) });
        expect(res.status).toBe(200);
    });
});

describe('GET /api/incidents/[id]/pdf', () => {
    it('retourne 401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        const res = await GET_PDF(new Request('http://localhost/api/incidents/incident-1/pdf'), { params: Promise.resolve({ id: 'incident-1' }) });
        expect(res.status).toBe(401);
    });

    it('retourne 404 pour un incident inconnu', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'user-1', email: 'reporter@test.com', roles: ['CHVL'] } } as never);
        const res = await GET_PDF(new Request('http://localhost/api/incidents/unknown/pdf'), { params: Promise.resolve({ id: 'unknown' }) });
        expect(res.status).toBe(404);
    });

    it('retourne 403 pour un autre utilisateur non-admin', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'user-2', email: 'autre@test.com', roles: ['CHVL'] } } as never);
        await seedVehicle({ id: 'VL001', name: 'VL186' });
        await seedUser({ id: 'user-1', email: 'reporter@test.com' });
        await seedUser({ id: 'user-2', email: 'autre@test.com' });
        await seedIncident({ id: 'incident-1', vehicleId: 'VL001', userId: 'user-1' });

        const res = await GET_PDF(new Request('http://localhost/api/incidents/incident-1/pdf'), { params: Promise.resolve({ id: 'incident-1' }) });
        expect(res.status).toBe(403);
    });

    it('génère le PDF pour son auteur (happy path)', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'user-1', email: 'reporter@test.com', roles: ['CHVL'] } } as never);
        await seedVehicle({ id: 'VL001', name: 'VL186' });
        await seedUser({ id: 'user-1', email: 'reporter@test.com' });
        await seedIncident({ id: 'incident-1', vehicleId: 'VL001', userId: 'user-1' });

        const res = await GET_PDF(new Request('http://localhost/api/incidents/incident-1/pdf'), { params: Promise.resolve({ id: 'incident-1' }) });
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('application/pdf');
    });
});
