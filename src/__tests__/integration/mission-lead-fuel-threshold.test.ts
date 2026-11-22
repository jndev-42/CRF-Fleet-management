/**
 * Tests d'intégration — responsable de la mission (Trip.missionLeadName)
 * et seuil de carburant au retour par UL (UniteLocale.minFuelReturnPercent).
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
import { POST as POST_QR_CHECKOUT } from '@/app/api/qr/[token]/checkout/route';
import { GET as GET_QR_VEHICLE } from '@/app/api/qr/[token]/vehicle/route';
import { GET as GET_VEHICLE } from '@/app/api/vehicles/[id]/route';
import { GET as GET_ULS } from '@/app/api/ul/route';
import { PATCH as PATCH_UL } from '@/app/api/ul/[id]/route';
import { auth } from '@/auth';
import { db, seedVehicle, seedUser, seedRoles, seedUserRole, seedTrip } from './setup';

const mockedAuth = vi.mocked(auth);
const UL = 'ul-paris-18';
const driver = { user: { id: 'user-driver', email: 'driver@test.com', name: 'Test Driver', roles: ['CHVL'], ulId: UL } };

function jsonRequest(url: string, method: string, body: Record<string, unknown>): Request {
  return new Request(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

const baseBody = { vehicleId: 'VL001', missionType: 'Logistique', conditionOut: 'BON', dsaChecked: false };

async function seedDriver() {
  await seedUser({ id: 'user-driver', email: 'driver@test.com', name: 'Test Driver' });
  await seedRoles(['CHVL']);
  await seedUserRole('user-driver', 'CHVL');
}

beforeEach(async () => {
  vi.clearAllMocks();
  await db.execute(`INSERT OR IGNORE INTO "UniteLocale" (id, name, slug) VALUES ('${UL}', 'Paris 18', 'paris-18')`);
  await db.execute(`UPDATE "UniteLocale" SET minFuelReturnPercent = NULL`);
});

describe('POST /api/trips — responsable de la mission', () => {
  it('retourne 401 sans session', async () => {
    mockedAuth.mockResolvedValue(null as never);
    const res = await POST(jsonRequest('http://localhost/api/trips', 'POST', baseBody));
    expect(res.status).toBe(401);
  });

  it('enregistre le responsable rogné', async () => {
    mockedAuth.mockResolvedValue(driver as never);
    await seedDriver();
    await seedVehicle({ id: 'VL001', status: 'AVAILABLE' });
    const res = await POST(jsonRequest('http://localhost/api/trips', 'POST', { ...baseBody, missionLeadName: '  Paul D. (CI) ' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    const row = await db.execute({ sql: 'SELECT missionLeadName FROM Trip WHERE id = ?', args: [body.id] });
    expect(row.rows[0].missionLeadName).toBe('Paul D. (CI)');
  });

  it('stocke NULL pour un responsable vide', async () => {
    mockedAuth.mockResolvedValue(driver as never);
    await seedDriver();
    await seedVehicle({ id: 'VL001', status: 'AVAILABLE' });
    const res = await POST(jsonRequest('http://localhost/api/trips', 'POST', { ...baseBody, missionLeadName: '' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    const row = await db.execute({ sql: 'SELECT missionLeadName FROM Trip WHERE id = ?', args: [body.id] });
    expect(row.rows[0].missionLeadName).toBeNull();
  });

  it('retourne 400 au-delà de 120 caractères, sans créer de trajet', async () => {
    mockedAuth.mockResolvedValue(driver as never);
    await seedDriver();
    await seedVehicle({ id: 'VL001', status: 'AVAILABLE' });
    const res = await POST(jsonRequest('http://localhost/api/trips', 'POST', { ...baseBody, missionLeadName: 'x'.repeat(121) }));
    expect(res.status).toBe(400);
    const trips = await db.execute({ sql: 'SELECT id FROM Trip WHERE vehicleId = ?', args: ['VL001'] });
    expect(trips.rows).toHaveLength(0);
  });
});

describe('POST /api/qr/[token]/checkout — responsable de la mission', () => {
  it('enregistre le responsable et le renvoie dans la lecture QR', async () => {
    mockedAuth.mockResolvedValue(driver as never);
    await seedDriver();
    await seedVehicle({ id: 'VLQ', name: 'VL qr', type: 'VL', status: 'AVAILABLE', qrToken: 'tok-lead' });
    const res = await POST_QR_CHECKOUT(
      jsonRequest('http://localhost/api/qr/tok-lead/checkout', 'POST', { missionType: 'Logistique', conditionOut: 'Bon état', missionLeadName: 'Anne (CDPE)' }),
      { params: Promise.resolve({ token: 'tok-lead' }) },
    );
    expect(res.status).toBe(201);
    const read = await GET_QR_VEHICLE(new Request('http://localhost/api/qr/tok-lead/vehicle'), { params: Promise.resolve({ token: 'tok-lead' }) });
    const vehicle = await read.json();
    expect(vehicle.activeTrip.missionLeadName).toBe('Anne (CDPE)');
  });

  it('retourne 400 pour un responsable trop long', async () => {
    mockedAuth.mockResolvedValue(driver as never);
    await seedDriver();
    await seedVehicle({ id: 'VLQ2', name: 'VL qr2', type: 'VL', status: 'AVAILABLE', qrToken: 'tok-long' });
    const res = await POST_QR_CHECKOUT(
      jsonRequest('http://localhost/api/qr/tok-long/checkout', 'POST', { missionType: 'Logistique', conditionOut: 'Bon état', missionLeadName: 'x'.repeat(121) }),
      { params: Promise.resolve({ token: 'tok-long' }) },
    );
    expect(res.status).toBe(400);
  });
});

describe('GET /api/vehicles/[id] — responsable de la mission', () => {
  it('renvoie missionLeadName dans trips[]', async () => {
    mockedAuth.mockResolvedValue({ user: { id: 'adm', email: 'admin@test.com', roles: ['ADMIN'], ulId: UL } } as never);
    await seedDriver();
    await seedVehicle({ id: 'VLT', name: 'VL trips', type: 'VL', status: 'AVAILABLE' });
    await seedTrip({ id: 'trip-lead-get', vehicleId: 'VLT', driverId: 'user-driver', checkInAt: new Date().toISOString() });
    await db.execute({ sql: 'UPDATE Trip SET missionLeadName = ? WHERE id = ?', args: ['Paul D.', 'trip-lead-get'] });
    const res = await GET_VEHICLE(new Request('http://localhost/api/vehicles/VL%20trips'), { params: Promise.resolve({ id: 'VL trips' }) });
    const vehicle = await res.json();
    expect(vehicle.trips[0].missionLeadName).toBe('Paul D.');
  });
});

describe('Seuil carburant par UL', () => {
  const admin = { user: { id: 'adm', email: 'admin@test.com', roles: ['ADMIN'], ulId: UL } };

  it('PATCH /api/ul/[id] retourne 400 pour un seuil de 150', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'sa@test.com', roles: ['SUPER_ADMIN'] } } as never);
    const res = await PATCH_UL(jsonRequest(`http://localhost/api/ul/${UL}`, 'PATCH', { minFuelReturnPercent: 150 }), { params: Promise.resolve({ id: UL }) });
    expect(res.status).toBe(400);
  });

  it('PATCH /api/ul/[id] enregistre le seuil, GET /api/ul le renvoie', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'sa@test.com', roles: ['SUPER_ADMIN'] } } as never);
    const res = await PATCH_UL(jsonRequest(`http://localhost/api/ul/${UL}`, 'PATCH', { minFuelReturnPercent: 50 }), { params: Promise.resolve({ id: UL }) });
    expect(res.status).toBe(200);
    const list = await (await GET_ULS()).json();
    expect(list.uls.find((u: { id: string }) => u.id === UL).minFuelReturnPercent).toBe(50);
  });

  it('PATCH /api/ul/[id] accepte null (retour au défaut)', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'sa@test.com', roles: ['SUPER_ADMIN'] } } as never);
    await db.execute(`UPDATE "UniteLocale" SET minFuelReturnPercent = 50 WHERE id = '${UL}'`);
    const res = await PATCH_UL(jsonRequest(`http://localhost/api/ul/${UL}`, 'PATCH', { minFuelReturnPercent: null }), { params: Promise.resolve({ id: UL }) });
    expect(res.status).toBe(200);
    const row = await db.execute({ sql: 'SELECT minFuelReturnPercent FROM UniteLocale WHERE id = ?', args: [UL] });
    expect(row.rows[0].minFuelReturnPercent).toBeNull();
  });

  it('les fiches véhicule (interne et QR) renvoient 25 par défaut puis le seuil de l\'UL', async () => {
    await seedVehicle({ id: 'VLF', name: 'VL fuel', type: 'VL', status: 'AVAILABLE', qrToken: 'tok-fuel' });
    mockedAuth.mockResolvedValue(admin as never);

    const defInternal = await (await GET_VEHICLE(new Request('http://localhost/api/vehicles/VL%20fuel'), { params: Promise.resolve({ id: 'VL fuel' }) })).json();
    const defQr = await (await GET_QR_VEHICLE(new Request('http://localhost/api/qr/tok-fuel/vehicle'), { params: Promise.resolve({ token: 'tok-fuel' }) })).json();
    expect(defInternal.minFuelReturnPercent).toBe(25);
    expect(defQr.minFuelReturnPercent).toBe(25);

    await db.execute(`UPDATE "UniteLocale" SET minFuelReturnPercent = 50 WHERE id = '${UL}'`);
    const internal = await (await GET_VEHICLE(new Request('http://localhost/api/vehicles/VL%20fuel'), { params: Promise.resolve({ id: 'VL fuel' }) })).json();
    const qr = await (await GET_QR_VEHICLE(new Request('http://localhost/api/qr/tok-fuel/vehicle'), { params: Promise.resolve({ token: 'tok-fuel' }) })).json();
    expect(internal.minFuelReturnPercent).toBe(50);
    expect(qr.minFuelReturnPercent).toBe(50);
  });
});
