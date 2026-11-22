/**
 * Tests d'intégration — photos de départ obligatoires par UL
 * (UniteLocale.checkoutPhotosRequired, Trip.photosSkipped).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/vehicle-connection', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/vehicle-connection')>()),
    getRenaultVehicleData: vi.fn().mockResolvedValue(null),
    isConnectedInDb: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/push', () => ({
    sendPushNotification: vi.fn().mockResolvedValue(undefined),
    notifyRoles: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from '@/app/api/trips/route';
import { GET as GET_VEHICLE } from '@/app/api/vehicles/[id]/route';
import { GET as GET_ULS } from '@/app/api/ul/route';
import { PATCH as PATCH_UL } from '@/app/api/ul/[id]/route';
import { auth } from '@/auth';
import { db, seedRoles, seedUser, seedUserRole, seedVehicle } from './setup';

const mockedAuth = vi.mocked(auth);
const UL = 'ul-paris-18';
const driver = { user: { id: 'user-driver', email: 'driver@test.com', name: 'Test Driver', roles: ['CHVL'], ulId: UL } };
const admin = { user: { id: 'adm', email: 'admin@test.com', roles: ['ADMIN'], ulId: UL } };

const jsonRequest = (url: string, method: string, body: Record<string, unknown>) =>
    new Request(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const baseBody = { vehicleId: 'VL001', missionType: 'Logistique', conditionOut: 'BON', dsaChecked: false };
const withUl = { params: Promise.resolve({ id: UL }) };

beforeEach(async () => {
    vi.clearAllMocks();
    await db.execute(`INSERT OR IGNORE INTO "UniteLocale" (id, name, slug) VALUES ('${UL}', 'Paris 18', 'paris-18')`);
    await db.execute(`UPDATE "UniteLocale" SET checkoutPhotosRequired = NULL`);
    await seedUser({ id: 'user-driver', email: 'driver@test.com', name: 'Test Driver' });
    await seedRoles(['CHVL']);
    await seedUserRole('user-driver', 'CHVL');
});

describe('PATCH /api/ul/[id] — checkoutPhotosRequired', () => {
    it('401/403 sans droit : refusé', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'u@test.com', roles: ['CHVL'], ulId: UL } } as never);
        const res = await PATCH_UL(jsonRequest(`http://localhost/api/ul/${UL}`, 'PATCH', { checkoutPhotosRequired: true }), withUl);
        expect(res.status).toBe(403);
    });

    it('400 pour une valeur qui n\'est pas un booléen', async () => {
        mockedAuth.mockResolvedValue(admin as never);
        const res = await PATCH_UL(jsonRequest(`http://localhost/api/ul/${UL}`, 'PATCH', { checkoutPhotosRequired: 'oui' }), withUl);
        expect(res.status).toBe(400);
    });

    it('l\'admin de l\'UL active puis désactive l\'obligation ; GET /api/ul la renvoie', async () => {
        mockedAuth.mockResolvedValue(admin as never);
        let res = await PATCH_UL(jsonRequest(`http://localhost/api/ul/${UL}`, 'PATCH', { checkoutPhotosRequired: true }), withUl);
        expect(res.status).toBe(200);
        let list = (await (await GET_ULS()).json() as { uls: { checkoutPhotosRequired: boolean; id: string }[] }).uls;
        expect(list.find(u => u.id === UL)?.checkoutPhotosRequired).toBe(true);

        res = await PATCH_UL(jsonRequest(`http://localhost/api/ul/${UL}`, 'PATCH', { checkoutPhotosRequired: false }), withUl);
        expect(res.status).toBe(200);
        list = (await (await GET_ULS()).json() as { uls: typeof list }).uls;
        expect(list.find(u => u.id === UL)?.checkoutPhotosRequired).toBe(false);
    });
});

describe('POST /api/trips — photosSkipped', () => {
    async function skipped(body: Record<string, unknown>): Promise<unknown> {
        mockedAuth.mockResolvedValue(driver as never);
        await seedVehicle({ id: 'VL001', status: 'AVAILABLE' });
        const res = await POST(jsonRequest('http://localhost/api/trips', 'POST', { ...baseBody, ...body }));
        expect(res.status).toBe(201);
        const { id } = await res.json() as { id: string };
        return (await db.execute({ sql: 'SELECT photosSkipped FROM Trip WHERE id = ?', args: [id] })).rows[0].photosSkipped;
    }

    it('dérogation : photosSkipped = 1', async () => {
        expect(await skipped({ photosSkipped: true })).toBe(1);
    });

    it('sans indication : 0 (UL à photos optionnelles, comportement inchangé)', async () => {
        expect(await skipped({})).toBe(0);
    });

    it('des photos jointes : jamais marqué « sans photo »', async () => {
        expect(await skipped({ photosSkipped: true, driveFolderId: 'drive-folder-123' })).toBe(0);
    });

    it('400 pour un type invalide', async () => {
        mockedAuth.mockResolvedValue(driver as never);
        await seedVehicle({ id: 'VL001', status: 'AVAILABLE' });
        const res = await POST(jsonRequest('http://localhost/api/trips', 'POST', { ...baseBody, photosSkipped: 'oui' }));
        expect(res.status).toBe(400);
    });
});

describe('GET /api/vehicles/[id] — photos obligatoires', () => {
    it('renvoie checkoutPhotosRequired et photosSkipped des sorties', async () => {
        mockedAuth.mockResolvedValue(admin as never);
        await db.execute(`UPDATE "UniteLocale" SET checkoutPhotosRequired = 1 WHERE id = '${UL}'`);
        await seedVehicle({ id: 'VLP', name: 'VL photos', type: 'VL', status: 'AVAILABLE' });
        await db.execute({
            sql: `INSERT INTO Trip (id, vehicleId, driverId, missionType, checkOutAt, mileageOut, fuelOut, photosSkipped) VALUES ('t-skip', 'VLP', 'user-driver', 'Logistique', ?, 10, 50, 1)`,
            args: [new Date().toISOString()],
        });
        const res = await GET_VEHICLE(new Request('http://localhost/api/vehicles/VL%20photos'), { params: Promise.resolve({ id: 'VL photos' }) });
        const vehicle = await res.json();
        expect(vehicle.checkoutPhotosRequired).toBe(true);
        expect(vehicle.trips[0].photosSkipped).toBe(true);
    });
});
