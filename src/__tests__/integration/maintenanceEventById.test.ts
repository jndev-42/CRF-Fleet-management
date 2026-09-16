/**
 * Tests d'intégration des routes `PATCH` / `DELETE`
 * `/api/vehicles/[id]/maintenance-events/[eventId]` (étape 6 du plan).
 *
 * Stratégie : handlers Next.js appelés directement avec de vrais `Request`, DB SQLite
 * réelle de `./setup.ts`, seule la session (`@/auth`) et les services externes sont mockés.
 *
 * ⚠️ RÈGLE D'ASSERTION. Tout critère portant sur `Vehicle.status` est asserté par
 * `SELECT status FROM Vehicle WHERE id = ?` en SQL direct. `GET /api/vehicles/[id]` est
 * la seule route qui auto-répare la colonne : passer par elle ferait verdir un test sur
 * un état incohérent en base. Quand une ligne vérifie aussi la forme du payload, le
 * SELECT vient EN PREMIER, le GET ensuite.
 *
 * ⚠️ CLOISONNEMENT UL. `seedUser` accepte mais ne persiste PAS `ulId` (la table "User"
 * du schéma de test n'a pas cette colonne, cf. setup.ts). Le 403 inter-UL est donc
 * produit uniquement par la SESSION MOCKÉE (`ulId: 'ul-lyon'`) confrontée au `ulId` du
 * véhicule, que `seedVehicle`, lui, persiste bien.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
  const { db } = await import('./setup');
  return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

// Chaîne bout-en-bout : `POST /api/trips` est appelé en fin de fichier. Aucun appel
// réseau réel — véhicule non connecté, notifications désactivées.
vi.mock('@/lib/vehicle-connection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/vehicle-connection')>()),
  getRenaultVehicleData: vi.fn().mockResolvedValue(null),
  isConnectedInDb: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/lib/onesignal', () => ({
  sendPushNotification: vi.fn().mockResolvedValue(undefined),
  notifyRoles: vi.fn().mockResolvedValue(undefined),
}));

import { PATCH, DELETE } from '@/app/api/vehicles/[id]/maintenance-events/[eventId]/route';
import { POST as POSTMaintenance } from '@/app/api/vehicles/[id]/maintenance-events/route';
import { POST as POSTTrip } from '@/app/api/trips/route';
import { GET as GETVehicle } from '@/app/api/vehicles/[id]/route';
import { auth } from '@/auth';
import { db, seedVehicle, seedUser } from './setup';

const mockedAuth = vi.mocked(auth);

const DAY = 24 * 60 * 60 * 1000;

const adminParisSession = {
  user: { id: 'user-admin', email: 'admin@dev.local', name: 'Admin Paris', roles: ['ADMIN'], ulId: 'ul-paris' },
};
const benevoleParisSession = {
  user: { id: 'user-benevole', email: 'benevole@dev.local', name: 'Benevole', roles: ['BENEVOLE'], ulId: 'ul-paris' },
};
const adminLyonSession = {
  user: { id: 'user-admin-lyon', email: 'admin-lyon@dev.local', name: 'Admin Lyon', roles: ['ADMIN'], ulId: 'ul-lyon' },
};
const driverParisSession = {
  user: { id: 'user-driver', email: 'driver@dev.local', name: 'Test Driver', roles: ['CHVL'], ulId: 'ul-paris' },
};

function makePatchRequest(vehicleName: string, eventId: string, body: unknown): Request {
  return new Request(
    `http://localhost/api/vehicles/${encodeURIComponent(vehicleName)}/maintenance-events/${eventId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}

function makeDeleteRequest(vehicleName: string, eventId: string): Request {
  return new Request(
    `http://localhost/api/vehicles/${encodeURIComponent(vehicleName)}/maintenance-events/${eventId}`,
    { method: 'DELETE' },
  );
}

function ctx(id: string, eventId: string) {
  return { params: Promise.resolve({ id, eventId }) };
}

async function seedMaintenance(m: {
  id: string;
  vehicleId: string;
  startDate: string;
  endDate: string | null;
  reason: string;
}) {
  await db.execute({
    sql: `INSERT INTO "VehicleMaintenance" (id, vehicleId, startDate, endDate, reason)
          VALUES (?, ?, ?, ?, ?)`,
    args: [m.id, m.vehicleId, m.startDate, m.endDate, m.reason],
  });
  return m;
}

/** Statut réellement persisté — jamais lu via `GET /api/vehicles/[id]` (auto-réparation). */
async function readStatus(vehicleId: string): Promise<string> {
  const res = await db.execute({ sql: `SELECT status FROM "Vehicle" WHERE id = ?`, args: [vehicleId] });
  return res.rows[0].status as string;
}

