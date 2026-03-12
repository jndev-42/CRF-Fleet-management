/**
 * Tests d'intégration pour fetchStatsData (src/lib/stats.ts).
 *
 * Vérifie que le calcul de la consommation moyenne de carburant (avgFuelConsumption
 * et avgFuelDelta) exclut correctement les trajets où le niveau a augmenté
 * (recharge / plein) ou est resté identique.
 *
 * Seuls les trajets où fuelOut > fuelIn (consommation nette positive) doivent
 * contribuer à la moyenne.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
  const { db } = await import('./setup');
  return { db };
});

import { fetchStatsData } from '@/lib/stats';
import { db, seedVehicle, seedUser, seedTrip } from './setup';

const TODAY = new Date().toISOString().slice(0, 10);

// Ensure vehicle + user exist before each test (truncation handled by setup.ts beforeEach)
beforeEach(async () => {
  await seedVehicle({ id: 'VL001', name: 'VL186' });
  await seedUser({ id: 'user-1', email: 'driver@test.com', name: 'Test Driver' });
});

describe('fetchStatsData — avgFuelConsumption', () => {
  it('inclut un trajet où fuelOut > fuelIn (consommation nette)', async () => {
    // fuelOut=80, fuelIn=60 → delta = 20 (consommation réelle)
    await seedTrip({
      id: 'trip-1',
      vehicleId: 'VL001',
      driverId: 'user-1',
      checkOutAt: `${TODAY}T08:00:00.000Z`,
      checkInAt: `${TODAY}T10:00:00.000Z`,
      fuelOut: 80,
      fuelIn: 60,
    });

    const result = await fetchStatsData(TODAY, TODAY);
    expect(result.global.avgFuelConsumption).toBe(20);
    expect(result.byVehicle[0].avgFuelDelta).toBe(20);
  });

  it('exclut un trajet où fuelOut < fuelIn (recharge / plein)', async () => {
    // fuelOut=50, fuelIn=90 → niveau a monté, doit être ignoré
    await seedTrip({
      id: 'trip-2',
      vehicleId: 'VL001',
      driverId: 'user-1',
      checkOutAt: `${TODAY}T08:00:00.000Z`,
      checkInAt: `${TODAY}T10:00:00.000Z`,
      fuelOut: 50,
      fuelIn: 90,
    });

    const result = await fetchStatsData(TODAY, TODAY);
    // Aucun trajet valide → moyenne nulle
    expect(result.global.avgFuelConsumption).toBe(0);
    expect(result.byVehicle[0].avgFuelDelta).toBe(0);
  });

  it('exclut un trajet où fuelOut == fuelIn (pas de consommation mesurable)', async () => {
    // fuelOut=70, fuelIn=70 → pas de variation, non significatif
    await seedTrip({
      id: 'trip-3',
      vehicleId: 'VL001',
      driverId: 'user-1',
      checkOutAt: `${TODAY}T08:00:00.000Z`,
      checkInAt: `${TODAY}T10:00:00.000Z`,
      fuelOut: 70,
      fuelIn: 70,
    });

    const result = await fetchStatsData(TODAY, TODAY);
    expect(result.global.avgFuelConsumption).toBe(0);
    expect(result.byVehicle[0].avgFuelDelta).toBe(0);
  });

  it('calcule la moyenne uniquement sur les trajets descendants (mix de cas)', async () => {
    // trip-A : delta 30 (valide)
    await seedTrip({
      id: 'trip-a',
      vehicleId: 'VL001',
      driverId: 'user-1',
      checkOutAt: `${TODAY}T06:00:00.000Z`,
      checkInAt: `${TODAY}T08:00:00.000Z`,
      fuelOut: 90,
      fuelIn: 60,
    });
    // trip-b : recharge → exclu
    await db.execute({
      sql: `INSERT INTO Trip (id, vehicleId, driverId, missionType, checkOutAt, checkInAt, fuelOut, fuelIn, conditionOut, mileageOut)
            VALUES (?,?,?,?,?,?,?,?,?,?)`,
      args: ['trip-b', 'VL001', 'user-1', 'LOGISTIQUE', `${TODAY}T09:00:00.000Z`, `${TODAY}T11:00:00.000Z`, 40, 80, 'BON', 10000],
    });
    // trip-c : delta 10 (valide)
    await db.execute({
      sql: `INSERT INTO Trip (id, vehicleId, driverId, missionType, checkOutAt, checkInAt, fuelOut, fuelIn, conditionOut, mileageOut)
            VALUES (?,?,?,?,?,?,?,?,?,?)`,
      args: ['trip-c', 'VL001', 'user-1', 'LOGISTIQUE', `${TODAY}T12:00:00.000Z`, `${TODAY}T14:00:00.000Z`, 70, 60, 'BON', 10100],
    });

    const result = await fetchStatsData(TODAY, TODAY);
    // Moyenne de 30 et 10 = 20
    expect(result.global.avgFuelConsumption).toBe(20);
    expect(result.byVehicle[0].avgFuelDelta).toBe(20);
  });
});
