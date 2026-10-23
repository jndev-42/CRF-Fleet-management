/**
 * Listes de l'étape « Équipage » du rapport de mission :
 *  - GET /api/missions/drivers         (/missions/new — ADMIN et au-dessus, CI/RPAPS)
 *  - GET /api/qr-ul/[token]/drivers    (/qr-ul/[token] — tout compte non bloqué)
 *  - GET /api/qr-ul/[token]/vehicles   (véhicules de l'UL du QR, pas de la session)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
  const { db } = await import('./setup');
  return { db };
});

vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { GET as GET_MISSION_DRIVERS } from '@/app/api/missions/drivers/route';
import { GET as GET_QR_UL_DRIVERS } from '@/app/api/qr-ul/[token]/drivers/route';
import { GET as GET_QR_UL_VEHICLES } from '@/app/api/qr-ul/[token]/vehicles/route';
import { auth } from '@/auth';
import { db, seedUniteLocale, seedVehicle, seedUser, seedRoles, seedUserRole } from './setup';

const mockedAuth = vi.mocked(auth);

function asUser(roles: string[], ulId = 'ul-paris-18') {
  mockedAuth.mockResolvedValue({
    user: { id: 'usr-caller', name: 'Appelant', email: 'caller@croix-rouge.fr', roles, ulId },
    expires: '2026-01-01',
  } as never);
}

const qrParams = (token: string) => ({ params: Promise.resolve({ token }) });
const qrUlDrivers = (token: string) => GET_QR_UL_DRIVERS(new Request(`http://localhost/api/qr-ul/${token}/drivers`), qrParams(token));
const qrUlVehicles = (token: string) => GET_QR_UL_VEHICLES(new Request(`http://localhost/api/qr-ul/${token}/vehicles`), qrParams(token));

describe("Listes de l'étape « Équipage » du rapport de mission", () => {
  beforeEach(async () => {
    mockedAuth.mockReset();
    await seedRoles(['SUPER_ADMIN', 'ADMIN', 'CHVL', 'CHVPSP', 'INACTIF', 'GUEST', 'CI/RPAPS']);
    await seedUniteLocale({ id: 'ul-paris-18', name: 'Paris 18', slug: 'paris-18' });
    await seedUniteLocale({ id: 'ul-lyon', name: 'Lyon', slug: 'lyon' });
    await db.execute({ sql: `UPDATE "UniteLocale" SET qrToken = ? WHERE id = ?`, args: ['tok-paris', 'ul-paris-18'] });

    await seedUser({ id: 'usr-alice', email: 'alice@croix-rouge.fr', name: 'Alice' });
    await seedUser({ id: 'usr-bruno', email: 'bruno@croix-rouge.fr', name: 'Bruno' });
    await seedUser({ id: 'usr-inactif', email: 'inactif@croix-rouge.fr', name: 'Inactif' });
    await seedUser({ id: 'usr-guest', email: 'guest@croix-rouge.fr', name: 'Guest' });
    await seedUser({ id: 'usr-ci', email: 'ci@croix-rouge.fr', name: 'CI' });
    await seedUserRole('usr-alice', 'CHVL');
    await seedUserRole('usr-bruno', 'CHVL');
    await seedUserRole('usr-bruno', 'CHVPSP');
    await seedUserRole('usr-inactif', 'CHVL');
    await seedUserRole('usr-inactif', 'INACTIF');
    await seedUserRole('usr-guest', 'CHVPSP');
    await seedUserRole('usr-guest', 'GUEST');
    await seedUserRole('usr-ci', 'CI/RPAPS');

    await seedVehicle({ id: 'VL-PARIS', name: 'VL Paris', type: 'VL', ulId: 'ul-paris-18' });
    await seedVehicle({ id: 'VPSP-PARIS', name: 'VPSP Paris', type: 'VPSP', ulId: 'ul-paris-18' });
    await seedVehicle({ id: 'VL-LYON', name: 'VL Lyon', type: 'VL', ulId: 'ul-lyon' });
  });

  const EXPECTED_DRIVERS = [
    { id: 'usr-alice', name: 'Alice', email: 'alice@croix-rouge.fr', roles: ['CHVL'] },
    { id: 'usr-bruno', name: 'Bruno', email: 'bruno@croix-rouge.fr', roles: expect.arrayContaining(['CHVL', 'CHVPSP']) },
  ];

  describe('GET /api/missions/drivers', () => {
    it('returns 401 when not authenticated', async () => {
      mockedAuth.mockResolvedValue(null as never);
      expect((await GET_MISSION_DRIVERS()).status).toBe(401);
    });

    it('returns 403 for an inactive account, even CI/RPAPS', async () => {
      asUser(['CI/RPAPS', 'INACTIF']);
      expect((await GET_MISSION_DRIVERS()).status).toBe(403);
    });

    it('returns 403 for a role that cannot write a mission report', async () => {
      asUser(['CHVL']);
      expect((await GET_MISSION_DRIVERS()).status).toBe(403);
    });

    it('liste à un CI/RPAPS les chauffeurs CHVL/CHVPSP actifs avec leurs rôles de conduite', async () => {
      asUser(['CI/RPAPS']);
      const res = await GET_MISSION_DRIVERS();
      expect(res.status).toBe(200);
      const { users } = await res.json();
      expect(users).toEqual(EXPECTED_DRIVERS);
    });

    it('autorise aussi un ADMIN', async () => {
      asUser(['ADMIN']);
      expect((await GET_MISSION_DRIVERS()).status).toBe(200);
    });
  });

  describe('GET /api/qr-ul/[token]/drivers', () => {
    it('returns 401 when not authenticated', async () => {
      mockedAuth.mockResolvedValue(null as never);
      expect((await qrUlDrivers('tok-paris')).status).toBe(401);
    });

    it('returns 403 for an inactive account', async () => {
      asUser(['INACTIF']);
      expect((await qrUlDrivers('tok-paris')).status).toBe(403);
    });

    it('returns 404 for an unknown token', async () => {
      asUser(['CHVL']);
      expect((await qrUlDrivers('tok-inconnu')).status).toBe(404);
    });

    it('liste les chauffeurs actifs à un compte sans rôle', async () => {
      asUser([], 'ul-lyon');
      const { users } = await (await qrUlDrivers('tok-paris')).json();
      expect(users).toEqual(EXPECTED_DRIVERS);
    });
  });

  describe('GET /api/qr-ul/[token]/vehicles', () => {
    it('returns 401 when not authenticated', async () => {
      mockedAuth.mockResolvedValue(null as never);
      expect((await qrUlVehicles('tok-paris')).status).toBe(401);
    });

    it('returns 403 for an inactive account', async () => {
      asUser(['INACTIF']);
      expect((await qrUlVehicles('tok-paris')).status).toBe(403);
    });

    it('returns 404 for an unknown token', async () => {
      asUser(['CHVL']);
      expect((await qrUlVehicles('tok-inconnu')).status).toBe(404);
    });

    it("renvoie les véhicules de l'UL du QR, même pour un bénévole d'une autre UL", async () => {
      asUser(['CHVL'], 'ul-lyon');
      const res = await qrUlVehicles('tok-paris');
      expect(res.status).toBe(200);
      const { vehicles } = await res.json();
      expect(vehicles).toEqual([
        { id: 'VL-PARIS', name: 'VL Paris', type: 'VL' },
        { id: 'VPSP-PARIS', name: 'VPSP Paris', type: 'VPSP' },
      ]);
    });
  });
});
