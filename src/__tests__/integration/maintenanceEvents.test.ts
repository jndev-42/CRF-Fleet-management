import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
  const { db } = await import('./setup');
  return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { POST, PATCH } from '@/app/api/vehicles/[id]/maintenance-events/route';
import { GET as GETVehicle } from '@/app/api/vehicles/[id]/route';
import { GET as GETVehicles } from '@/app/api/vehicles/route';
import { auth } from '@/auth';
import { db, seedVehicle, seedUser } from './setup';

const mockedAuth = vi.mocked(auth);

function makePostRequest(vehicleName: string, body: unknown): Request {
  return new Request(`http://localhost/api/vehicles/${vehicleName}/maintenance-events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makePatchRequest(vehicleName: string): Request {
  return new Request(`http://localhost/api/vehicles/${vehicleName}/maintenance-events`, {
    method: 'PATCH',
  });
}

beforeEach(async () => {
  await seedUser({ id: 'user-admin', email: 'admin@dev.local', name: 'Admin User', roles: ['ADMIN'], ulId: 'ul-paris' });
  await seedUser({ id: 'user-benevole', email: 'benevole@dev.local', name: 'Benevole User', roles: ['BENEVOLE'], ulId: 'ul-paris' });
  await seedVehicle({ id: 'v-1', name: 'VSAV 01', plate: 'AB-123-CD', status: 'AVAILABLE', ulId: 'ul-paris' });
});

