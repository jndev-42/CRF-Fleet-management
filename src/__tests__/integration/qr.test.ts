import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
  const { db } = await import('./setup');
  return { db };
});

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/renault', () => ({
  getRenaultVehicleData: vi.fn().mockResolvedValue(null),
}));

import { GET as GET_QR_VEHICLE } from '@/app/api/qr/[token]/vehicle/route';
import { POST as POST_QR_CHECKOUT } from '@/app/api/qr/[token]/checkout/route';
import { POST as POST_QR_CHECKIN } from '@/app/api/qr/[token]/checkin/route';
import { POST as POST_INCIDENT } from '@/app/api/incidents/route';
import { auth } from '@/auth';
import { db, seedVehicle, seedUser } from './setup';

const mockedAuth = vi.mocked(auth);

describe('QR Code API Flow', () => {
  beforeEach(async () => {
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
    });

    await seedUser({ id: 'usr-driver-1', email: 'driver1@croix-rouge.fr' });
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
});
