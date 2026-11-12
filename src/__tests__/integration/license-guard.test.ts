/**
 * Garde des papiers de conduite hors `POST /api/trips` (couvert par checkout.test.ts) :
 * `isLicenseBlocked` (`@/lib/licenseGuard`), l'emprunt par QR, le changement de
 * conducteur d'un trajet en cours et la désignation d'un second conducteur.
 * Seuls les chauffeurs (CHVL / CHVPSP en base) sont soumis aux papiers ; un compte
 * introuvable est refusé.
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

import { auth } from '@/auth';
import { db, seedVehicle, seedUser, seedTrip, seedRoles, seedUserRole, seedUserUL, seedUniteLocale } from './setup';
import { isLicenseBlocked } from '@/lib/licenseGuard';
import { POST as postQrCheckout } from '@/app/api/qr/[token]/checkout/route';
import { POST as postTrip } from '@/app/api/trips/route';
import { PATCH as patchTripCheckout } from '@/app/api/trips/[id]/checkout/route';
import { PATCH as patchSecondDriver } from '@/app/api/trips/[id]/second-driver/route';

const mockedAuth = vi.mocked(auth);

const UL = 'ul-paris-18';
const DAY = 24 * 60 * 60 * 1000;
const isoDay = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);

/** Papiers bloqués : invalidés depuis plus que le délai de grâce (14 jours). */
const BLOCKED = { papiers_valides: 0, last_validation: null, start_date_invalidation_process: isoDay(-20) };
const VALID = { papiers_valides: 1, last_validation: isoDay(-10) };

function asUser(id: string | undefined, roles: string[], ulId = UL) {
    mockedAuth.mockResolvedValue({ user: { id, email: `${id ?? 'anon'}@test.com`, name: 'Test', roles, ulId } } as never);
}

