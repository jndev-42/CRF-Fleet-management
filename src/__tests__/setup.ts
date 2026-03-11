/**
 * Setup partagé pour les tests unitaires et de composants.
 *
 * Utilise une DB SQLite en mémoire (`file::memory:`).
 * Suffisant ici car ces tests n'utilisent pas `db.transaction('write')`.
 * Pour les tests d'intégration qui appellent des routes Next.js (qui utilisent
 * des transactions), voir `integration/setup.ts` qui utilise une DB fichier temporaire.
 *
 * Chaque test repart d'une base vide grâce au `beforeEach` DROP/CREATE.
 */
import { createClient } from '@libsql/client';
import { beforeEach } from 'vitest';

export const db = createClient({ url: 'file::memory:' });

async function createTables() {
  await db.execute(`CREATE TABLE IF NOT EXISTS "User" (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

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

  await db.execute(`CREATE TABLE IF NOT EXISTS "VehicleChecklistItem" (
    id TEXT PRIMARY KEY,
    vehicleId TEXT NOT NULL,
    label TEXT NOT NULL,
    type TEXT NOT NULL,
    required INTEGER NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vehicleId) REFERENCES Vehicle(id)
  )`);
}

async function dropTables() {
  await db.execute(`DROP TABLE IF EXISTS "VehicleChecklistItem"`);
  await db.execute(`DROP TABLE IF EXISTS "Reservation"`);
  await db.execute(`DROP TABLE IF EXISTS "Trip"`);
  await db.execute(`DROP TABLE IF EXISTS "Vehicle"`);
  await db.execute(`DROP TABLE IF EXISTS "User"`);
}

beforeEach(async () => {
  await dropTables();
  await createTables();
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

export async function seedUser(overrides: Partial<{
  id: string;
  email: string;
  name: string;
}> = {}) {
  const u = {
    id: 'user-1',
    email: 'driver@test.com',
    name: 'Test Driver',
    ...overrides,
  };
  await db.execute({
    sql: `INSERT INTO "User" (id, email, name) VALUES (?,?,?)`,
    args: [u.id, u.email, u.name],
  });
  return u;
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

export async function seedReservation(overrides: Partial<{
  id: string;
  vehicleId: string;
  userEmail: string;
  userName: string;
  startTime: string;
  endTime: string;
  reason: string;
  status: string;
}> = {}) {
  const r = {
    id: 'res-1',
    vehicleId: 'VL001',
    userEmail: 'driver@test.com',
    userName: 'Test Driver',
    startTime: new Date(Date.now() + 3600000).toISOString(),
    endTime: new Date(Date.now() + 7200000).toISOString(),
    reason: 'Mission test',
    status: 'PENDING',
    ...overrides,
  };
  await db.execute({
    sql: `INSERT INTO "Reservation" (id, vehicleId, userEmail, userName, startTime, endTime, reason, status)
          VALUES (?,?,?,?,?,?,?,?)`,
    args: [r.id, r.vehicleId, r.userEmail, r.userName, r.startTime, r.endTime, r.reason, r.status],
  });
  return r;
}