async function readMaintenance(eventId: string) {
  const res = await db.execute({
    sql: `SELECT id, startDate, endDate, reason FROM "VehicleMaintenance" WHERE id = ?`,
    args: [eventId],
  });
  return res.rows[0] ?? null;
}

beforeEach(async () => {
  vi.clearAllMocks();

  await seedUser({ id: 'user-admin', email: 'admin@dev.local', name: 'Admin Paris' });
  await seedUser({ id: 'user-benevole', email: 'benevole@dev.local', name: 'Benevole' });
  await seedUser({ id: 'user-admin-lyon', email: 'admin-lyon@dev.local', name: 'Admin Lyon' });
  await seedUser({ id: 'user-driver', email: 'driver@dev.local', name: 'Test Driver' });

  // `v-1` porte `m-open` active : son statut persisté cohérent est donc 'MAINTENANCE'.
  await seedVehicle({ id: 'v-1', name: 'VSAV 01', plate: 'AB-123-CD', status: 'MAINTENANCE', ulId: 'ul-paris' });
  await seedVehicle({ id: 'v-2', name: 'VSAV 02', plate: 'EF-456-GH', status: 'AVAILABLE', ulId: 'ul-lyon' });
  // Véhicule vierge (aucune ligne de maintenance) réservé à la chaîne bout-en-bout.
  await seedVehicle({ id: 'v-3', name: 'VL 03', plate: 'IJ-789-KL', status: 'AVAILABLE', ulId: 'ul-paris' });

  await seedMaintenance({
    id: 'm-open',
    vehicleId: 'v-1',
    startDate: new Date(Date.now() - DAY).toISOString(),
    endDate: null,
    reason: 'Panne embrayage',
  });
  await seedMaintenance({
    id: 'm-future',
    vehicleId: 'v-1',
    startDate: new Date(Date.now() + 3 * DAY).toISOString(),
    endDate: new Date(Date.now() + 5 * DAY).toISOString(),
    reason: 'Révision programmée',
  });
  await seedMaintenance({
    id: 'm-closed',
    vehicleId: 'v-1',
    startDate: new Date(Date.now() - 5 * DAY).toISOString(),
    endDate: new Date(Date.now() - 2 * DAY).toISOString(),
    reason: 'Contrôle technique passé',
  });
});

