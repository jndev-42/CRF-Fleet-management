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
    maxFuelCapacity INTEGER,
    maxBatteryCapacityKwh INTEGER,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS "User" (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS "Trip" (
    id TEXT PRIMARY KEY,
    vehicleId TEXT NOT NULL,
    driverId TEXT REFERENCES "User"(id),
    secondDriverId TEXT REFERENCES "User"(id),
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

  await db.execute(`CREATE TABLE IF NOT EXISTS "Role" (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS "UserRole" (
    userId TEXT NOT NULL,
    roleId TEXT NOT NULL,
    PRIMARY KEY (userId, roleId),
    FOREIGN KEY (userId) REFERENCES "User"(id),
    FOREIGN KEY (roleId) REFERENCES "Role"(id)
  )`);
}

async function truncateTables() {
  await db.execute(`DELETE FROM "UserRole"`);
  await db.execute(`DELETE FROM "Trip"`);
  await db.execute(`DELETE FROM "Reservation"`);
  await db.execute(`DELETE FROM "Vehicle"`);
  await db.execute(`DELETE FROM "User"`);
  await db.execute(`DELETE FROM "Role"`);
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
  maxFuelCapacity: number | null;
  maxBatteryCapacityKwh: number | null;
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
    maxFuelCapacity: null,
    maxBatteryCapacityKwh: null,
    ...overrides,
  };
  await db.execute({
    sql: `INSERT INTO "Vehicle" (id, name, type, status, mileage, fuelLevel, vin, parkingSpot, maxFuelCapacity, maxBatteryCapacityKwh)
          VALUES (?,?,?,?,?,?,?,?,?,?)`,
    args: [v.id, v.name, v.type, v.status, v.mileage, v.fuelLevel, v.vin, v.parkingSpot, v.maxFuelCapacity, v.maxBatteryCapacityKwh],
  });
  return v;
}

export async function seedUser(overrides: Partial<{
  id: string;
  email: string;
  name: string;
}> = {}) {
  const u = {
    id: 'user-driver',
    email: 'driver@test.com',
    name: 'Test Driver',
    ...overrides,
  };
  await db.execute({
    sql: `INSERT OR IGNORE INTO "User" (id, email, name) VALUES (?,?,?)`,
    args: [u.id, u.email, u.name],
  });
  return u;
}

export async function seedRoles(names: string[] = ['ADMIN', 'RESPO', 'CHVL', 'CHVPSP', 'GUEST']) {
  for (const name of names) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO "Role" (id, name) VALUES (?, ?)`,
      args: [name.toLowerCase(), name],
    });
  }
}

export async function seedUserRole(userId: string, roleName: string) {
  const roleRes = await db.execute({
    sql: `SELECT id FROM "Role" WHERE name = ?`,
    args: [roleName],
  });
  if (roleRes.rows.length > 0) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO "UserRole" (userId, roleId) VALUES (?, ?)`,
      args: [userId, roleRes.rows[0].id],
    });
  }
}

export async function seedTrip(overrides: Partial<{
  id: string;
  vehicleId: string;
  driverId: string;
  missionType: string;
  checkOutAt: string;
  conditionOut: string;
  mileageOut: number;
  fuelOut: number;
  checkInAt: string | null;
  conditionIn: string | null;
  secondDriverId: string | null;
  mileageIn: number | null;
  fuelIn: number | null;
}> = {}) {
  const t = {
    id: 'trip-1',
    vehicleId: 'VL001',
    driverId: 'user-driver',
    missionType: 'LOGISTIQUE',
    checkOutAt: new Date().toISOString(),
    conditionOut: 'BON',
    mileageOut: 10000,
    fuelOut: 75,
    checkInAt: null,
    conditionIn: null,
    secondDriverId: null,
    mileageIn: null,
    fuelIn: null,
    ...overrides,
  };
  await db.execute({
    sql: `INSERT INTO "Trip" (
            id, vehicleId, driverId, missionType,
            checkOutAt, conditionOut, mileageOut, fuelOut,
            checkInAt, conditionIn, mileageIn, fuelIn, secondDriverId
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [
      t.id, t.vehicleId, t.driverId, t.missionType,
      t.checkOutAt, t.conditionOut, t.mileageOut, t.fuelOut,
      t.checkInAt, t.conditionIn, t.mileageIn, t.fuelIn, t.secondDriverId,
    ],
  });
  return t;
}
