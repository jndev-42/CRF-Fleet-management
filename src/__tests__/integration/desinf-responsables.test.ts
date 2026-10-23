import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
  const { db } = await import('./setup');
  return { db };
});

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

import { GET as GET_VEHICLE_RESPONSABLES } from '@/app/api/vehicles/[id]/desinf-responsables/route';
import { GET as GET_QR_RESPONSABLES } from '@/app/api/qr/[token]/desinf-responsables/route';
import { auth } from '@/auth';
import { seedVehicle, seedUser, seedRoles, seedUserRole, seedUserUL, seedUniteLocale } from './setup';

const mockedAuth = vi.mocked(auth);

function asUser(id: string, roles: string[], ulId = 'ul-paris-18') {
  mockedAuth.mockResolvedValue({
    user: { id, name: id, email: `${id}@croix-rouge.fr`, roles, ulId },
    expires: '2026-01-01',
  } as never);
}

const byVehicle = (id: string) =>
  GET_VEHICLE_RESPONSABLES(new Request(`http://localhost/api/vehicles/${id}/desinf-responsables`), { params: Promise.resolve({ id }) });
const byQr = (token: string) =>
  GET_QR_RESPONSABLES(new Request(`http://localhost/api/qr/${token}/desinf-responsables`), { params: Promise.resolve({ token }) });
const ids = async (res: Response) => (await res.json()).users.map((u: { id: string }) => u.id);

describe('Responsables de la désinfection (comptes actifs de l\'UL du véhicule)', () => {
  beforeEach(async () => {
    mockedAuth.mockReset();
    await seedRoles(['SUPER_ADMIN', 'ADMIN', 'CHVL', 'CHVPSP', 'INACTIF', 'GUEST']);
    await seedUniteLocale({ id: 'ul-paris-18', name: 'Paris 18', slug: 'paris-18' });
    await seedUniteLocale({ id: 'ul-lyon', name: 'Lyon', slug: 'lyon' });
    // UL Paris 18 : un chauffeur, un bénévole sans rôle de conduite, un inactif (global),
    // un inactif dans cette UL seulement, un GUEST hérité.
    await seedUser({ id: 'usr-me', email: 'me@croix-rouge.fr', name: 'Moi' });
    await seedUser({ id: 'usr-benevole', email: 'benevole@croix-rouge.fr', name: 'Bénévole' });
    await seedUser({ id: 'usr-inactif', email: 'inactif@croix-rouge.fr', name: 'Inactif' });
    await seedUser({ id: 'usr-inactif-ul', email: 'inactif-ul@croix-rouge.fr', name: 'Inactif UL' });
    await seedUser({ id: 'usr-guest', email: 'guest@croix-rouge.fr', name: 'Guest' });
    await seedUser({ id: 'usr-lyon', email: 'lyon@croix-rouge.fr', name: 'Lyonnais' });
    await seedUserRole('usr-me', 'CHVPSP');
    await seedUserRole('usr-inactif', 'INACTIF');
    await seedUserRole('usr-guest', 'GUEST');
    await seedUserUL({ userId: 'usr-me', ulId: 'ul-paris-18' });
    await seedUserUL({ userId: 'usr-benevole', ulId: 'ul-paris-18', isHome: false });
    await seedUserUL({ userId: 'usr-inactif', ulId: 'ul-paris-18' });
    await seedUserUL({ userId: 'usr-inactif-ul', ulId: 'ul-paris-18', roles: ['INACTIF'] });
    await seedUserUL({ userId: 'usr-guest', ulId: 'ul-paris-18' });
    await seedUserUL({ userId: 'usr-lyon', ulId: 'ul-lyon' });
    await seedVehicle({ id: 'VPSP01', name: 'VPSP 01', type: 'VPSP', qrToken: 'tok-vpsp', ulId: 'ul-paris-18' });
    await seedVehicle({ id: 'VPSP-LYON', name: 'VPSP Lyon', type: 'VPSP', qrToken: 'tok-lyon', ulId: 'ul-lyon' });
  });

  describe('GET /api/vehicles/[id]/desinf-responsables', () => {
    it('returns 401 when not authenticated', async () => {
      mockedAuth.mockResolvedValue(null as never);
      expect((await byVehicle('VPSP01')).status).toBe(401);
    });

    it('returns 403 for an inactive account', async () => {
      asUser('usr-inactif', ['INACTIF']);
      expect((await byVehicle('VPSP01')).status).toBe(403);
    });

    it('returns 404 for an unknown vehicle or a vehicle of another UL', async () => {
      asUser('usr-me', ['CHVPSP']);
      expect((await byVehicle('inconnu')).status).toBe(404);
      expect((await byVehicle('VPSP-LYON')).status).toBe(404);
    });

    it("liste à un simple chauffeur les comptes actifs de l'UL, lui compris, sans inactifs ni autre UL", async () => {
      asUser('usr-me', ['CHVPSP']);
      const res = await byVehicle('VPSP01');
      expect(res.status).toBe(200);
      expect(await ids(res)).toEqual(['usr-benevole', 'usr-me']);
    });
  });

  describe('GET /api/qr/[token]/desinf-responsables', () => {
    it('returns 401 when not authenticated', async () => {
      mockedAuth.mockResolvedValue(null as never);
      expect((await byQr('tok-vpsp')).status).toBe(401);
    });

    it('returns 403 for an inactive account', async () => {
      asUser('usr-inactif', ['INACTIF']);
      expect((await byQr('tok-vpsp')).status).toBe(403);
    });

    it('returns 404 for an unknown token', async () => {
      asUser('usr-me', ['CHVPSP']);
      expect((await byQr('tok-inconnu')).status).toBe(404);
    });

    it("liste les membres actifs de l'UL du véhicule, même pour un compte sans rôle d'une autre UL", async () => {
      asUser('usr-lyon', [], 'ul-lyon');
      expect(await ids(await byQr('tok-vpsp'))).toEqual(['usr-benevole', 'usr-me']);
    });

    it("suit l'UL du véhicule (et non celle de l'appelant)", async () => {
      asUser('usr-me', ['CHVPSP']);
      expect(await ids(await byQr('tok-lyon'))).toEqual(['usr-lyon']);
    });
  });
});