function req(method: string, body: unknown): Request {
    return new Request('http://localhost/api/x', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

const tripParams = { params: Promise.resolve({ id: 'trip-1' }) };

/** Crée un compte chauffeur (rôle CHVL en base) aux papiers donnés. */
async function seedDriver(id: string, papers: Parameters<typeof seedUser>[0]) {
    await seedRoles(['CHVL']);
    await seedUser({ id, email: `${id}@test.com`, ...papers });
    await seedUserRole(id, 'CHVL');
}

describe('isLicenseBlocked', () => {
    it('true sans identifiant', async () => {
        expect(await isLicenseBlocked(undefined)).toBe(true);
        expect(await isLicenseBlocked(null)).toBe(true);
        expect(await isLicenseBlocked('')).toBe(true);
    });

    it('true pour un compte sans ligne User (fermé par défaut)', async () => {
        expect(await isLicenseBlocked('inconnu')).toBe(true);
    });

    it('true pour un chauffeur aux papiers hors délai de grâce', async () => {
        await seedDriver('u1', BLOCKED);
        expect(await isLicenseBlocked('u1')).toBe(true);
    });

    it('true pour un chauffeur dont CHVPSP ne vient que de la ligne UserUL', async () => {
        await seedUser({ id: 'u1', email: 'u1@test.com', ...BLOCKED });
        await seedUniteLocale({ id: UL });
        await seedUserUL({ userId: 'u1', ulId: UL, roles: ['CHVPSP'] });
        expect(await isLicenseBlocked('u1')).toBe(true);
    });

    it('false pour un compte sans CHVL / CHVPSP, même aux papiers périmés (D1)', async () => {
        await seedRoles(['ADMIN']);
        await seedUser({ id: 'u1', email: 'u1@test.com', ...BLOCKED });
        await seedUserRole('u1', 'ADMIN');
        expect(await isLicenseBlocked('u1')).toBe(false);
    });

    it('false pour des papiers valides ou encore dans le délai de grâce', async () => {
        await seedDriver('u1', VALID);
        await seedDriver('u2', { papiers_valides: 0, start_date_invalidation_process: isoDay(-3) });
        expect(await isLicenseBlocked('u1')).toBe(false);
        expect(await isLicenseBlocked('u2')).toBe(false);
    });

    it("n'écrit jamais l'invalidation en base", async () => {
        await seedDriver('u1', { papiers_valides: 1, last_validation: isoDay(-400) });
        await isLicenseBlocked('u1');
        const row = (await db.execute(`SELECT papiers_valides, start_date_invalidation_process FROM "User" WHERE id = 'u1'`)).rows[0];
        expect(Number(row.papiers_valides)).toBe(1);
        expect(row.start_date_invalidation_process).toBeNull();
    });
});

describe('POST /api/trips — second conducteur', () => {
    it('403 quand le second conducteur a des papiers bloqués, aucun trajet créé', async () => {
        await seedVehicle({ id: 'VL001', name: 'VL186', ulId: UL, status: 'AVAILABLE' });
        await seedDriver('u1', VALID);
        // Chauffeur habilité : `secondDriverError` (rôle, compte actif) passe, seuls les papiers bloquent.
        await seedDriver('blocked', BLOCKED);
        asUser('u1', ['CHVL']);

        const res = await postTrip(req('POST', {
            vehicleId: 'VL001', missionType: 'Logistique', conditionOut: 'BON', dsaChecked: false, secondDriverId: 'blocked',
        }));
        expect(res.status).toBe(403);
        expect((await db.execute(`SELECT id FROM "Trip"`)).rows).toHaveLength(0);
        expect((await db.execute(`SELECT status FROM "Vehicle" WHERE id = 'VL001'`)).rows[0].status).toBe('AVAILABLE');
    });
});

describe('POST /api/qr/[token]/checkout — garde des papiers', () => {
    const body = { missionType: 'Logistique', conditionOut: 'BON' };
    const qrParams = { params: Promise.resolve({ token: 'qr-tok' }) };

    beforeEach(async () => {
        await seedVehicle({ id: 'VL001', name: 'VL186', ulId: UL, status: 'AVAILABLE', qrToken: 'qr-tok' });
    });

    it('403 pour un chauffeur CHVL aux papiers bloqués, aucun trajet créé', async () => {
        await seedDriver('u1', BLOCKED);
        asUser('u1', ['CHVL']);
        const res = await postQrCheckout(req('POST', body), qrParams);
        expect(res.status).toBe(403);
        expect((await res.json()).error).toMatch(/papiers n'ont pas été validés dans les délais/i);
        expect((await db.execute(`SELECT id FROM "Trip"`)).rows).toHaveLength(0);
        expect((await db.execute(`SELECT status FROM "Vehicle" WHERE id = 'VL001'`)).rows[0].status).toBe('AVAILABLE');
    });

    it('201 pour un non-chauffeur aux papiers périmés : le QR ne contrôle aucun rôle (D1)', async () => {
        await seedRoles(['CADRE']);
        await seedUser({ id: 'u1', email: 'u1@test.com', ...BLOCKED });
        await seedUserRole('u1', 'CADRE');
        asUser('u1', ['CADRE']);
        expect((await postQrCheckout(req('POST', body), qrParams)).status).toBe(201);
    });

    it('403 quand le second conducteur a des papiers bloqués (garde partagée), aucun trajet créé', async () => {
        await seedDriver('u1', VALID);
        await seedDriver('blocked', BLOCKED);
        asUser('u1', ['CHVL']);
        const res = await postQrCheckout(req('POST', { ...body, secondDriverId: 'blocked' }), qrParams);
        expect(res.status).toBe(403);
        expect((await res.json()).error).toMatch(/papiers de ce conducteur/i);
        expect((await db.execute(`SELECT id FROM "Trip"`)).rows).toHaveLength(0);
    });

    it('403 pour un compte sans ligne User', async () => {
        asUser('fantome', ['CHVL']);
        expect((await postQrCheckout(req('POST', body), qrParams)).status).toBe(403);
    });

    it("201 pour un bénévole d'une autre UL aux papiers valides (le QR fait foi)", async () => {
        await seedDriver('u1', VALID);
        asUser('u1', ['CHVL'], 'ul-lyon-3');
        expect((await postQrCheckout(req('POST', body), qrParams)).status).toBe(201);
    });
});

describe('PATCH /api/trips/[id]/checkout — changement de conducteur', () => {
    const base = { missionType: 'Logistique', mileageOut: 10050, fuelOut: 70, conditionOut: 'BON' };

    beforeEach(async () => {
        await seedVehicle({ id: 'VL001', name: 'VL186', ulId: UL, status: 'IN_USE' });
        await seedUser({ id: 'manager', email: 'manager@test.com', ...VALID });
        await seedDriver('user-driver', VALID);
        await seedDriver('blocked', BLOCKED);
        await seedDriver('driver-b', VALID);
        await seedTrip({ id: 'trip-1', driverId: 'user-driver' });
        asUser('manager', ['ADMIN']);
    });

    it('403 si le nouveau conducteur a des papiers bloqués, rien n\'est écrit', async () => {
        const res = await patchTripCheckout(req('PATCH', { ...base, driverId: 'blocked' }), tripParams);
        expect(res.status).toBe(403);
        expect((await db.execute(`SELECT driverId FROM "Trip" WHERE id = 'trip-1'`)).rows[0].driverId).toBe('user-driver');
    });

    it('403 si le second conducteur désigné a des papiers bloqués', async () => {
        const res = await patchTripCheckout(req('PATCH', { ...base, driverId: 'user-driver', secondDriverId: 'blocked' }), tripParams);
        expect(res.status).toBe(403);
    });

    it('400 pour un nouveau second conducteur qui n\'est pas chauffeur', async () => {
        const res = await patchTripCheckout(req('PATCH', { ...base, driverId: 'user-driver', secondDriverId: 'manager' }), tripParams);
        expect(res.status).toBe(400);
        expect((await db.execute(`SELECT secondDriverId FROM "Trip" WHERE id = 'trip-1'`)).rows[0].secondDriverId).toBeNull();
    });

    it('200 pour un nouveau second conducteur chauffeur habilité aux papiers valides', async () => {
        const res = await patchTripCheckout(req('PATCH', { ...base, driverId: 'user-driver', secondDriverId: 'driver-b' }), tripParams);
        expect(res.status).toBe(200);
    });

    it("200 quand le conducteur ne change pas, même si ses papiers ont expiré depuis la prise", async () => {
        await db.execute(`UPDATE Trip SET driverId = 'blocked' WHERE id = 'trip-1'`);
        const res = await patchTripCheckout(req('PATCH', { ...base, driverId: 'blocked' }), tripParams);
        expect(res.status).toBe(200);
    });

    it('200 pour un nouveau conducteur chauffeur aux papiers valides', async () => {
        const res = await patchTripCheckout(req('PATCH', { ...base, driverId: 'driver-b' }), tripParams);
        expect(res.status).toBe(200);
    });

    it('400 pour un nouveau conducteur qui n\'est pas chauffeur (gestionnaire compris), rien n\'est écrit', async () => {
        const res = await patchTripCheckout(req('PATCH', { ...base, driverId: 'manager' }), tripParams);
        expect(res.status).toBe(400);
        expect((await db.execute(`SELECT driverId FROM "Trip" WHERE id = 'trip-1'`)).rows[0].driverId).toBe('user-driver');
    });

    it('400 pour un nouveau conducteur CHVPSP sur un véhicule VL', async () => {
        await seedRoles(['CHVPSP']);
        await seedUser({ id: 'vpsp-only', email: 'vpsp-only@test.com', ...VALID });
        await seedUserRole('vpsp-only', 'CHVPSP');
        const res = await patchTripCheckout(req('PATCH', { ...base, driverId: 'vpsp-only' }), tripParams);
        expect(res.status).toBe(400);
    });
});

describe('PATCH /api/trips/[id]/second-driver — garde des papiers', () => {
    beforeEach(async () => {
        await seedVehicle({ id: 'VL001', name: 'VL186', ulId: UL, status: 'IN_USE' });
        await seedDriver('user-driver', VALID);
        await seedDriver('blocked', BLOCKED);
        await seedDriver('valid', VALID);
        await seedTrip({ id: 'trip-1', driverId: 'user-driver' });
        asUser('user-driver', ['CHVL']);
    });

    it('403 pour un second conducteur aux papiers bloqués, rien n\'est écrit', async () => {
        const res = await patchSecondDriver(req('PATCH', { secondDriverId: 'blocked' }), tripParams);
        expect(res.status).toBe(403);
        expect((await db.execute(`SELECT secondDriverId FROM "Trip" WHERE id = 'trip-1'`)).rows[0].secondDriverId).toBeNull();
    });

    it('400 pour un second conducteur qui n\'est pas chauffeur, rien n\'est écrit', async () => {
        await seedUser({ id: 'plain', email: 'plain@test.com', ...VALID });
        const res = await patchSecondDriver(req('PATCH', { secondDriverId: 'plain' }), tripParams);
        expect(res.status).toBe(400);
        expect((await db.execute(`SELECT secondDriverId FROM "Trip" WHERE id = 'trip-1'`)).rows[0].secondDriverId).toBeNull();
    });

    it('200 pour un second conducteur aux papiers valides', async () => {
        const res = await patchSecondDriver(req('PATCH', { secondDriverId: 'valid' }), tripParams);
        expect(res.status).toBe(200);
    });

    it('200 quand le second conducteur ne change pas, même si ses papiers ont expiré depuis', async () => {
        await db.execute(`UPDATE Trip SET secondDriverId = 'blocked' WHERE id = 'trip-1'`);
        const res = await patchSecondDriver(req('PATCH', { secondDriverId: 'blocked' }), tripParams);
        expect(res.status).toBe(200);
    });
});