describe('PATCH /api/vehicles/[id]/maintenance-events/[eventId]', () => {
  it('returns 401 when not authenticated', async () => {
    // @ts-expect-error — null session for test
    mockedAuth.mockResolvedValue(null);
    const res = await PATCH(makePatchRequest('VSAV 01', 'm-open', { reason: 'X' }), ctx('VSAV 01', 'm-open'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when the user is not admin', async () => {
    mockedAuth.mockResolvedValue(benevoleParisSession as never);
    const res = await PATCH(makePatchRequest('VSAV 01', 'm-open', { reason: 'X' }), ctx('VSAV 01', 'm-open'));
    expect(res.status).toBe(403);
  });

  it('returns 403 for an ADMIN of another UL (cloisonnement, depuis la session mockée)', async () => {
    mockedAuth.mockResolvedValue(adminLyonSession as never);
    const res = await PATCH(makePatchRequest('VSAV 01', 'm-open', { reason: 'X' }), ctx('VSAV 01', 'm-open'));
    expect(res.status).toBe(403);

    // Rien n'a bougé en base.
    const row = await readMaintenance('m-open');
    expect(row?.reason).toBe('Panne embrayage');
  });

  it('returns 400 for an empty body (aucun champ à modifier)', async () => {
    mockedAuth.mockResolvedValue(adminParisSession as never);
    const res = await PATCH(makePatchRequest('VSAV 01', 'm-open', {}), ctx('VSAV 01', 'm-open'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Données invalides');
  });

  it('returns 400 for an empty reason', async () => {
    mockedAuth.mockResolvedValue(adminParisSession as never);
    const res = await PATCH(makePatchRequest('VSAV 01', 'm-open', { reason: '' }), ctx('VSAV 01', 'm-open'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Données invalides');
  });

  it('returns 400 when startDate is after endDate', async () => {
    mockedAuth.mockResolvedValue(adminParisSession as never);
    const res = await PATCH(
      makePatchRequest('VSAV 01', 'm-open', {
        startDate: new Date(Date.now() + 5 * DAY).toISOString(),
        endDate: new Date(Date.now() + DAY).toISOString(),
      }),
      ctx('VSAV 01', 'm-open'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/postérieure à la date de début/i);
  });

  it('returns 404 when the vehicle does not exist', async () => {
    mockedAuth.mockResolvedValue(adminParisSession as never);
    const res = await PATCH(makePatchRequest('INEXISTANT', 'm-open', { reason: 'X' }), ctx('INEXISTANT', 'm-open'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Véhicule non trouvé');
  });

  it('returns 404 when the event belongs to another vehicle', async () => {
    // Session Lyon : `v-2` est bien son véhicule, mais `m-open` appartient à `v-1`.
    mockedAuth.mockResolvedValue(adminLyonSession as never);
    const res = await PATCH(makePatchRequest('VSAV 02', 'm-open', { reason: 'X' }), ctx('VSAV 02', 'm-open'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Maintenance non trouvée');
  });

  it('returns 409 on a finished maintenance and leaves the row untouched', async () => {
    mockedAuth.mockResolvedValue(adminParisSession as never);
    const res = await PATCH(
      makePatchRequest('VSAV 01', 'm-closed', { reason: 'Tentative de modification' }),
      ctx('VSAV 01', 'm-closed'),
    );
    expect(res.status).toBe(409);

    const row = await readMaintenance('m-closed');
    expect(row?.reason).toBe('Contrôle technique passé');
  });

  it('returns 200 and persists the new reason on an ongoing maintenance', async () => {
    mockedAuth.mockResolvedValue(adminParisSession as never);
    const res = await PATCH(
      makePatchRequest('VSAV 01', 'm-open', { reason: 'Panne embrayage — pièce commandée' }),
      ctx('VSAV 01', 'm-open'),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);

    const row = await readMaintenance('m-open');
    expect(row?.reason).toBe('Panne embrayage — pièce commandée');
  });

  it('returns 200 and persists a shifted startDate on a future maintenance', async () => {
    mockedAuth.mockResolvedValue(adminParisSession as never);
    const newStart = new Date(Date.now() + 4 * DAY).toISOString();
    const res = await PATCH(
      makePatchRequest('VSAV 01', 'm-future', { startDate: newStart }),
      ctx('VSAV 01', 'm-future'),
    );
    expect(res.status).toBe(200);

    const row = await readMaintenance('m-future');
    expect(row?.startDate).toBe(newStart);
    // Les champs non fournis sont conservés.
    expect(row?.reason).toBe('Révision programmée');
  });
});

describe('DELETE /api/vehicles/[id]/maintenance-events/[eventId]', () => {
  it('returns 401 when not authenticated', async () => {
    // @ts-expect-error — null session for test
    mockedAuth.mockResolvedValue(null);
    const res = await DELETE(makeDeleteRequest('VSAV 01', 'm-open'), ctx('VSAV 01', 'm-open'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when the user is not admin', async () => {
    mockedAuth.mockResolvedValue(benevoleParisSession as never);
    const res = await DELETE(makeDeleteRequest('VSAV 01', 'm-open'), ctx('VSAV 01', 'm-open'));
    expect(res.status).toBe(403);
    expect(await readMaintenance('m-open')).not.toBeNull();
  });

  it('returns 403 for an ADMIN of another UL', async () => {
    mockedAuth.mockResolvedValue(adminLyonSession as never);
    const res = await DELETE(makeDeleteRequest('VSAV 01', 'm-open'), ctx('VSAV 01', 'm-open'));
    expect(res.status).toBe(403);
    expect(await readMaintenance('m-open')).not.toBeNull();
  });

  it('returns 404 when the vehicle does not exist', async () => {
    mockedAuth.mockResolvedValue(adminParisSession as never);
    const res = await DELETE(makeDeleteRequest('INEXISTANT', 'm-open'), ctx('INEXISTANT', 'm-open'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when the event belongs to another vehicle', async () => {
    mockedAuth.mockResolvedValue(adminLyonSession as never);
    const res = await DELETE(makeDeleteRequest('VSAV 02', 'm-open'), ctx('VSAV 02', 'm-open'));
    expect(res.status).toBe(404);
    expect(await readMaintenance('m-open')).not.toBeNull();
  });

  it('returns 409 on a finished maintenance and keeps the row', async () => {
    mockedAuth.mockResolvedValue(adminParisSession as never);
    const res = await DELETE(makeDeleteRequest('VSAV 01', 'm-closed'), ctx('VSAV 01', 'm-closed'));
    expect(res.status).toBe(409);
    expect(await readMaintenance('m-closed')).not.toBeNull();
  });

  it('returns 200 and removes an ongoing maintenance', async () => {
    mockedAuth.mockResolvedValue(adminParisSession as never);
    const res = await DELETE(makeDeleteRequest('VSAV 01', 'm-open'), ctx('VSAV 01', 'm-open'));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(await readMaintenance('m-open')).toBeNull();
  });

  it('returns 200 and removes a future maintenance', async () => {
    mockedAuth.mockResolvedValue(adminParisSession as never);
    const res = await DELETE(makeDeleteRequest('VSAV 01', 'm-future'), ctx('VSAV 01', 'm-future'));
    expect(res.status).toBe(200);
    expect(await readMaintenance('m-future')).toBeNull();
  });
});

// ── Convergence du statut — assertions SQL directes (BLOCKER 1) ────────────────
describe('convergence de Vehicle.status après mutation de maintenance', () => {
  it("DELETE de la maintenance en cours sur un véhicule non emprunté → statut 'AVAILABLE'", async () => {
    mockedAuth.mockResolvedValue(adminParisSession as never);
    expect(await readStatus('v-1')).toBe('MAINTENANCE');

    const res = await DELETE(makeDeleteRequest('VSAV 01', 'm-open'), ctx('VSAV 01', 'm-open'));
    expect(res.status).toBe(200);

    expect(await readStatus('v-1')).toBe('AVAILABLE');
  });

  it("DELETE de la maintenance en cours sur un véhicule emprunté → statut 'IN_USE' préservé", async () => {
    mockedAuth.mockResolvedValue(adminParisSession as never);

    // Véhicule physiquement dehors : statut IN_USE + trajet ouvert.
    await db.execute({ sql: `UPDATE "Vehicle" SET status = 'IN_USE' WHERE id = 'v-1'`, args: [] });
    await db.execute({
      sql: `INSERT INTO "Trip" (id, vehicleId, driverId, missionType, checkOutAt, conditionOut, mileageOut, fuelOut, checkInAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      args: ['trip-open', 'v-1', 'user-driver', 'LOGISTIQUE', new Date().toISOString(), 'BON', 10000, 75],
    });

    const res = await DELETE(makeDeleteRequest('VSAV 01', 'm-open'), ctx('VSAV 01', 'm-open'));
    expect(res.status).toBe(200);

    // SQL DIRECT D'ABORD : le statut persisté ne doit pas avoir bougé.
    expect(await readStatus('v-1')).toBe('IN_USE');

    // Puis la forme du payload exposé.
    const getRes = await GETVehicle(new Request('http://localhost/api/vehicles/VSAV%2001'), {
      params: Promise.resolve({ id: 'VSAV 01' }),
    });
    expect(getRes.status).toBe(200);
    const getJson = await getRes.json();
    expect(getJson.activeMaintenance).toBeNull();
    expect(getJson.status).toBe('IN_USE');
  });

  it("PATCH décalant le startDate au futur désactive la maintenance → statut 'AVAILABLE'", async () => {
    mockedAuth.mockResolvedValue(adminParisSession as never);
    expect(await readStatus('v-1')).toBe('MAINTENANCE');

    const res = await PATCH(
      makePatchRequest('VSAV 01', 'm-open', { startDate: new Date(Date.now() + 2 * DAY).toISOString() }),
      ctx('VSAV 01', 'm-open'),
    );
    expect(res.status).toBe(200);

    expect(await readStatus('v-1')).toBe('AVAILABLE');
  });

  it("PATCH d'une simple raison ne fait pas osciller le statut", async () => {
    mockedAuth.mockResolvedValue(adminParisSession as never);
    expect(await readStatus('v-1')).toBe('MAINTENANCE');

    const res = await PATCH(
      makePatchRequest('VSAV 01', 'm-open', { reason: 'Nouvelle raison' }),
      ctx('VSAV 01', 'm-open'),
    );
    expect(res.status).toBe(200);

    expect(await readStatus('v-1')).toBe('MAINTENANCE');
  });

  it('chaîne bout-en-bout : POST maintenance → DELETE → l\'emprunt redevient possible', async () => {
    mockedAuth.mockResolvedValue(adminParisSession as never);

    // 1. Mise en maintenance : `POST` persiste 'MAINTENANCE' sur `v-3`.
    const postRes = await POSTMaintenance(
      new Request('http://localhost/api/vehicles/VL%2003/maintenance-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: new Date(Date.now() - 1000).toISOString(), endDate: null, reason: 'Panne' }),
      }),
      { params: Promise.resolve({ id: 'VL 03' }) },
    );
    expect(postRes.status).toBe(201);
    const eventId = (await postRes.json()).maintenance.id as string;
    expect(await readStatus('v-3')).toBe('MAINTENANCE');

    // 2. Suppression de l'événement : le recalcul doit libérer la colonne.
    const delRes = await DELETE(makeDeleteRequest('VL 03', eventId), ctx('VL 03', eventId));
    expect(delRes.status).toBe(200);
    expect(await readStatus('v-3')).toBe('AVAILABLE');

    // 3. L'emprunt aboutit — c'est le défaut corrigé : sans recalcul, `trips/route.ts`
    //    renverrait 400 « Ce véhicule n'est pas disponible ».
    mockedAuth.mockResolvedValue(driverParisSession as never);
    const tripRes = await POSTTrip(
      new Request('http://localhost/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId: 'v-3',
          missionType: 'LOGISTIQUE',
          conditionOut: 'BON',
          dsaChecked: false,
        }),
      }),
    );
    expect(tripRes.status).toBe(201);
    expect(await readStatus('v-3')).toBe('IN_USE');
  });
});
