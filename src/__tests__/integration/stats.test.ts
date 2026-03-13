/**
 * Tests d'intégration pour fetchStatsData (src/lib/stats.ts).
 *
 * Vérifie :
 * - avgFuelConsumption : exclut les trajets où le niveau a monté (recharge / plein)
 * - avgKwhPer100km : calcul correct pour les VE, exclusion si maxBatteryCapacityKwh null,
 *   séparation correcte dans une flotte mixte fuel/EV
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

describe('fetchStatsData — avgKwhPer100km', () => {
  it('calcule avgKwhPer100km et totalKwhConsumed pour un VE (capacity=50, delta=20%, km=100)', async () => {
    // Seed a second EV vehicle with maxBatteryCapacityKwh=50
    await seedVehicle({ id: 'VL-EV', name: 'VL-EV', maxBatteryCapacityKwh: 50 });
    await seedTrip({
      id: 'trip-ev-1',
      vehicleId: 'VL-EV',
      driverId: 'user-1',
      checkOutAt: `${TODAY}T08:00:00.000Z`,
      checkInAt: `${TODAY}T10:00:00.000Z`,
      fuelOut: 80,
      fuelIn: 60,   // delta = 20%
      mileageOut: 10000,
      mileageIn: 10100, // 100 km
    });

    const result = await fetchStatsData(TODAY, TODAY);
    // kWh consumed = 20% * 50 kWh = 10 kWh over 100 km → 10 kWh/100km
    expect(result.global.avgKwhPer100km).toBeCloseTo(10, 1);
    expect(result.global.totalKwhConsumed).toBeCloseTo(10, 1);
    const evVehicle = result.byVehicle.find(v => v.vehicleName === 'VL-EV');
    expect(evVehicle?.avgKwhPer100km).toBeCloseTo(10, 1);
    const evDriver = result.byDriver.find(d => d.driverId === 'user-1');
    expect(evDriver?.avgKwhPer100km).toBeCloseTo(10, 1);
  });

  it('exclut les VE sans maxBatteryCapacityKwh (avgKwhPer100km = 0)', async () => {
    // VL001 seeded in beforeEach has maxBatteryCapacityKwh: null
    await seedTrip({
      id: 'trip-no-cap',
      vehicleId: 'VL001',
      driverId: 'user-1',
      checkOutAt: `${TODAY}T08:00:00.000Z`,
      checkInAt: `${TODAY}T10:00:00.000Z`,
      fuelOut: 80,
      fuelIn: 60,
      mileageOut: 10000,
      mileageIn: 10100,
    });

    const result = await fetchStatsData(TODAY, TODAY);
    expect(result.global.avgKwhPer100km).toBe(0);
    expect(result.global.totalKwhConsumed).toBe(0);
  });

  it('flotte mixte : L/100km et kWh/100km sont calculés séparément', async () => {
    // VL001 (beforeEach) gets maxFuelCapacity=50 → use a separate vehicle
    await seedVehicle({ id: 'VL-FUEL', name: 'VL-FUEL', maxFuelCapacity: 50, maxBatteryCapacityKwh: null });
    await seedVehicle({ id: 'VL-EV2', name: 'VL-EV2', maxFuelCapacity: null, maxBatteryCapacityKwh: 60 });
    await seedUser({ id: 'user-2', email: 'driver2@test.com', name: 'Driver Two' });

    // Fuel trip: delta=20%, 100km → (20%*50)/100*100 = 10 L/100km
    await seedTrip({
      id: 'trip-fuel',
      vehicleId: 'VL-FUEL',
      driverId: 'user-1',
      checkOutAt: `${TODAY}T08:00:00.000Z`,
      checkInAt: `${TODAY}T09:00:00.000Z`,
      fuelOut: 80,
      fuelIn: 60,
      mileageOut: 10000,
      mileageIn: 10100,
    });
    // EV trip: delta=20%, 100km → (20%*60)/100*100 = 12 kWh/100km
    await seedTrip({
      id: 'trip-ev',
      vehicleId: 'VL-EV2',
      driverId: 'user-2',
      checkOutAt: `${TODAY}T10:00:00.000Z`,
      checkInAt: `${TODAY}T11:00:00.000Z`,
      fuelOut: 80,
      fuelIn: 60,
      mileageOut: 20000,
      mileageIn: 20100,
    });

    const result = await fetchStatsData(TODAY, TODAY);
    // Fuel vehicle contributes to L/100km only
    expect(result.global.avgLPer100km).toBeCloseTo(10, 1);
    // EV vehicle contributes to kWh/100km only
    expect(result.global.avgKwhPer100km).toBeCloseTo(12, 1);
  });
});
