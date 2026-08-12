/**
 * Tests d'intégration — checklist des véhicules.
 * Couvre :
 *   - GET/POST /api/vehicles/[id]/checklist
 *   - PATCH/DELETE /api/checklist/[itemId]
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { GET as GET_LIST, POST as POST_ITEM } from '@/app/api/vehicles/[id]/checklist/route';
import { PATCH, DELETE } from '@/app/api/checklist/[itemId]/route';
import { auth } from '@/auth';
import { seedVehicle, seedChecklistItem } from './setup';

const mockedAuth = vi.mocked(auth);

const adminSession = { user: { email: 'admin@test.com', roles: ['ADMIN'], ulId: 'ul-paris-18' } };
const driverSession = { user: { email: 'driver@test.com', roles: ['CHVL'], ulId: 'ul-paris-18' } };

beforeEach(() => {
    vi.resetAllMocks();
});

describe('GET /api/vehicles/[id]/checklist', () => {
    it('retourne 401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        await seedVehicle({ id: 'VL001', name: 'VL186' });
        const res = await GET_LIST(new Request('http://localhost/api/vehicles/VL001/checklist'), { params: Promise.resolve({ id: 'VL001' }) });
        expect(res.status).toBe(401);
    });

    it('retourne la liste ordonnée pour un utilisateur authentifié (tout rôle)', async () => {
        mockedAuth.mockResolvedValue(driverSession as never);
        await seedVehicle({ id: 'VL001', name: 'VL186' });
        await seedChecklistItem({ id: 'item-1', vehicleId: 'VL001', type: 'checkout', order: 0, label: 'Item A' });
        await seedChecklistItem({ id: 'item-2', vehicleId: 'VL001', type: 'checkout', order: 1, label: 'Item B' });

        const res = await GET_LIST(new Request('http://localhost/api/vehicles/VL001/checklist?type=checkout'), { params: Promise.resolve({ id: 'VL001' }) });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toHaveLength(2);
        expect(body[0].label).toBe('Item A');
    });
});

describe('POST /api/vehicles/[id]/checklist', () => {
    it('retourne 403 pour un non-admin', async () => {
        mockedAuth.mockResolvedValue(driverSession as never);
        await seedVehicle({ id: 'VL001', name: 'VL186' });
        const res = await POST_ITEM(
            new Request('http://localhost/api/vehicles/VL001/checklist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label: 'Nouveau', type: 'checkout' }),
            }),
            { params: Promise.resolve({ id: 'VL001' }) }
        );
        expect(res.status).toBe(403);
    });

    it('retourne 400 si le label est manquant (Zod)', async () => {
        mockedAuth.mockResolvedValue(adminSession as never);
        await seedVehicle({ id: 'VL001', name: 'VL186' });
        const res = await POST_ITEM(
            new Request('http://localhost/api/vehicles/VL001/checklist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'checkout' }),
            }),
            { params: Promise.resolve({ id: 'VL001' }) }
        );
        expect(res.status).toBe(400);
    });

    it('crée un item avec succès (201, admin)', async () => {
        mockedAuth.mockResolvedValue(adminSession as never);
        await seedVehicle({ id: 'VL001', name: 'VL186' });
        const res = await POST_ITEM(
            new Request('http://localhost/api/vehicles/VL001/checklist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label: 'Nouveau', type: 'checkout', required: true }),
            }),
            { params: Promise.resolve({ id: 'VL001' }) }
        );
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.label).toBe('Nouveau');
        expect(body.required).toBe(true);
    });
});

describe('PATCH /api/checklist/[itemId]', () => {
    it('retourne 403 pour un non-admin', async () => {
        mockedAuth.mockResolvedValue(driverSession as never);
        await seedVehicle({ id: 'VL001', name: 'VL186' });
        await seedChecklistItem({ id: 'item-1', vehicleId: 'VL001' });
        const res = await PATCH(
            new Request('http://localhost/api/checklist/item-1', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: 'Modifié' }) }),
            { params: Promise.resolve({ itemId: 'item-1' }) }
        );
        expect(res.status).toBe(403);
    });

    it('retourne 403 pour un admin local hors UL du véhicule', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'admin2@test.com', roles: ['ADMIN'], ulId: 'ul-lyon-3' } } as never);
        await seedVehicle({ id: 'VL001', name: 'VL186', ulId: 'ul-paris-18' });
        await seedChecklistItem({ id: 'item-1', vehicleId: 'VL001' });
        const res = await PATCH(
            new Request('http://localhost/api/checklist/item-1', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: 'Modifié' }) }),
            { params: Promise.resolve({ itemId: 'item-1' }) }
        );
        expect(res.status).toBe(403);
    });

    it('retourne 400 si aucun champ à mettre à jour', async () => {
        mockedAuth.mockResolvedValue(adminSession as never);
        await seedVehicle({ id: 'VL001', name: 'VL186' });
        await seedChecklistItem({ id: 'item-1', vehicleId: 'VL001' });
        const res = await PATCH(
            new Request('http://localhost/api/checklist/item-1', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }),
            { params: Promise.resolve({ itemId: 'item-1' }) }
        );
        expect(res.status).toBe(400);
    });

    it('retourne 404 pour un item inconnu', async () => {
        mockedAuth.mockResolvedValue(adminSession as never);
        const res = await PATCH(
            new Request('http://localhost/api/checklist/unknown', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: 'X' }) }),
            { params: Promise.resolve({ itemId: 'unknown' }) }
        );
        expect(res.status).toBe(404);
    });

    it('met à jour le label avec succès (admin, même UL)', async () => {
        mockedAuth.mockResolvedValue(adminSession as never);
        await seedVehicle({ id: 'VL001', name: 'VL186' });
        await seedChecklistItem({ id: 'item-1', vehicleId: 'VL001', label: 'Ancien' });
        const res = await PATCH(
            new Request('http://localhost/api/checklist/item-1', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: 'Nouveau' }) }),
            { params: Promise.resolve({ itemId: 'item-1' }) }
        );
        expect(res.status).toBe(200);
    });
});

describe('DELETE /api/checklist/[itemId]', () => {
    it('retourne 403 pour un non-admin', async () => {
        mockedAuth.mockResolvedValue(driverSession as never);
        await seedVehicle({ id: 'VL001', name: 'VL186' });
        await seedChecklistItem({ id: 'item-1', vehicleId: 'VL001' });
        const res = await DELETE(new Request('http://localhost/api/checklist/item-1', { method: 'DELETE' }), { params: Promise.resolve({ itemId: 'item-1' }) });
        expect(res.status).toBe(403);
    });

    it('retourne 400 pour le badge DSA (protégé)', async () => {
        mockedAuth.mockResolvedValue(adminSession as never);
        const res = await DELETE(new Request('http://localhost/api/checklist/dsa-VL001', { method: 'DELETE' }), { params: Promise.resolve({ itemId: 'dsa-VL001' }) });
        expect(res.status).toBe(400);
    });

    it('supprime un item avec succès (admin)', async () => {
        mockedAuth.mockResolvedValue(adminSession as never);
        await seedVehicle({ id: 'VL001', name: 'VL186' });
        await seedChecklistItem({ id: 'item-1', vehicleId: 'VL001' });
        const res = await DELETE(new Request('http://localhost/api/checklist/item-1', { method: 'DELETE' }), { params: Promise.resolve({ itemId: 'item-1' }) });
        expect(res.status).toBe(200);
    });
});
