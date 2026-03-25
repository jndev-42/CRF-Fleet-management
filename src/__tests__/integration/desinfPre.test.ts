vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { describe, it, expect, vi } from 'vitest';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { PATCH } from '@/app/api/trips/[id]/desinf-pre/route';
import { seedVehicle, seedUser, seedRoles, seedTrip } from './setup';

const mockedAuth = vi.mocked(auth);

function makeRequest(body: Record<string, unknown>): Request {
    return new Request('http://localhost/api/trips/trip-1/desinf-pre', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

function makeParams(id = 'trip-1') {
    return { params: Promise.resolve({ id }) };
}

const validBody = {
    desinfResponsableId: 'user-driver',
    desinfResponsable: 'Test Driver',
    desinfLotNumber: 'LOT-2026-001',
};

describe('PATCH /api/trips/[id]/desinf-pre', () => {
    it('401 — pas de session', async () => {
        // @ts-expect-error — null session for test
        mockedAuth.mockResolvedValue(null);
        const res = await PATCH(makeRequest(validBody), makeParams());
        expect(res.status).toBe(401);
    });

    it('403 — authentifié mais pas ADMIN', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'driver@test.com', roles: ['CHVL'] } } as never);
        const res = await PATCH(makeRequest(validBody), makeParams());
        expect(res.status).toBe(403);
    });

    it('400 — Zod invalide (champ manquant)', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['ADMIN'] } } as never);
        const res = await PATCH(makeRequest({ desinfResponsableId: 'user-driver' }), makeParams());
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBe('Données invalides');
    });

    it('404 — trip inexistant', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['ADMIN'] } } as never);
        const res = await PATCH(makeRequest(validBody), makeParams('nonexistent-trip'));
        expect(res.status).toBe(404);
    });

    it('400 — trip déjà rendu (checkInAt non null)', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['ADMIN'] } } as never);
        await seedRoles();
        await seedVehicle();
        await seedUser();
        await seedTrip({ missionType: 'Désinfection', checkInAt: new Date().toISOString() });

        const res = await PATCH(makeRequest(validBody), makeParams());
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain('déjà été rendu');
    });

    it('400 — mission type !== Désinfection', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['ADMIN'] } } as never);
        await seedRoles();
        await seedVehicle();
        await seedUser();
        await seedTrip({ missionType: 'LOGISTIQUE' });

        const res = await PATCH(makeRequest(validBody), makeParams());
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain('désinfection');
    });

    it('200 — happy path : écrit desinfResponsableId, desinfResponsable, desinfLotNumber en BDD', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['ADMIN'] } } as never);
        await seedRoles();
        await seedVehicle();
        await seedUser();
        await seedTrip({ missionType: 'Désinfection' });

        const res = await PATCH(makeRequest(validBody), makeParams());
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);

        // Verify DB was updated
        const tripRes = await db.execute({
            sql: `SELECT desinfResponsableId, desinfResponsable, desinfLotNumber FROM Trip WHERE id = ?`,
            args: ['trip-1'],
        });
        expect(tripRes.rows.length).toBe(1);
        expect(tripRes.rows[0].desinfResponsableId).toBe('user-driver');
        expect(tripRes.rows[0].desinfResponsable).toBe('Test Driver');
        expect(tripRes.rows[0].desinfLotNumber).toBe('LOT-2026-001');
    });
});
