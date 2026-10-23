import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
  const { db } = await import('./setup');
  return { db };
});

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/vehicle-connection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/vehicle-connection')>()),
  getRenaultVehicleData: vi.fn().mockResolvedValue(null),
  isConnectedInDb: vi.fn().mockResolvedValue(false),
}));

// Désactive les notifications push pour éviter les envois Web Push en test
vi.mock('@/lib/push', () => ({
  sendPushNotification: vi.fn().mockResolvedValue(undefined),
  notifyRoles: vi.fn().mockResolvedValue(undefined),
}));

import { GET as GET_QR_DRIVERS } from '@/app/api/qr/[token]/drivers/route';
import { POST as POST_QR_CHECKOUT } from '@/app/api/qr/[token]/checkout/route';
import { POST as POST_QR_CHECKIN } from '@/app/api/qr/[token]/checkin/route';
import { GET as GET_QR_VEHICLE } from '@/app/api/qr/[token]/vehicle/route';
import { auth } from '@/auth';
import { db, seedVehicle, seedUser, seedRoles, seedUserRole } from './setup';

const mockedAuth = vi.mocked(auth);

function asUser(id: string, roles: string[] = []) {
  mockedAuth.mockResolvedValue({
    user: { id, name: id, email: `${id}@croix-rouge.fr`, roles, ulId: 'ul-paris-18' },
    expires: '2026-01-01',
  } as never);
}

function getDrivers(token: string) {
  return GET_QR_DRIVERS(new Request(`http://localhost/api/qr/${token}/drivers`), { params: Promise.resolve({ token }) });
}

