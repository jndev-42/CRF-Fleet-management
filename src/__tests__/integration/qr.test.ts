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

import { GET as GET_QR_VEHICLE } from '@/app/api/qr/[token]/vehicle/route';
import { POST as POST_QR_CHECKOUT } from '@/app/api/qr/[token]/checkout/route';
import { POST as POST_QR_CHECKIN } from '@/app/api/qr/[token]/checkin/route';
import { POST as POST_INCIDENT } from '@/app/api/incidents/route';
import { auth } from '@/auth';
import { getRenaultVehicleData, isConnectedInDb } from '@/lib/vehicle-connection';
import { db, seedVehicle, seedUser } from './setup';

const mockedAuth = vi.mocked(auth);

describe('QR Code API Flow', () => {
  beforeEach(async () => {
    // Défaut : véhicule non connecté. Les tests de télémétrie surchargent
    // localement ; sans cette remise à zéro, la surcharge fuirait sur les
    // tests suivants (`mockResolvedValue` survit à `clearAllMocks`).
    vi.mocked(isConnectedInDb).mockResolvedValue(false);
    vi.mocked(getRenaultVehicleData).mockReset();
    mockedAuth.mockReset();
    mockedAuth.mockResolvedValue({
      user: {
        id: 'usr-driver-1',
        name: 'Conducteur Un',
        email: 'driver1@croix-rouge.fr',
        roles: ['DRIVER'],
        ulId: 'ul-paris-18',
      },
      expires: '2026-01-01',
    } as never);

    await seedUser({ id: 'usr-driver-1', email: 'driver1@croix-rouge.fr' });
  });

  it('GET /api/qr/[token]/vehicle returns 401 when not authenticated', async () => {
    mockedAuth.mockResolvedValue(null as never);
    await seedVehicle({ id: 'VL401', name: 'Véhicule 401', type: 'VL', status: 'AVAILABLE', qrToken: 'token-401' } as never);

    const req = new Request('http://localhost/api/qr/token-401/vehicle');
    const res = await GET_QR_VEHICLE(req, { params: Promise.resolve({ token: 'token-401' }) });

    expect(res.status).toBe(401);
  });

  it('GET /api/qr/[token]/vehicle returns 403 for an inactive account', async () => {
    mockedAuth.mockResolvedValue({
      user: {
        id: 'usr-inactif',
        name: 'Inactif',
        email: 'inactif@croix-rouge.fr',
        roles: ['INACTIF'],
        ulId: 'ul-paris-18',
      },
      expires: '2026-01-01',
    } as never);
    await seedVehicle({ id: 'VL403', name: 'Véhicule 403', type: 'VL', status: 'AVAILABLE', qrToken: 'token-403' });

    const req = new Request('http://localhost/api/qr/token-403/vehicle');
    const res = await GET_QR_VEHICLE(req, { params: Promise.resolve({ token: 'token-403' }) });

    expect(res.status).toBe(403);
  });

  it('POST /api/qr/[token]/checkout returns 400 when conditionOut is missing (Zod)', async () => {
    await seedVehicle({ id: 'VL400', name: 'Véhicule 400', type: 'VL', status: 'AVAILABLE', qrToken: 'token-400' });

    const req = new Request('http://localhost/api/qr/token-400/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ missionType: 'DPS' }),
    });

    const res = await POST_QR_CHECKOUT(req, { params: Promise.resolve({ token: 'token-400' }) });
    expect(res.status).toBe(400);
  });

  it('GET /api/qr/[token]/vehicle returns desinfTracking property', async () => {
    await seedVehicle({ id: 'VPSP01', name: 'VPSP Paris 18', type: 'VPSP', status: 'AVAILABLE', desinfTracking: true, qrToken: 'token-vpsp-01' });

    const req = new Request('http://localhost/api/qr/token-vpsp-01/vehicle');
    const res = await GET_QR_VEHICLE(req, { params: Promise.resolve({ token: 'token-vpsp-01' }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('VPSP01');
    expect(body.desinfTracking).toBe(true);
  });

  it("GET /api/qr/[token]/vehicle n'expose jamais lastError ni le credential (bypass QR)", async () => {
    await seedVehicle({ id: 'VLQR09', name: 'VL QR 09', type: 'VL', status: 'AVAILABLE', qrToken: 'token-qr-09' });
    await db.execute({
      sql: `INSERT INTO BrandCredential (id, ulId, brand, login, passwordEncrypted) VALUES (?,?,?,?,?)`,
      args: ['cred-qr-09', 'ul-paris-18', 'RENAULT', 'compte@croix-rouge.fr', 'iv:tag:cipher'],
    });
    await db.execute({
      sql: `INSERT INTO VehicleConnection (id, vehicleId, credentialId, brand, vin, status, lastError)
            VALUES (?,?,?,?,?,?,?)`,
      args: ['vc-qr-09', 'VLQR09', 'cred-qr-09', 'RENAULT', 'VF1QR000000000009', 'ERROR',
             'Identifiants MyRenault refusés : compte@croix-rouge.fr'],
    });

    const req = new Request('http://localhost/api/qr/token-qr-09/vehicle');
    const res = await GET_QR_VEHICLE(req, { params: Promise.resolve({ token: 'token-qr-09' }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    // Le statut est utile au client ; le message Gigya contient le login du
    // compte constructeur et cette route est accessible sans contrôle d'UL.
    expect(body.connection).toEqual({ status: 'ERROR' });

    const raw = JSON.stringify(body);
    expect(raw).not.toContain('lastError');
    expect(raw).not.toContain('compte@croix-rouge.fr');
    expect(raw).not.toContain('cred-qr-09');
    expect(raw).not.toContain('iv:tag:cipher');
  });

  it('POST /api/qr/[token]/checkout prend le kilométrage de la télémétrie quand le véhicule est connecté', async () => {
    await seedVehicle({ id: 'VLC1', name: 'VL connecté', type: 'VL', status: 'AVAILABLE', qrToken: 'token-conn-out', mileage: 1000, fuelLevel: 20, maxFuelCapacity: 50 });

    vi.mocked(isConnectedInDb).mockResolvedValue(true);
    vi.mocked(getRenaultVehicleData).mockResolvedValue({
      vin: 'VF1TEST00000002',
      totalMileage: 55555,
      fuelQuantity: 25,
      fuelAutonomy: 300,
      batteryLevel: null,
      batteryAutonomy: null,
      chargingStatus: null,
      plugStatus: null,
      cockpitTimestamp: new Date().toISOString(),
      batteryTimestamp: null,
      isElectric: false,
    });

    const req = new Request('http://localhost/api/qr/token-conn-out/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ missionType: 'DPS', conditionOut: 'Bon état', cleanlinessOut: 'Propre' }),
    });

    const res = await POST_QR_CHECKOUT(req, { params: Promise.resolve({ token: 'token-conn-out' }) });
    expect(res.status).toBe(201);
    const body = await res.json();

    const trip = await db.execute({
      sql: `SELECT mileageOut, fuelOut FROM Trip WHERE id = ?`,
      args: [body.tripId],
    });
    // La télémétrie prime sur les valeurs stockées du véhicule.
    expect(Number(trip.rows[0].mileageOut)).toBe(55555);
    expect(Number(trip.rows[0].fuelOut)).toBe(50); // 25 L sur 50 L
  });

  it('POST /api/qr/[token]/checkin préremplit le retour depuis la télémétrie', async () => {
    await seedVehicle({ id: 'VLC2', name: 'VL connecté 2', type: 'VL', status: 'AVAILABLE', qrToken: 'token-conn-in', mileage: 1000, fuelLevel: 20, maxFuelCapacity: 50 });

    vi.mocked(isConnectedInDb).mockResolvedValue(true);
    vi.mocked(getRenaultVehicleData).mockResolvedValue({
      vin: 'VF1TEST00000003',
      totalMileage: 66666,
      fuelQuantity: 40,
      fuelAutonomy: 400,
      batteryLevel: null,
      batteryAutonomy: null,
      chargingStatus: null,
      plugStatus: null,
      cockpitTimestamp: new Date().toISOString(),
      batteryTimestamp: null,
      isElectric: false,
    });

    const outReq = new Request('http://localhost/api/qr/token-conn-in/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ missionType: 'DPS', conditionOut: 'Bon état', cleanlinessOut: 'Propre' }),
    });
    const outRes = await POST_QR_CHECKOUT(outReq, { params: Promise.resolve({ token: 'token-conn-in' }) });
    expect(outRes.status).toBe(201);

    // Retour sans saisie de kilométrage : la télémétrie doit le fournir.
    const inReq = new Request('http://localhost/api/qr/token-conn-in/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conditionIn: 'Bon état', cleanlinessIn: 'Propre' }),
    });
    const inRes = await POST_QR_CHECKIN(inReq, { params: Promise.resolve({ token: 'token-conn-in' }) });
    expect(inRes.status).toBe(200);

    const trip = await db.execute({
      sql: `SELECT mileageIn, fuelIn FROM Trip WHERE vehicleId = ? ORDER BY checkOutAt DESC LIMIT 1`,
      args: ['VLC2'],
    });
    expect(Number(trip.rows[0].mileageIn)).toBe(66666);
    expect(Number(trip.rows[0].fuelIn)).toBe(80); // 40 L sur 50 L
  });

  it('POST /api/qr/[token]/checkout saves checklistOut', async () => {
    await seedVehicle({ id: 'VL01', name: 'Véhicule Léger', type: 'VL', status: 'AVAILABLE', qrToken: 'token-vl-01' });

    const req = new Request('http://localhost/api/qr/token-vl-01/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        missionType: 'DPS',
        conditionOut: 'Bon état',
        cleanlinessOut: 'Propre',
        checklistOut: { 'item-1': true, 'item-2': false },
      }),
    });

    const res = await POST_QR_CHECKOUT(req, { params: Promise.resolve({ token: 'token-vl-01' }) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.tripId).toBeDefined();

    // Verify trip in DB has checklistOut
    const tripRes = await db.execute({
      sql: `SELECT checklistOut FROM Trip WHERE id = ?`,
      args: [body.tripId],
    });
    expect(tripRes.rows[0].checklistOut).toBe(JSON.stringify({ 'item-1': true, 'item-2': false }));
  });

  it('POST /api/qr/[token]/checkin saves checklistIn and desinf fields', async () => {
    await seedVehicle({ id: 'VPSP02', name: 'VPSP 02', type: 'VPSP', status: 'AVAILABLE', qrToken: 'token-vpsp-02' });

    // Checkout first as Désinfection mission
    const checkoutReq = new Request('http://localhost/api/qr/token-vpsp-02/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        missionType: 'Désinfection',
        conditionOut: 'Bon état',
      }),
    });
    const checkoutRes = await POST_QR_CHECKOUT(checkoutReq, { params: Promise.resolve({ token: 'token-vpsp-02' }) });
    expect(checkoutRes.status).toBe(201);
    const { tripId } = await checkoutRes.json();

    // Checkin with desinf info and checklistIn
    const checkinReq = new Request('http://localhost/api/qr/token-vpsp-02/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mileageIn: 10050,
        fuelIn: 90,
        conditionIn: 'Bon état',
        checklistIn: { 'checkin-1': true },
        desinfResponsable: 'Conducteur Un',
        desinfLotNumber: 'LOT-9999',
      }),
    });

    const checkinRes = await POST_QR_CHECKIN(checkinReq, { params: Promise.resolve({ token: 'token-vpsp-02' }) });
    expect(checkinRes.status).toBe(200);

    // Verify Trip saved desinf and checklistIn
    const tripRes = await db.execute({
      sql: `SELECT checklistIn, desinfResponsable, desinfLotNumber FROM Trip WHERE id = ?`,
      args: [tripId],
    });
    expect(tripRes.rows[0].checklistIn).toBe(JSON.stringify({ 'checkin-1': true }));
    expect(tripRes.rows[0].desinfResponsable).toBe('Conducteur Un');
    expect(tripRes.rows[0].desinfLotNumber).toBe('LOT-9999');

    // Verify Vehicle updated lastDesinfDate
    const vRes = await db.execute({
      sql: `SELECT status, lastDesinfDate FROM Vehicle WHERE id = 'VPSP02'`,
      args: [],
    });
    expect(vRes.rows[0].status).toBe('AVAILABLE');
    expect(vRes.rows[0].lastDesinfDate).not.toBeNull();
  });

  /** Ouvre un emprunt via le parcours QR et renvoie le trajet créé. */
  async function qrCheckout(token: string) {
    const req = new Request(`http://localhost/api/qr/${token}/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ missionType: 'DPS', conditionOut: 'Bon état' }),
    });
    const res = await POST_QR_CHECKOUT(req, { params: Promise.resolve({ token }) });
    expect(res.status).toBe(201);
    return res.json() as Promise<{ tripId: string; mileageOut: number }>;
  }

  function qrCheckinRequest(token: string, body: Record<string, unknown>) {
    return new Request(`http://localhost/api/qr/${token}/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('POST /api/qr/[token]/checkin returns 400 without a code when mileageIn is below mileageOut', async () => {
    await seedVehicle({ id: 'VLNEG', name: 'Véhicule Négatif', type: 'VL', status: 'AVAILABLE', qrToken: 'token-neg' });
    const { mileageOut } = await qrCheckout('token-neg');

    const req = qrCheckinRequest('token-neg', {
      mileageIn: mileageOut - 100,
      fuelIn: 50,
      conditionIn: 'Bon état',
    });
    const res = await POST_QR_CHECKIN(req, { params: Promise.resolve({ token: 'token-neg' }) });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.code).toBeUndefined();
    expect(body.error).toMatch(/responsable/i);
  });

  it('POST /api/qr/[token]/checkin returns 400 with MILEAGE_CONFIRM_REQUIRED for an excessive delta', async () => {
    await seedVehicle({ id: 'VLEXC', name: 'Véhicule Excessif', type: 'VL', status: 'AVAILABLE', qrToken: 'token-exc' });
    const { mileageOut } = await qrCheckout('token-exc');

    const req = qrCheckinRequest('token-exc', {
      mileageIn: mileageOut + 400,
      fuelIn: 50,
      conditionIn: 'Bon état',
    });
    const res = await POST_QR_CHECKIN(req, { params: Promise.resolve({ token: 'token-exc' }) });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.code).toBe('MILEAGE_CONFIRM_REQUIRED');
    expect(body.delta).toBe(400);
    expect(body.maxKm).toBe(150);
    expect(typeof body.durationLabel).toBe('string');
  });

  it('POST /api/qr/[token]/checkin returns 200 for an excessive delta when confirmMileageAnomaly is true', async () => {
    // FILET UNIQUE contre l'omission de `confirmMileageAnomaly` dans le schéma Zod inline de
    // cette route : aucun schéma du projet n'est .strict(), donc un champ non déclaré est
    // silencieusement supprimé — le 400 se répéterait indéfiniment sans qu'aucun autre test
    // ne le détecte.
    await seedVehicle({ id: 'VLCONF', name: 'Véhicule Confirmé', type: 'VL', status: 'AVAILABLE', qrToken: 'token-conf' });
    const { tripId, mileageOut } = await qrCheckout('token-conf');

    const req = qrCheckinRequest('token-conf', {
      mileageIn: mileageOut + 400,
      fuelIn: 50,
      conditionIn: 'Bon état',
      confirmMileageAnomaly: true,
    });
    const res = await POST_QR_CHECKIN(req, { params: Promise.resolve({ token: 'token-conf' }) });
    expect(res.status).toBe(200);

    const tripRes = await db.execute({
      sql: `SELECT mileageIn, checkInAt FROM Trip WHERE id = ?`,
      args: [tripId],
    });
    expect(tripRes.rows[0].mileageIn).toBe(mileageOut + 400);
    expect(tripRes.rows[0].checkInAt).not.toBeNull();
  });

  it('allows reporting an incident on a vehicle accessed via QR token', async () => {
    await seedVehicle({ id: 'VL02', name: 'Véhicule QR Incident', type: 'VL', status: 'AVAILABLE', qrToken: 'token-vl-02' });

    // Resolve vehicle via GET /api/qr/[token]/vehicle
    const getReq = new Request('http://localhost/api/qr/token-vl-02/vehicle');
    const getRes = await GET_QR_VEHICLE(getReq, { params: Promise.resolve({ token: 'token-vl-02' }) });
    expect(getRes.status).toBe(200);
    const vehicle = await getRes.json();

    // Create incident draft for this vehicle
    const incReq = new Request('http://localhost/api/incidents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vehicleId: vehicle.id,
        tripId: vehicle.activeTrip?.id || null,
        status: 'DRAFT',
      }),
    });

    const incRes = await POST_INCIDENT(incReq);
    expect(incRes.status).toBe(201);
    const incBody = await incRes.json();
    expect(incBody.id).toBeDefined();

    // Verify incident in DB
    const incDb = await db.execute({
      sql: `SELECT vehicleId, userId, status FROM IncidentReport WHERE id = ?`,
      args: [incBody.id],
    });
    expect(incDb.rows[0].vehicleId).toBe('VL02');
    expect(incDb.rows[0].userId).toBe('usr-driver-1');
    expect(incDb.rows[0].status).toBe('DRAFT');
  });

  // ── Règle d'accès QR : isQrBlocked (Questions D et E) ──────────────────────
  //
  // Tout compte connecté accède au QR, AVEC OU SANS rôle attribué, sauf s'il porte
  // INACTIF (ou sa valeur héritée GUEST) — dominance, même en cumul.

  /** Session QR factice portant exactement `roles`. */
  function qrSession(roles: string[], id = 'usr-driver-1') {
    return {
      user: { id, name: 'Conducteur Un', email: 'driver1@croix-rouge.fr', roles, ulId: 'ul-paris-18' },
      expires: '2026-01-01',
    } as never;
  }

  it('GET /api/qr/[token]/vehicle autorise un compte sans aucun rôle (AC-G3)', async () => {
    mockedAuth.mockResolvedValue(qrSession([]));
    await seedVehicle({ id: 'VLNOROLE', name: 'Véhicule Sans Rôle', type: 'VL', status: 'AVAILABLE', qrToken: 'token-no-role' });

    const req = new Request('http://localhost/api/qr/token-no-role/vehicle');
    const res = await GET_QR_VEHICLE(req, { params: Promise.resolve({ token: 'token-no-role' }) });

    expect(res.status).toBe(200);
  });

  it('POST /api/qr/[token]/checkout autorise un compte sans aucun rôle (AC-G4)', async () => {
    mockedAuth.mockResolvedValue(qrSession([]));
    await seedVehicle({ id: 'VLNRCO', name: 'Véhicule Sans Rôle Checkout', type: 'VL', status: 'AVAILABLE', qrToken: 'token-no-role-out' });

    const req = new Request('http://localhost/api/qr/token-no-role-out/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ missionType: 'DPS', conditionOut: 'Bon état' }),
    });
    const res = await POST_QR_CHECKOUT(req, { params: Promise.resolve({ token: 'token-no-role-out' }) });

    expect(res.status).toBe(201);
  });

  /**
   * VERROU DE COMPORTEMENT PRODUIT — ne pas « durcir » ce test.
   *
   * L'emprunt par QR est le SEUL parcours d'emprunt inter-UL légitime du produit :
   * il contourne délibérément les droits (cf. la docstring de
   * `src/app/api/qr/[token]/checkout/route.ts` : « tout compte CRF connecté, avec ou
   * sans rôle attribué… Aucun contrôle d'UL ni de rôle chauffeur »). Le bénévole qui
   * scanne la vignette d'un véhicule en renfort sur une autre UL doit pouvoir le
   * prendre — c'est la raison d'être du QR.
   *
   * `POST /api/trips` applique, LUI, un cloisonnement UL strict (404 inter-UL, cf.
   * `checkout.test.ts` § « cloisonnement UL »). Les deux routes sont indépendantes :
   * celle-ci fait son propre INSERT Trip et son propre UPDATE Vehicle. Propager ici le
   * cloisonnement de `/api/trips` casserait le parcours QR — ce test est là pour que
   * la tentative échoue bruyamment.
   */
  it('l\'emprunt QR reste ouvert entre unités locales (bypass volontaire des droits)', async () => {
    // Session rattachée à Paris ; véhicule immatriculé sur Lyon.
    await seedVehicle({
      id: 'VLXUL',
      name: 'Véhicule Autre UL',
      type: 'VL',
      status: 'AVAILABLE',
      qrToken: 'token-cross-ul',
      ulId: 'ul-lyon',
    });

    const req = new Request('http://localhost/api/qr/token-cross-ul/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ missionType: 'DPS', conditionOut: 'Bon état' }),
    });
    const res = await POST_QR_CHECKOUT(req, { params: Promise.resolve({ token: 'token-cross-ul' }) });

    // Surtout pas 403/404 : l'écart d'UL ne doit RIEN refuser sur ce parcours.
    expect(res.status).toBe(201);

    // Et l'emprunt a bien eu lieu — pas seulement un 201 de façade.
    const trips = await db.execute({
      sql: `SELECT COUNT(*) AS n FROM Trip WHERE vehicleId = ?`,
      args: ['VLXUL'],
    });
    expect(Number(trips.rows[0].n)).toBe(1);

    const vehicle = await db.execute({
      sql: `SELECT status FROM Vehicle WHERE id = ?`,
      args: ['VLXUL'],
    });
    expect(vehicle.rows[0].status).toBe('IN_USE');
  });

  it('POST /api/qr/[token]/checkin autorise un compte sans rôle qui est le conducteur (AC-G5)', async () => {
    // Le prédicat QR ne bloque plus ; la garde conducteur de checkin/route.ts reste
    // seule à border la restitution, inchangée.
    mockedAuth.mockResolvedValue(qrSession([]));
    await seedVehicle({ id: 'VLNRCI', name: 'Véhicule Sans Rôle Checkin', type: 'VL', status: 'AVAILABLE', qrToken: 'token-no-role-in' });
    const { mileageOut } = await qrCheckout('token-no-role-in');

    const req = qrCheckinRequest('token-no-role-in', {
      mileageIn: mileageOut + 10,
      fuelIn: 50,
      conditionIn: 'Bon état',
    });
    const res = await POST_QR_CHECKIN(req, { params: Promise.resolve({ token: 'token-no-role-in' }) });

    expect(res.status).toBe(200);
  });

  it.each([
    ['GUEST', ['GUEST']],
    ['INACTIF cumulé à CHVL', ['INACTIF', 'CHVL']],
    ['CHVL cumulé à INACTIF', ['CHVL', 'INACTIF']],
  ])('refuse les 3 routes QR véhicule pour %s (AC-G7)', async (_label, roles) => {
    mockedAuth.mockResolvedValue(qrSession(roles));
    const token = `token-blocked-${roles.join('-').toLowerCase()}`;
    await seedVehicle({ id: `VLB${roles.length}${roles[0][0]}`, name: 'Véhicule Bloqué', type: 'VL', status: 'AVAILABLE', qrToken: token });

    const vehicleRes = await GET_QR_VEHICLE(
      new Request(`http://localhost/api/qr/${token}/vehicle`),
      { params: Promise.resolve({ token }) },
    );
    expect(vehicleRes.status).toBe(403);

    const checkoutRes = await POST_QR_CHECKOUT(
      new Request(`http://localhost/api/qr/${token}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ missionType: 'DPS', conditionOut: 'Bon état' }),
      }),
      { params: Promise.resolve({ token }) },
    );
    expect(checkoutRes.status).toBe(403);

    const checkinRes = await POST_QR_CHECKIN(
      qrCheckinRequest(token, { mileageIn: 100, fuelIn: 50, conditionIn: 'Bon état' }),
      { params: Promise.resolve({ token }) },
    );
    expect(checkinRes.status).toBe(403);
  });

  // ── Verrou maintenance (POST /api/qr/[token]/checkout) ────────────────────
  // Second chemin d'emprunt complet, symétrique de `POST /api/trips`
  // (cf. `checkout.test.ts` § « verrou maintenance »). `Vehicle.status` ne suffit
  // pas comme garde : une maintenance datée du futur n'y est jamais projetée, et
  // tout check-in réécrit la colonne à 'AVAILABLE'.
  describe('verrou maintenance', () => {
    const DAY = 24 * 60 * 60 * 1000;

    async function seedMaintenance(vehicleId: string, overrides: Partial<{
      id: string;
      startDate: string;
      endDate: string | null;
      reason: string;
    }> = {}) {
      const m = {
        id: `maint-${vehicleId}`,
        startDate: new Date(Date.now() - DAY).toISOString(),
        endDate: null as string | null,
        reason: 'Panne embrayage',
        ...overrides,
      };
      await db.execute({
        sql: `INSERT INTO "VehicleMaintenance" (id, vehicleId, startDate, endDate, reason)
              VALUES (?, ?, ?, ?, ?)`,
        args: [m.id, vehicleId, m.startDate, m.endDate, m.reason],
      });
      return m;
    }

    async function tripCount(vehicleId: string): Promise<number> {
      const res = await db.execute({
        sql: `SELECT COUNT(*) AS c FROM Trip WHERE vehicleId = ?`,
        args: [vehicleId],
      });
      return Number(res.rows[0].c);
    }

    function checkoutRequest(token: string) {
      return new Request(`http://localhost/api/qr/${token}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ missionType: 'DPS', conditionOut: 'Bon état' }),
      });
    }

    it('returns 400 when an active maintenance covers the vehicle, even if status is AVAILABLE', async () => {
      // Statut volontairement AVAILABLE en base : c'est bien la table de maintenance
      // qui doit bloquer, pas la colonne `status`.
      await seedVehicle({ id: 'VLMNT1', name: 'VL Maintenance 1', type: 'VL', status: 'AVAILABLE', qrToken: 'token-maint-1' });
      await seedMaintenance('VLMNT1', { endDate: new Date(Date.now() + DAY).toISOString() });

      const res = await POST_QR_CHECKOUT(checkoutRequest('token-maint-1'), {
        params: Promise.resolve({ token: 'token-maint-1' }),
      });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Ce véhicule est en maintenance');

      // Aucun effet de bord : ni trajet créé, ni statut modifié.
      expect(await tripCount('VLMNT1')).toBe(0);
      const vRes = await db.execute({
        sql: `SELECT status FROM Vehicle WHERE id = ?`,
        args: ['VLMNT1'],
      });
      expect(vRes.rows[0].status).toBe('AVAILABLE');
    });

    it('returns 400 when the active maintenance has no end date (endDate IS NULL)', async () => {
      await seedVehicle({ id: 'VLMNT2', name: 'VL Maintenance 2', type: 'VL', status: 'AVAILABLE', qrToken: 'token-maint-2' });
      await seedMaintenance('VLMNT2', { endDate: null });

      const res = await POST_QR_CHECKOUT(checkoutRequest('token-maint-2'), {
        params: Promise.resolve({ token: 'token-maint-2' }),
      });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Ce véhicule est en maintenance');
      expect(await tripCount('VLMNT2')).toBe(0);
    });

    it('allows checkout when the maintenance starts in the future', async () => {
      await seedVehicle({ id: 'VLMNT3', name: 'VL Maintenance 3', type: 'VL', status: 'AVAILABLE', qrToken: 'token-maint-3' });
      await seedMaintenance('VLMNT3', {
        startDate: new Date(Date.now() + DAY).toISOString(),
        endDate: new Date(Date.now() + 2 * DAY).toISOString(),
      });

      const res = await POST_QR_CHECKOUT(checkoutRequest('token-maint-3'), {
        params: Promise.resolve({ token: 'token-maint-3' }),
      });
      expect(res.status).toBe(201);
      expect(await tripCount('VLMNT3')).toBe(1);
    });

    it('allows checkout when the maintenance is already over', async () => {
      await seedVehicle({ id: 'VLMNT4', name: 'VL Maintenance 4', type: 'VL', status: 'AVAILABLE', qrToken: 'token-maint-4' });
      await seedMaintenance('VLMNT4', {
        startDate: new Date(Date.now() - 2 * DAY).toISOString(),
        endDate: new Date(Date.now() - DAY).toISOString(),
      });

      const res = await POST_QR_CHECKOUT(checkoutRequest('token-maint-4'), {
        params: Promise.resolve({ token: 'token-maint-4' }),
      });
      expect(res.status).toBe(201);
      expect(await tripCount('VLMNT4')).toBe(1);
    });

    it('allows checkout when the vehicle carries no maintenance row at all', async () => {
      await seedVehicle({ id: 'VLMNT5', name: 'VL Maintenance 5', type: 'VL', status: 'AVAILABLE', qrToken: 'token-maint-5' });

      const res = await POST_QR_CHECKOUT(checkoutRequest('token-maint-5'), {
        params: Promise.resolve({ token: 'token-maint-5' }),
      });
      expect(res.status).toBe(201);
      expect(await tripCount('VLMNT5')).toBe(1);
    });
  });
});
