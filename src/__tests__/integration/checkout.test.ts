/**
 * Tests d'intégration du endpoint POST /api/trips (prise de véhicule / checkout).
 *
 * Stratégie : on appelle directement le handler Next.js (`POST`) avec de vrais
 * objets `Request`, en mockant uniquement les dépendances externes :
 *  - `@/lib/db`       → remplacé par la DB SQLite fichier temporaire de ./setup.ts
 *  - `@/auth`         → session mockée pour simuler différents rôles
 *  - `@/lib/renault`  → aucun appel réseau réel (retourne null = pas de données connectées)
 *  - `@/lib/onesignal`→ notifications désactivées en test
 *
 * Tous les tests vérifient le code HTTP de la réponse ET, pour les cas critiques,
 * l'état de la base de données après l'appel (effet de bord sur Vehicle.status).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock est hissé (hoisted) au début du fichier par Vitest.
// On utilise une factory async avec import() dynamique pour accéder à `db`
// depuis ./setup sans déclencher d'erreur de référence circulaire.
// DB fichier obligatoire : db.transaction('write') ouvre une 2e connexion
// qui verrait une base vide avec file::memory:.
vi.mock('@/lib/db', async () => {
  const { db } = await import('./setup');
  return { db };
});

// Mock de la session NextAuth — chaque test configure le retour via mockedAuth
vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

// Pas d'appel Renault en test — on simule l'absence de données connectées
vi.mock('@/lib/renault', () => ({
  getRenaultVehicleData: vi.fn().mockResolvedValue(null),
}));

// Désactive les notifications push pour éviter les appels OneSignal en test
vi.mock('@/lib/onesignal', () => ({
  sendPushNotification: vi.fn().mockResolvedValue(undefined),
  notifyRoles: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from '@/app/api/trips/route';
import { auth } from '@/auth';
import { db, seedVehicle, seedUser } from './setup';

const mockedAuth = vi.mocked(auth);

// Construit un Request HTTP POST simulant un appel client vers l'API
function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/trips', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validCheckOutBody = {
  vehicleId: 'VL001',
  missionType: 'LOGISTIQUE',
  conditionOut: 'BON',
  dsaChecked: false,
};

describe('POST /api/trips (checkout)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    // @ts-expect-error — auth returns null in test
    mockedAuth.mockResolvedValue(null);

    const response = await POST(makeRequest(validCheckOutBody));
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.error).toMatch(/authentifi/i);
  });

  it('returns 403 when user has only GUEST role', async () => {
    // @ts-expect-error — partial session object for testing
    mockedAuth.mockResolvedValue({
      user: { id: 'guest-id', email: 'guest@test.com', roles: ['GUEST'] },
    });
    await seedVehicle({ id: 'VL001', status: 'AVAILABLE' });

    const response = await POST(makeRequest(validCheckOutBody));
    expect(response.status).toBe(403);
  });

  it('returns 404 when vehicle does not exist', async () => {
    // @ts-expect-error — partial session object for testing
    mockedAuth.mockResolvedValue({
      user: { id: 'user-driver', email: 'driver@test.com', roles: ['CHVL'] },
    });

    const response = await POST(makeRequest({ ...validCheckOutBody, vehicleId: 'NONEXISTENT' }));
    expect(response.status).toBe(404);
  });

  it('returns 400 when vehicle is not AVAILABLE', async () => {
    // @ts-expect-error — partial session object for testing
    mockedAuth.mockResolvedValue({
      user: { id: 'user-driver', email: 'driver@test.com', roles: ['CHVL'] },
    });
    await seedVehicle({ id: 'VL001', status: 'IN_USE' });

    const response = await POST(makeRequest(validCheckOutBody));
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toMatch(/disponible/i);
  });

  it('returns 201 and sets vehicle to IN_USE on successful checkout', async () => {
    // @ts-expect-error — partial session object for testing
    mockedAuth.mockResolvedValue({
      user: { id: 'user-driver', email: 'driver@test.com', name: 'Test Driver', roles: ['CHVL'] },
    });
    await seedUser({ id: 'user-driver', email: 'driver@test.com', name: 'Test Driver' });
    await seedVehicle({ id: 'VL001', status: 'AVAILABLE', mileage: 10000, fuelLevel: 75 });

    const response = await POST(makeRequest(validCheckOutBody));
    expect(response.status).toBe(201);

    const trip = await response.json();
    expect(trip.vehicleId).toBe('VL001');
    expect(trip.driverId).toBe('user-driver');
    expect(trip.missionType).toBe('LOGISTIQUE');
    // checkInAt doit être null au checkout — il sera rempli au retour
    expect(trip.checkInAt == null).toBe(true);

    // Vérification de l'effet de bord en base : le véhicule doit être IN_USE
    const vehicleResult = await db.execute({
      sql: `SELECT status FROM "Vehicle" WHERE id = ?`,
      args: ['VL001'],
    });
    expect(vehicleResult.rows[0].status).toBe('IN_USE');
  });

  it('returns 400 for invalid Zod body (missing conditionOut)', async () => {
    // @ts-expect-error — partial session object for testing
    mockedAuth.mockResolvedValue({
      user: { id: 'user-driver', email: 'driver@test.com', roles: ['CHVL'] },
    });
    await seedVehicle({ id: 'VL001', status: 'AVAILABLE' });

    const { conditionOut, ...bodyWithoutCondition } = validCheckOutBody;
    const response = await POST(makeRequest(bodyWithoutCondition));
    expect(response.status).toBe(400);
  });

  it('allows ADMIN role to checkout any vehicle type', async () => {
    // @ts-expect-error — partial session object for testing
    mockedAuth.mockResolvedValue({
      user: { id: 'admin-id', email: 'admin@test.com', roles: ['ADMIN'] },
    });
    await seedUser({ id: 'admin-id', email: 'admin@test.com', name: 'Admin Test' });
    // Les véhicules VPSP sont normalement réservés aux rôles CHVPSP et ADMIN
    await seedVehicle({ id: 'VL001', status: 'AVAILABLE', type: 'VPSP' });

    const response = await POST(makeRequest(validCheckOutBody));
    expect(response.status).toBe(201);
  });

  it('returns 403 when CHVL tries to checkout a VPSP vehicle', async () => {
    // @ts-expect-error — partial session object for testing
    mockedAuth.mockResolvedValue({
      user: { id: 'user-driver', email: 'driver@test.com', roles: ['CHVL'] },
    });
    await seedVehicle({ id: 'VL001', status: 'AVAILABLE', type: 'VPSP' });

    const response = await POST(makeRequest(validCheckOutBody));
    expect(response.status).toBe(403);
  });
});