function checkout(token: string, body: Record<string, unknown>) {
  return POST_QR_CHECKOUT(new Request(`http://localhost/api/qr/${token}/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ missionType: 'DPS', conditionOut: 'Bon état', ...body }),
  }), { params: Promise.resolve({ token }) });
}

describe('QR — 2ème conducteur', () => {
  beforeEach(async () => {
    mockedAuth.mockReset();
    await seedRoles(['SUPER_ADMIN', 'ADMIN', 'PRESIDENT', 'CADRE', 'CHVL', 'CHVPSP', 'INACTIF', 'GUEST']);
    await seedUser({ id: 'usr-me', email: 'me@croix-rouge.fr', name: 'Moi' });
    await seedUser({ id: 'usr-chvl', email: 'chvl@croix-rouge.fr', name: 'Alice CHVL' });
    await seedUser({ id: 'usr-chvpsp', email: 'chvpsp@croix-rouge.fr', name: 'Bruno CHVPSP' });
    await seedUser({ id: 'usr-inactif', email: 'inactif@croix-rouge.fr', name: 'Claire Inactive' });
    await seedUser({ id: 'usr-norole', email: 'norole@croix-rouge.fr', name: 'Denis Sans rôle' });
    await seedUserRole('usr-me', 'CHVL');
    await seedUserRole('usr-chvl', 'CHVL');
    await seedUserRole('usr-chvpsp', 'CHVPSP');
    await seedUserRole('usr-inactif', 'CHVL');
    await seedUserRole('usr-inactif', 'INACTIF');
    await seedUser({ id: 'usr-guest', email: 'guest@croix-rouge.fr', name: 'Gaston Guest' });
    await seedUserRole('usr-guest', 'CHVL');
    await seedUserRole('usr-guest', 'GUEST');
    await seedVehicle({ id: 'VL01', name: 'VL 01', type: 'VL', status: 'AVAILABLE', qrToken: 'tok-vl', ulId: 'ul-lyon' });
    await seedVehicle({ id: 'VPSP01', name: 'VPSP 01', type: 'VPSP', status: 'AVAILABLE', qrToken: 'tok-vpsp' });
  });

  describe('GET /api/qr/[token]/drivers', () => {
    it('returns 401 when not authenticated', async () => {
      mockedAuth.mockResolvedValue(null as never);
      expect((await getDrivers('tok-vl')).status).toBe(401);
    });

    it('returns 403 for an inactive account', async () => {
      asUser('usr-inactif', ['INACTIF']);
      expect((await getDrivers('tok-vl')).status).toBe(403);
    });

    it('returns 404 for an unknown token', async () => {
      asUser('usr-me', ['CHVL']);
      expect((await getDrivers('tok-inconnu')).status).toBe(404);
    });

    it("liste les CHVL pour un VL (toutes UL), sans l'utilisateur courant ni les comptes inactifs", async () => {
      asUser('usr-me', ['CHVL']);
      const res = await getDrivers('tok-vl');
      expect(res.status).toBe(200);
      const { users } = await res.json();
      expect(users).toEqual([{ id: 'usr-chvl', name: 'Alice CHVL', email: 'chvl@croix-rouge.fr' }]);
    });

    it('exclut les comptes portant le rôle hérité GUEST', async () => {
      asUser('usr-me', ['CHVL']);
      const { users } = await (await getDrivers('tok-vl')).json();
      expect(users.map((u: { id: string }) => u.id)).not.toContain('usr-guest');
    });

    it('liste les CHVPSP pour un VPSP, y compris pour un compte sans rôle', async () => {
      asUser('usr-norole', []);
      const { users } = await (await getDrivers('tok-vpsp')).json();
      expect(users.map((u: { id: string }) => u.id)).toEqual(['usr-chvpsp']);
    });
  });

  describe('POST /api/qr/[token]/checkout avec secondDriverId', () => {
    it('enregistre le 2ème conducteur, qui peut ensuite rendre le véhicule', async () => {
      asUser('usr-me', ['CHVL']);
      const res = await checkout('tok-vl', { secondDriverId: 'usr-chvl' });
      expect(res.status).toBe(201);
      const { tripId } = await res.json();

      const trip = await db.execute({ sql: `SELECT secondDriverId FROM Trip WHERE id = ?`, args: [tripId] });
      expect(trip.rows[0].secondDriverId).toBe('usr-chvl');

      // La page du QR code lit le 2ème conducteur via GET /api/qr/[token]/vehicle.
      const vehicleRes = await GET_QR_VEHICLE(new Request('http://localhost/api/qr/tok-vl/vehicle'), { params: Promise.resolve({ token: 'tok-vl' }) });
      const vehicle = await vehicleRes.json();
      expect(vehicle.activeTrip.secondDriverId).toBe('usr-chvl');
      expect(vehicle.activeTrip.secondDriverName).toBe('Alice CHVL');
      expect(vehicle.activeTrip.secondDriverEmail).toBe('chvl@croix-rouge.fr');

      asUser('usr-chvl', ['CHVL']);
      const checkin = await POST_QR_CHECKIN(new Request('http://localhost/api/qr/tok-vl/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mileageIn: 10010, fuelIn: 60, conditionIn: 'Bon état', cleanlinessIn: 'Propre' }),
      }), { params: Promise.resolve({ token: 'tok-vl' }) });
      expect(checkin.status).toBe(200);
    });

    it('returns 400 when the second driver is the borrower', async () => {
      asUser('usr-me', ['CHVL']);
      const res = await checkout('tok-vl', { secondDriverId: 'usr-me' });
      expect(res.status).toBe(400);
      const count = await db.execute(`SELECT COUNT(*) AS n FROM Trip`);
      expect(Number(count.rows[0].n)).toBe(0);
    });

    it('returns 400 when the second driver does not exist', async () => {
      asUser('usr-me', ['CHVL']);
      const res = await checkout('tok-vl', { secondDriverId: 'usr-fantome' });
      expect(res.status).toBe(400);
      const vehicle = await db.execute({ sql: `SELECT status FROM Vehicle WHERE id = ?`, args: ['VL01'] });
      expect(vehicle.rows[0].status).toBe('AVAILABLE');
    });

    it.each([
      ['INACTIF', 'usr-inactif'],
      ['GUEST (hérité)', 'usr-guest'],
      ['non habilité au type (CHVPSP sur un VL)', 'usr-chvpsp'],
      ['sans aucun rôle', 'usr-norole'],
    ])('returns 400 for a %s second driver, without creating a trip', async (_label, secondDriverId) => {
      asUser('usr-me', ['CHVL']);
      expect((await checkout('tok-vl', { secondDriverId })).status).toBe(400);
      const count = await db.execute(`SELECT COUNT(*) AS n FROM Trip`);
      expect(Number(count.rows[0].n)).toBe(0);
    });

    it("accepte un 2ème conducteur d'une autre UL (choix « toutes UL »)", async () => {
      asUser('usr-me', ['CHVL']);
      // Le VL est rattaché à ul-lyon, la session à ul-paris-18 : le parcours QR ne cloisonne pas.
      expect((await checkout('tok-vl', { secondDriverId: 'usr-chvl' })).status).toBe(201);
    });

    it('returns 400 when secondDriverId is an empty string (Zod)', async () => {
      asUser('usr-me', ['CHVL']);
      expect((await checkout('tok-vl', { secondDriverId: '' })).status).toBe(400);
    });
  });
});
