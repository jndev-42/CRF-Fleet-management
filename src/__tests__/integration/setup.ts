/**
 * Integration test setup using a temporary file-based SQLite DB.
 *
 * Why not file::memory:?
 * @libsql/client's db.transaction('write') opens a second connection internally.
 * With file::memory:, that second connection gets a fresh empty database.
 * A temp file DB ensures all connections share the same data.
 */
import { createClient } from '@libsql/client';
import { beforeEach, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const tmpDir = mkdtempSync(join(tmpdir(), 'cr-chauffeur-test-'));
const dbPath = join(tmpDir, 'test.db');

export const db = createClient({ url: `file:${dbPath}` });

async function createTables() {
  await db.execute(`CREATE TABLE IF NOT EXISTS "Vehicle" (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT,
    plate TEXT,
    status TEXT NOT NULL DEFAULT 'AVAILABLE',
    parkingSpot TEXT,
    fuelLevel INTEGER DEFAULT 100,
    mileage INTEGER DEFAULT 0,
    hasDSA INTEGER DEFAULT 0,
    notes TEXT,
    vin TEXT,
    fuelType TEXT DEFAULT 'Essence',
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS "Trip" (
    id TEXT PRIMARY KEY,
    vehicleId TEXT NOT NULL,
    driverName TEXT NOT NULL,
    driverEmail TEXT NOT NULL,
    missionType TEXT,
    missionName TEXT,
    checkOutAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    checkInAt DATETIME,
    mileageOut INTEGER,
    mileageIn INTEGER,
    fuelOut INTEGER,
    fuelIn INTEGER,
    conditionOut TEXT,
    conditionIn TEXT,
    cleanlinessOut TEXT,
    cleanlinessIn TEXT,
    parkingOut TEXT,
    parkingIn TEXT,
    dsaChecked INTEGER DEFAULT 0,
    incident TEXT,
    commentsOut TEXT,
    commentsIn TEXT,
    secondDriverName TEXT,
    secondDriverEmail TEXT,
    checklistOut TEXT,
    checklistIn TEXT,
    driveFolderId TEXT,
    parkingPhoto TEXT,
    renaultDataValidated INTEGER DEFAULT NULL,
    renaultLastCheckedAt TEXT DEFAULT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vehicleId) REFERENCES Vehicle(id)
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS "Reservation" (
    id TEXT PRIMARY KEY,
    vehicleId TEXT NOT NULL,
    userEmail TEXT NOT NULL,
    userName TEXT NOT NULL DEFAULT '',
    startTime DATETIME NOT NULL,
    endTime DATETIME NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vehicleId) REFERENCES Vehicle(id)
  )`);
}

async function truncateTables() {
  await db.execute(`DELETE FROM "Trip"`);
  await db.execute(`DELETE FROM "Reservation"`);
  await db.execute(`DELETE FROM "Vehicle"`);
}

// Create tables once on first import
let tablesCreated = false;
async function ensureTables() {
  if (!tablesCreated) {
    await createTables();
    tablesCreated = true;
  }
}

beforeEach(async () => {
  await ensureTables();
  await truncateTables();
});

afterAll(async () => {
  db.close();
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
});

export async function seedVehicle(overrides: Partial<{
  id: string;
  name: string;
  type: string;
  status: string;
  mileage: number;
  fuelLevel: number;
  vin: string | null;
  parkingSpot: string | null;
}> = {}) {
  const v = {
    id: 'VL001',
    name: 'VL186',
    type: 'VL',
    status: 'AVAILABLE',
    mileage: 10000,
    fuelLevel: 75,
    vin: null,
    parkingSpot: 'Baigneur',
    ...overrides,
  };
  await db.execute({
    sql: `INSERT INTO "Vehicle" (id, name, type, status, mileage, fuelLevel, vin, parkingSpot)
          VALUES (?,?,?,?,?,?,?,?)`,
    args: [v.id, v.name, v.type, v.status, v.mileage, v.fuelLevel, v.vin, v.parkingSpot],
  });
  return v;
}

export async function seedTrip(overrides: Partial<{
  id: string;
  vehicleId: string;
  driverName: string;
  driverEmail: string;
  missionType: string;
  checkOutAt: string;
  conditionOut: string;
  mileageOut: number;
  fuelOut: number;
  checkInAt: string | null;
  conditionIn: string | null;
  secondDriverEmail: string | null;
  mileageIn: number | null;
  fuelIn: number | null;
}> = {}) {
  const t = {
    id: 'trip-1',
    vehicleId: 'VL001',
    driverName: 'Test Driver',
    driverEmail: 'driver@test.com',
    missionType: 'LOGISTIQUE',
    checkOutAt: new Date().toISOString(),
    conditionOut: 'BON',
    mileageOut: 10000,
    fuelOut: 75,
    checkInAt: null,
    conditionIn: null,
    secondDriverEmail: null,
    mileageIn: null,
    fuelIn: null,
    ...overrides,
  };
  await db.execute({
    sql: `INSERT INTO "Trip" (
            id, vehicleId, driverName, driverEmail, missionType,
            checkOutAt, conditionOut, mileageOut, fuelOut,
            checkInAt, conditionIn, mileageIn, fuelIn, secondDriverEmail
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [
      t.id, t.vehicleId, t.driverName, t.driverEmail, t.missionType,
      t.checkOutAt, t.conditionOut, t.mileageOut, t.fuelOut,
      t.checkInAt, t.conditionIn, t.mileageIn, t.fuelIn, t.secondDriverEmail,
    ],
  });
  return t;
}
