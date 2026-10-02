/**
 * Tests d'intégration — de la route enveloppée à la ligne `AuditLog` stockée.
 *
 * Vraies routes, vraie base de test ; seuls la session (`@/auth`), les services
 * externes et `after()` sont mockés — `after()` collecte les tâches, que le test
 * exécute ensuite comme Next.js le ferait après la réponse.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/drive', () => ({ deleteDriveFolder: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/vehicle-connection', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/vehicle-connection')>()),
    getRenaultVehicleData: vi.fn().mockResolvedValue(null),
    isConnectedInDb: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/onesignal', () => ({
    sendPushNotification: vi.fn().mockResolvedValue(undefined),
    notifyRoles: vi.fn().mockResolvedValue(undefined),
}));

const afterTasks = vi.hoisted(() => [] as (() => Promise<void>)[]);
vi.mock('next/server', async (importOriginal) => ({
    ...(await importOriginal<typeof import('next/server')>()),
    after: vi.fn((task: () => Promise<void>) => { afterTasks.push(task); }),
}));

import { auth } from '@/auth';
import { DELETE as DELETE_VEHICLE } from '@/app/api/vehicles/[id]/route';
import { DELETE as DELETE_MAINTENANCE_EVENT } from '@/app/api/vehicles/[id]/maintenance-events/[eventId]/route';
import { POST as POST_QR_CHECKOUT } from '@/app/api/qr/[token]/checkout/route';
import { db, seedVehicle } from './setup';

const mockedAuth = vi.mocked(auth as unknown as () => Promise<unknown>);

const adminSession = {
    user: { id: 'u-admin', email: 'admin@croix-rouge.fr', name: 'Admin', roles: ['ADMIN'], ulId: 'ul-paris-18' },
};

async function flushAfter() {
    for (const task of afterTasks.splice(0)) await task();
}

async function auditRows() {
    const res = await db.execute(`SELECT * FROM "AuditLog" ORDER BY createdAt`);
    return res.rows;
}

beforeEach(() => {
    afterTasks.length = 0;
    mockedAuth.mockReset();
    mockedAuth.mockResolvedValue(adminSession);
});

describe('routes enveloppées par withAudit', () => {
    it("DELETE /api/vehicles/[id] : ligne avec auteur, libellé, ressource et code", async () => {
        await seedVehicle({ id: 'veh-1', name: 'VL186', ulId: 'ul-paris-18' });

        const res = await DELETE_VEHICLE(
            new Request('http://localhost/api/vehicles/VL186', { method: 'DELETE' }),
            { params: Promise.resolve({ id: 'VL186' }) },
        );
        expect(res.status).toBe(200);
        expect(await auditRows()).toHaveLength(0);

        await flushAfter();
        const [row] = await auditRows();
        expect(row).toMatchObject({
            actorEmail: 'admin@croix-rouge.fr',
            actorName: 'Admin',
            ulId: 'ul-paris-18',
            method: 'DELETE',
            path: '/api/vehicles/VL186',
            action: "Suppression d'un véhicule",
            entityType: 'vehicle',
            entityId: 'VL186',
            status: 200,
        });
    });

    it('route à deux paramètres : la ressource est le dernier (eventId)', async () => {
        await seedVehicle({ id: 'veh-1', name: 'VL186', ulId: 'ul-paris-18' });

        const res = await DELETE_MAINTENANCE_EVENT(
            new Request('http://localhost/api/vehicles/veh-1/maintenance-events/evt-404', { method: 'DELETE' }),
            { params: Promise.resolve({ id: 'veh-1', eventId: 'evt-404' }) },
        );

        await flushAfter();
        const [row] = await auditRows();
        expect(row).toMatchObject({
            path: '/api/vehicles/veh-1/maintenance-events/evt-404',
            action: "Suppression d'une maintenance",
            entityType: 'maintenanceEvent',
            entityId: 'evt-404',
            status: res.status,
        });
    });

    it('route QR : le jeton est masqué dans le chemin et jamais stocké', async () => {
        const res = await POST_QR_CHECKOUT(
            new Request('http://localhost/api/qr/tok-secret-123/checkout', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({}),
            }),
            { params: Promise.resolve({ token: 'tok-secret-123' }) },
        );
        expect(res.status).toBeGreaterThanOrEqual(400);

        await flushAfter();
        const rows = await auditRows();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            path: '/api/qr/:token/checkout',
            action: "Prise d'un véhicule via QR code",
            entityType: 'trip',
            entityId: null,
            status: res.status,
        });
        expect(JSON.stringify(rows)).not.toContain('tok-secret-123');
    });
});