describe('POST /api/vehicles/[id]/maintenance-events', () => {
  it('returns 401 if unauthenticated', async () => {
    // @ts-expect-error null session for test
    mockedAuth.mockResolvedValue(null);
    const res = await POST(makePostRequest('VSAV 01', { startDate: '2026-07-22', reason: 'Test' }), {
      params: Promise.resolve({ id: 'VSAV 01' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 403 if user is not admin', async () => {
    mockedAuth.mockResolvedValue({
      user: { email: 'benevole@dev.local', roles: ['BENEVOLE'], ulId: 'ul-paris' },
    } as never);
    const res = await POST(makePostRequest('VSAV 01', { startDate: '2026-07-22', reason: 'Test' }), {
      params: Promise.resolve({ id: 'VSAV 01' }),
    });
    expect(res.status).toBe(403);
  });

  it('returns 400 if reason or startDate is missing', async () => {
    mockedAuth.mockResolvedValue({
      user: { email: 'admin@dev.local', roles: ['ADMIN'], ulId: 'ul-paris' },
    } as never);
    const res = await POST(makePostRequest('VSAV 01', { startDate: '', reason: '' }), {
      params: Promise.resolve({ id: 'VSAV 01' }),
    });
    expect(res.status).toBe(400);
  });

  it('creates maintenance event and updates vehicle status to MAINTENANCE', async () => {
    mockedAuth.mockResolvedValue({
      user: { email: 'admin@dev.local', roles: ['ADMIN'], ulId: 'ul-paris' },
    } as never);

    const res = await POST(
      makePostRequest('VSAV 01', {
        startDate: '2026-07-22',
        endDate: '2026-07-25',
        reason: 'Changement de pneus',
      }),
      { params: Promise.resolve({ id: 'VSAV 01' }) }
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.maintenance.reason).toBe('Changement de pneus');
    expect(json.maintenance.startDate).toContain('2026-07-22');
    expect(json.maintenance.endDate).toContain('2026-07-25');

    // Check DB side effects
    const v = await db.execute({ sql: `SELECT status FROM "Vehicle" WHERE id = 'v-1'`, args: [] });
    expect(v.rows[0].status).toBe('MAINTENANCE');

    const m = await db.execute({ sql: `SELECT * FROM "VehicleMaintenance" WHERE vehicleId = 'v-1'`, args: [] });
    expect(m.rows).toHaveLength(1);
    expect(m.rows[0].reason).toBe('Changement de pneus');
  });

  it('does NOT set vehicle status to MAINTENANCE immediately if start date is in the future', async () => {
    mockedAuth.mockResolvedValue({
      user: { email: 'admin@dev.local', roles: ['ADMIN'], ulId: 'ul-paris' },
    } as never);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 5);
    const futureDate = tomorrow.toISOString().split('T')[0];

    const res = await POST(
      makePostRequest('VSAV 01', {
        startDate: futureDate,
        endDate: null,
        reason: 'Maintenance future prévue dans 5 jours',
      }),
      { params: Promise.resolve({ id: 'VSAV 01' }) }
    );

    expect(res.status).toBe(201);

    // Vehicle status should remain AVAILABLE today since start date is in the future
    const v = await db.execute({ sql: `SELECT status FROM "Vehicle" WHERE id = 'v-1'`, args: [] });
    expect(v.rows[0].status).toBe('AVAILABLE');
  });

  it('handles unknown end date (endDate = null)', async () => {
    mockedAuth.mockResolvedValue({
      user: { email: 'admin@dev.local', roles: ['ADMIN'], ulId: 'ul-paris' },
    } as never);

    const res = await POST(
      makePostRequest('VSAV 01', {
        startDate: '2026-07-22',
        endDate: null,
        reason: 'Panne moteur grave',
      }),
      { params: Promise.resolve({ id: 'VSAV 01' }) }
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.maintenance.endDate).toBeNull();
  });
});

describe('PATCH /api/vehicles/[id]/maintenance-events', () => {
  it('ends active maintenance, sets endDate to today, and updates vehicle status to AVAILABLE', async () => {
    mockedAuth.mockResolvedValue({
      user: { email: 'admin@dev.local', roles: ['ADMIN'], ulId: 'ul-paris' },
    } as never);

    // First put in maintenance
    await POST(
      makePostRequest('VSAV 01', {
        startDate: '2026-07-20',
        endDate: null,
        reason: 'Révision Renault',
      }),
      { params: Promise.resolve({ id: 'VSAV 01' }) }
    );

    // Now end maintenance
    const res = await PATCH(makePatchRequest('VSAV 01'), {
      params: Promise.resolve({ id: 'VSAV 01' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.endDate).toContain(new Date().toISOString().split('T')[0]);

    // Check DB side effects
    const v = await db.execute({ sql: `SELECT status FROM "Vehicle" WHERE id = 'v-1'`, args: [] });
    expect(v.rows[0].status).toBe('AVAILABLE');

    const m = await db.execute({ sql: `SELECT endDate FROM "VehicleMaintenance" WHERE vehicleId = 'v-1'`, args: [] });
    expect(m.rows[0].endDate).toContain(new Date().toISOString().split('T')[0]);

    // Verify GET /api/vehicles/[id] preserves status AVAILABLE and activeMaintenance is null
    const getRes = await GETVehicle(new Request('http://localhost/api/vehicles/VSAV%2001'), {
      params: Promise.resolve({ id: 'VSAV 01' }),
    });
    expect(getRes.status).toBe(200);
    const getJson = await getRes.json();
    expect(getJson.status).toBe('AVAILABLE');
    expect(getJson.activeMaintenance).toBeNull();

    // Verify GET /api/vehicles list also returns status AVAILABLE
    const listRes = await GETVehicles(new Request('http://localhost/api/vehicles'));
    expect(listRes.status).toBe(200);
    const listJson = await listRes.json();
    const v1 = listJson.find((v: { id: string }) => v.id === 'v-1');
    expect(v1.status).toBe('AVAILABLE');
  });
});

// ── Maintenance sur véhicule emprunté — flag parallèle au statut ───────────────
// `GET /api/vehicles/[id]` auto-répare `Vehicle.status` : chaque critère portant sur
// le statut est donc asserté par SELECT direct D'ABORD, la forme du payload ensuite.
describe('maintenance active sur un véhicule IN_USE', () => {
  const adminSession = { user: { email: 'admin@dev.local', roles: ['ADMIN'], ulId: 'ul-paris' } };

  /** Statut réellement persisté en base. */
  async function readStatus(vehicleId: string): Promise<string> {
    const res = await db.execute({ sql: `SELECT status FROM "Vehicle" WHERE id = ?`, args: [vehicleId] });
    return res.rows[0].status as string;
  }

  async function seedOpenMaintenance(vehicleId = 'v-1') {
    await db.execute({
      sql: `INSERT INTO "VehicleMaintenance" (id, vehicleId, startDate, endDate, reason)
            VALUES (?, ?, ?, NULL, ?)`,
      args: ['m-open', vehicleId, new Date(Date.now() - 86_400_000).toISOString(), 'Panne embrayage'],
    });
  }

  async function seedOpenTrip(vehicleId = 'v-1') {
    await seedUser({ id: 'user-driver', email: 'driver@dev.local', name: 'Test Driver' });
    await db.execute({
      sql: `INSERT INTO "Trip" (id, vehicleId, driverId, missionType, checkOutAt, conditionOut, mileageOut, fuelOut, checkInAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      args: ['trip-open', vehicleId, 'user-driver', 'LOGISTIQUE', new Date().toISOString(), 'BON', 10000, 75],
    });
  }

  function getVehicle() {
    return GETVehicle(new Request('http://localhost/api/vehicles/VSAV%2001'), {
      params: Promise.resolve({ id: 'VSAV 01' }),
    });
  }

  beforeEach(() => {
    mockedAuth.mockResolvedValue(adminSession as never);
  });

  it('expose activeMaintenance sans écraser le statut IN_USE, et n\'écrit rien en base', async () => {
    await db.execute({ sql: `UPDATE "Vehicle" SET status = 'IN_USE' WHERE id = 'v-1'`, args: [] });
    await seedOpenMaintenance();

    const res = await getVehicle();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.activeMaintenance).not.toBeNull();
    expect(json.activeMaintenance.reason).toBe('Panne embrayage');
    expect(json.status).toBe('IN_USE');

    // Aucun UPDATE : la colonne reste telle quelle après le GET.
    expect(await readStatus('v-1')).toBe('IN_USE');
  });

  it('bascule en MAINTENANCE — et le persiste — une fois le véhicule rendu', async () => {
    await db.execute({ sql: `UPDATE "Vehicle" SET status = 'IN_USE' WHERE id = 'v-1'`, args: [] });
    await seedOpenMaintenance();

    // Effet du check-in : la route de restitution repasse la colonne à 'AVAILABLE'.
    await db.execute({ sql: `UPDATE "Vehicle" SET status = 'AVAILABLE' WHERE id = 'v-1'`, args: [] });

    const res = await getVehicle();
    const json = await res.json();
    expect(json.status).toBe('MAINTENANCE');
    expect(json.activeMaintenance).not.toBeNull();

    // Read-repair persisté, pas seulement projeté.
    expect(await readStatus('v-1')).toBe('MAINTENANCE');
  });

  it('la liste /api/vehicles expose hasActiveMaintenance à côté du statut IN_USE', async () => {
    await db.execute({ sql: `UPDATE "Vehicle" SET status = 'IN_USE' WHERE id = 'v-1'`, args: [] });
    await seedOpenMaintenance();

    const listRes = await GETVehicles(new Request('http://localhost/api/vehicles'));
    expect(listRes.status).toBe(200);
    const listJson = await listRes.json();
    const v1 = listJson.find((v: { id: string }) => v.id === 'v-1');
    expect(v1.status).toBe('IN_USE');
    expect(v1.hasActiveMaintenance).toBe(true);
  });

  it('la liste expose hasActiveMaintenance false en l\'absence de maintenance', async () => {
    const listRes = await GETVehicles(new Request('http://localhost/api/vehicles'));
    const listJson = await listRes.json();
    const v1 = listJson.find((v: { id: string }) => v.id === 'v-1');
    expect(v1.status).toBe('AVAILABLE');
    expect(v1.hasActiveMaintenance).toBe(false);
  });

  it('PATCH de collection (remise en service) ne libère pas un véhicule emprunté', async () => {
    await db.execute({ sql: `UPDATE "Vehicle" SET status = 'IN_USE' WHERE id = 'v-1'`, args: [] });
    await seedOpenMaintenance();
    await seedOpenTrip();

    const res = await PATCH(makePatchRequest('VSAV 01'), { params: Promise.resolve({ id: 'VSAV 01' }) });
    expect(res.status).toBe(200);

    // La clause `AND status != 'IN_USE'` protège le véhicule physiquement dehors.
    expect(await readStatus('v-1')).toBe('IN_USE');
  });

  it('POST de collection sur un véhicule emprunté n\'écrase pas IN_USE (étape 8bis)', async () => {
    // État construit PAR LA ROUTE, pas par un `db.execute` de seed : c'est la seule
    // façon d'exercer l'écriture de `maintenance-events/route.ts` que ce cas couvre.
    await db.execute({ sql: `UPDATE "Vehicle" SET status = 'IN_USE' WHERE id = 'v-1'`, args: [] });
    await seedOpenTrip();

    const res = await POST(
      makePostRequest('VSAV 01', {
        startDate: new Date().toISOString(),
        endDate: null,
        reason: 'Immobilisation en cours de mission',
      }),
      { params: Promise.resolve({ id: 'VSAV 01' }) }
    );
    expect(res.status).toBe(201);

    // SQL DIRECT D'ABORD.
    expect(await readStatus('v-1')).toBe('IN_USE');

    // Puis la forme exposée : les deux informations coexistent.
    const getRes = await getVehicle();
    const getJson = await getRes.json();
    expect(getJson.activeMaintenance).not.toBeNull();
    expect(getJson.status).toBe('IN_USE');

    // Et le GET n'a toujours rien écrasé.
    expect(await readStatus('v-1')).toBe('IN_USE');
  });
});

// ── Cloisonnement UL des routes de collection ─────────────────────────────────
// `seedUser` accepte mais ne persiste PAS `ulId` (setup.ts) : le 403 inter-UL est donc
// produit par la SESSION MOCKÉE (`ulId: 'ul-lyon'`) confrontée au `ulId` du véhicule,
// que `seedVehicle`, lui, persiste bien (`v-1` → 'ul-paris').
describe('cloisonnement UL de /api/vehicles/[id]/maintenance-events', () => {
  const adminLyonSession = {
    user: { id: 'user-admin-lyon', email: 'admin-lyon@dev.local', roles: ['ADMIN'], ulId: 'ul-lyon' },
  };
  const superAdminLyonSession = {
    user: { id: 'user-super', email: 'super@dev.local', roles: ['SUPER_ADMIN'], ulId: 'ul-lyon' },
  };

  /** Statut réellement persisté — jamais lu via `GET /api/vehicles/[id]` (auto-réparation). */
  async function readStatus(vehicleId: string): Promise<string> {
    const res = await db.execute({ sql: `SELECT status FROM "Vehicle" WHERE id = ?`, args: [vehicleId] });
    return res.rows[0].status as string;
  }

  beforeEach(async () => {
    await seedUser({ id: 'user-admin-lyon', email: 'admin-lyon@dev.local', name: 'Admin Lyon', roles: ['ADMIN'] });
    await seedUser({ id: 'user-super', email: 'super@dev.local', name: 'Super Admin', roles: ['SUPER_ADMIN'] });
  });

  it('POST renvoie 403 pour un ADMIN d\'une autre UL et n\'écrit rien', async () => {
    mockedAuth.mockResolvedValue(adminLyonSession as never);

    const res = await POST(
      makePostRequest('VSAV 01', { startDate: '2026-07-22', endDate: null, reason: 'Immobilisation hostile' }),
      { params: Promise.resolve({ id: 'VSAV 01' }) }
    );
    expect(res.status).toBe(403);

    // Ni ligne de maintenance, ni bascule de statut.
    const m = await db.execute({ sql: `SELECT id FROM "VehicleMaintenance" WHERE vehicleId = 'v-1'`, args: [] });
    expect(m.rows).toHaveLength(0);
    expect(await readStatus('v-1')).toBe('AVAILABLE');
  });

  it('PATCH renvoie 403 pour un ADMIN d\'une autre UL et laisse la maintenance ouverte', async () => {
    // Maintenance ouverte posée par l'ADMIN légitime de l'UL propriétaire.
    mockedAuth.mockResolvedValue({
      user: { email: 'admin@dev.local', roles: ['ADMIN'], ulId: 'ul-paris' },
    } as never);
    await POST(
      makePostRequest('VSAV 01', { startDate: '2026-07-20', endDate: null, reason: 'Révision Renault' }),
      { params: Promise.resolve({ id: 'VSAV 01' }) }
    );
    expect(await readStatus('v-1')).toBe('MAINTENANCE');

    mockedAuth.mockResolvedValue(adminLyonSession as never);
    const res = await PATCH(makePatchRequest('VSAV 01'), { params: Promise.resolve({ id: 'VSAV 01' }) });
    expect(res.status).toBe(403);

    // La maintenance n'est pas clôturée et le véhicule reste immobilisé.
    const m = await db.execute({
      sql: `SELECT endDate FROM "VehicleMaintenance" WHERE vehicleId = 'v-1'`,
      args: [],
    });
    expect(m.rows).toHaveLength(1);
    expect(m.rows[0].endDate).toBeNull();
    expect(await readStatus('v-1')).toBe('MAINTENANCE');
  });

  it('POST reste autorisé pour un SUPER_ADMIN hors UL du véhicule', async () => {
    mockedAuth.mockResolvedValue(superAdminLyonSession as never);

    const res = await POST(
      makePostRequest('VSAV 01', { startDate: '2026-07-22', endDate: null, reason: 'Contrôle national' }),
      { params: Promise.resolve({ id: 'VSAV 01' }) }
    );
    expect(res.status).toBe(201);
    expect(await readStatus('v-1')).toBe('MAINTENANCE');

    // Et la remise en service l'est aussi.
    const patchRes = await PATCH(makePatchRequest('VSAV 01'), { params: Promise.resolve({ id: 'VSAV 01' }) });
    expect(patchRes.status).toBe(200);
    expect(await readStatus('v-1')).toBe('AVAILABLE');
  });

  /**
   * Sentinelle d'UL. La comparaison brute `session.user.ulId !== vehicleRow.ulId`
   * autorisait l'égalité de deux PLACEHOLDERS : une session non rattachée (`ulId`
   * absent, ou épinglé à `'default'`) « appartenait » à tout véhicule portant la même
   * valeur. `isOutsideUl` refuse ces valeurs AVANT toute comparaison.
   */
  describe('sentinelle d\'UL', () => {
    it('POST refuse une session épinglée à \'default\' face à un véhicule portant le même placeholder', async () => {
      await seedVehicle({ id: 'v-default', name: 'VL SENTINELLE', plate: 'ZZ-999-ZZ', status: 'AVAILABLE', ulId: 'default' });
      mockedAuth.mockResolvedValue({
        user: { id: 'user-admin', email: 'admin@dev.local', roles: ['ADMIN'], ulId: 'default' },
      } as never);

      const res = await POST(
        makePostRequest('VL SENTINELLE', { startDate: '2026-07-22', endDate: null, reason: 'Immobilisation via sentinelle' }),
        { params: Promise.resolve({ id: 'VL SENTINELLE' }) }
      );
      expect(res.status).toBe(403);

      const m = await db.execute({ sql: `SELECT id FROM "VehicleMaintenance" WHERE vehicleId = 'v-default'`, args: [] });
      expect(m.rows).toHaveLength(0);
      expect(await readStatus('v-default')).toBe('AVAILABLE');
    });

    it('POST refuse une session sans ulId du tout', async () => {
      mockedAuth.mockResolvedValue({
        user: { id: 'user-admin', email: 'admin@dev.local', roles: ['ADMIN'] },
      } as never);

      const res = await POST(
        makePostRequest('VSAV 01', { startDate: '2026-07-22', endDate: null, reason: 'Sans UL' }),
        { params: Promise.resolve({ id: 'VSAV 01' }) }
      );
      expect(res.status).toBe(403);
      expect(await readStatus('v-1')).toBe('AVAILABLE');
    });

    it('PATCH refuse une session épinglée à \'default\' face au même placeholder', async () => {
      await seedVehicle({ id: 'v-default', name: 'VL SENTINELLE', plate: 'ZZ-999-ZZ', status: 'MAINTENANCE', ulId: 'default' });
      mockedAuth.mockResolvedValue({
        user: { id: 'user-admin', email: 'admin@dev.local', roles: ['ADMIN'], ulId: 'default' },
      } as never);

      const res = await PATCH(makePatchRequest('VL SENTINELLE'), { params: Promise.resolve({ id: 'VL SENTINELLE' }) });
      expect(res.status).toBe(403);
      // La remise en service n'a pas eu lieu.
      expect(await readStatus('v-default')).toBe('MAINTENANCE');
    });
  });
});
