/**
 * Tests d'intégration — GET /api/cron/daily-mileage-check.
 *
 * Route non protégée par NextAuth (déclenchée par Vercel Cron) — sécurisée
 * uniquement par CRON_SECRET si défini. Documente volontairement le
 * comportement fail-open si CRON_SECRET n'est pas configuré (cf. finding
 * sécurité #8, explicitement non corrigé).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/lib/renault', () => ({ getRenaultVehicleData: vi.fn() }));
vi.mock('@/lib/onesignal', () => ({ sendPushNotification: vi.fn().mockResolvedValue(undefined) }));

import { GET } from '@/app/api/cron/daily-mileage-check/route';
import { db, seedVehicle, seedUser, seedRoles, seedUserRole } from './setup';

function makeRequest(authHeader?: string): Request {
    return new Request('http://localhost/api/cron/daily-mileage-check', {
        headers: authHeader ? { authorization: authHeader } : {},
    });
}

describe('GET /api/cron/daily-mileage-check', () => {
    const originalSecret = process.env.CRON_SECRET;

    afterEach(() => {
        process.env.CRON_SECRET = originalSecret;
    });

    it('retourne 401 si CRON_SECRET est défini et l\'en-tête ne correspond pas', async () => {
        process.env.CRON_SECRET = 'my-secret';
        const res = await GET(makeRequest('Bearer wrong-secret'));
        expect(res.status).toBe(401);
    });

    it('accepte la requête avec le bon secret', async () => {
        process.env.CRON_SECRET = 'my-secret';
        const res = await GET(makeRequest('Bearer my-secret'));
        expect(res.status).toBe(200);
    });

    it('documente le comportement fail-open : sans CRON_SECRET configuré, la requête passe sans en-tête (finding sécurité #8, non corrigé)', async () => {
        delete process.env.CRON_SECRET;
        const res = await GET(makeRequest());
        expect(res.status).toBe(200);
    });

    it('supprime les réservations expirées et retourne un résumé (happy path, aucun véhicule connecté)', async () => {
        delete process.env.CRON_SECRET;
        await seedRoles();
        await seedUser({ id: 'admin-1', email: 'admin@test.com' });
        await seedUserRole('admin-1', 'ADMIN');
        await seedVehicle({ id: 'VL001', name: 'VL186', vin: null });

        const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        await db.execute({
            sql: `INSERT INTO Reservation (id, vehicleId, userEmail, userName, startTime, endTime, status) VALUES (?,?,?,?,?,?,?)`,
            args: ['res-expired', 'VL001', 'user@test.com', 'User', past, past, 'VALIDATED'],
        });

        const res = await GET(makeRequest());
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.reservationsDeleted).toBeGreaterThanOrEqual(1);

        const remaining = await db.execute({ sql: `SELECT id FROM Reservation WHERE id = ?`, args: ['res-expired'] });
        expect(remaining.rows).toHaveLength(0);
    });

    it('ignore les véhicules connectés en maintenance sans planter (isMaintenance dérivé de status)', async () => {
        delete process.env.CRON_SECRET;
        await seedRoles();
        await seedUser({ id: 'admin-1', email: 'admin@test.com' });
        await seedUserRole('admin-1', 'ADMIN');
        await seedVehicle({ id: 'VL002', name: 'VL200', vin: 'VF1AB123456789012', status: 'MAINTENANCE', mileage: 5000 });

        const res = await GET(makeRequest());
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.alertsSent).toEqual([]);
    });
});
