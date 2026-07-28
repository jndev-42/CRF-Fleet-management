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

const tmpDir = mkdtempSync(join(tmpdir(), 'martine-test-'));
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
    desinfTracking INTEGER DEFAULT 0,
    qrToken TEXT,
    notes TEXT,
    vin TEXT,
    fuelType TEXT DEFAULT 'Essence',
    maxFuelCapacity INTEGER,
    maxBatteryCapacityKwh INTEGER,
    lastDesinfDate TEXT,
    nextDesinfMaxDate TEXT,
    firstRegistrationDate TEXT,
    revisionKmInterval INTEGER,
    revisionYearInterval INTEGER,
    ulId TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS "User" (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    papiers_valides INTEGER NOT NULL DEFAULT 1,
    last_validation TEXT,
    start_date_invalidation_process TEXT,
    validated_by TEXT
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
    desinfResponsable TEXT,
    desinfLotNumber TEXT,
    desinfResponsableId TEXT,
    desinfType TEXT,
    desinfNotes TEXT,
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

  await db.execute(`CREATE TABLE IF NOT EXISTS "UniteLocale" (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    phoneNumbers TEXT,
    defaultParkingSpots TEXT,
    stampImage TEXT,
    dtCode TEXT
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

  await db.execute(`CREATE TABLE IF NOT EXISTS "Notification" (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    url TEXT,
    isRead INTEGER NOT NULL DEFAULT 0,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ulId TEXT,
    FOREIGN KEY (userId) REFERENCES "User"(id) ON DELETE CASCADE
  )`);

  // ── Nouveau système d'inventaire ────────────────────────────────────────────

  await db.execute(`CREATE TABLE IF NOT EXISTS "InvStockList" (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    ulId TEXT NOT NULL DEFAULT 'default',
    isDefault INTEGER NOT NULL DEFAULT 0,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS "InvItem" (
    id TEXT NOT NULL PRIMARY KEY,
    stockId TEXT REFERENCES "InvStockList"("id") ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT,
    quantity INTEGER NOT NULL DEFAULT 0,
    minStock INTEGER,
    notes TEXT,
    ulId TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS "InvBatch" (
    id TEXT NOT NULL PRIMARY KEY,
    itemId TEXT NOT NULL REFERENCES "InvItem"("id") ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 0,
    expiryDate TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS "InvStockLog" (
    id TEXT NOT NULL PRIMARY KEY,
    itemId TEXT NOT NULL REFERENCES "InvItem"("id") ON DELETE CASCADE,
    change INTEGER NOT NULL,
    userName TEXT NOT NULL,
    note TEXT,
    timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS "InvLocation" (
    id TEXT NOT NULL PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('STOCK_CENTRAL', 'PHARMA_TAMPON', 'VEHICLE', 'SAC')),
    name TEXT NOT NULL,
    vehicleId TEXT REFERENCES "Vehicle"(id) ON DELETE CASCADE,
    parentId TEXT REFERENCES "InvLocation"(id) ON DELETE CASCADE,
    isSealed INTEGER NOT NULL DEFAULT 0,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS "InvStock" (
    id TEXT NOT NULL PRIMARY KEY,
    locationId TEXT NOT NULL REFERENCES "InvLocation"(id) ON DELETE CASCADE,
    itemId TEXT NOT NULL REFERENCES "InvItem"(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL DEFAULT 0,
    expiryDate TEXT,
    status TEXT NOT NULL DEFAULT 'OK',
    criticalThreshold INTEGER,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (locationId, itemId)
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS "InvTemplate" (
    id TEXT NOT NULL PRIMARY KEY,
    locationId TEXT NOT NULL REFERENCES "InvLocation"(id) ON DELETE CASCADE,
    itemId TEXT NOT NULL REFERENCES "InvItem"(id) ON DELETE CASCADE,
    targetQty INTEGER NOT NULL DEFAULT 1,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (locationId, itemId)
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS "InvGroupe" (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS "InvGroupeMember" (
    groupeId TEXT NOT NULL REFERENCES "InvGroupe"(id) ON DELETE CASCADE,
    locationId TEXT NOT NULL REFERENCES "InvLocation"(id) ON DELETE CASCADE,
    PRIMARY KEY (groupeId, locationId)
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS "InvTransfer" (
    id TEXT NOT NULL PRIMARY KEY,
    itemId TEXT NOT NULL REFERENCES "InvItem"(id) ON DELETE RESTRICT,
    fromLocationId TEXT REFERENCES "InvLocation"(id) ON DELETE SET NULL,
    toLocationId TEXT NOT NULL REFERENCES "InvLocation"(id) ON DELETE RESTRICT,
    qty INTEGER NOT NULL,
    movedBy TEXT NOT NULL,
    movedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    note TEXT
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS "InvBagTemplate" (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS "InvBagTemplateItem" (
    id TEXT NOT NULL PRIMARY KEY,
    templateId TEXT NOT NULL REFERENCES "InvBagTemplate"(id) ON DELETE CASCADE,
    itemId TEXT NOT NULL REFERENCES "InvItem"(id) ON DELETE CASCADE,
    targetQty INTEGER NOT NULL DEFAULT 1,
    UNIQUE (templateId, itemId)
  )`);

  // templateId sur InvLocation (ajouté après la création de la table)
  const cols = await db.execute(`PRAGMA table_info("InvLocation")`);
  if (!cols.rows.some((r: Record<string, unknown>) => r.name === 'templateId')) {
    await db.execute(`ALTER TABLE "InvLocation" ADD COLUMN templateId TEXT REFERENCES "InvBagTemplate"(id) ON DELETE SET NULL`);
  }
  await db.execute(`CREATE TABLE IF NOT EXISTS "VehicleMaintenanceRecord" (
    id TEXT PRIMARY KEY,
    vehicleId TEXT NOT NULL REFERENCES "Vehicle"(id),
    date TEXT NOT NULL,
    type TEXT NOT NULL,
    mileage INTEGER,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS "VehicleMaintenance" (
    id TEXT PRIMARY KEY,
    vehicleId TEXT NOT NULL REFERENCES "Vehicle"(id),
    startDate TEXT NOT NULL,
    endDate TEXT,
    reason TEXT NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS "MenuSetting" (
    menu_key TEXT NOT NULL PRIMARY KEY,
    visibility TEXT NOT NULL DEFAULT 'available'
               CHECK (visibility IN ('available', 'admin_only', 'disabled')),
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS "CommunicationBanner" (
    id TEXT NOT NULL PRIMARY KEY,
    title TEXT,
    message TEXT NOT NULL,
    target_page TEXT NOT NULL DEFAULT 'ALL',
    type TEXT NOT NULL DEFAULT 'info',
    ul_id TEXT REFERENCES "UniteLocale"(id) ON DELETE CASCADE,
    is_global INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_by TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    created_by_name TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS "IncidentReport" (
    id TEXT PRIMARY KEY,
    vehicleId TEXT NOT NULL REFERENCES "Vehicle"(id) ON DELETE CASCADE,
    userId TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    tripId TEXT REFERENCES "Trip"(id) ON DELETE SET NULL,
    reservationId TEXT REFERENCES "Reservation"(id) ON DELETE SET NULL,
    type TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    occurredAt TEXT,
    location TEXT,
    flashDetails TEXT,
    accidentDetails TEXT,
    damages TEXT,
    victims TEXT,
    actions TEXT,
    context TEXT,
    description TEXT,
    retrospection TEXT,
    driveFolderId TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    submittedAt TEXT
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS "ExpenseReport" (
    id                     TEXT NOT NULL PRIMARY KEY,
    userId                 TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    submittedAt            TEXT NOT NULL,
    status                 TEXT NOT NULL DEFAULT 'soumis',
    imputation             TEXT NOT NULL DEFAULT 'DLUS',
    customImputation       TEXT,
    requestRefund          INTEGER NOT NULL DEFAULT 1,
    noReceiptDeclaration   INTEGER NOT NULL DEFAULT 0,
    driveFolderId          TEXT,
    total                  REAL NOT NULL DEFAULT 0.0,
    items                  TEXT NOT NULL,
    ulId                   TEXT NOT NULL DEFAULT 'ul-paris-18',
    validatedAt            TEXT,
    validatedBy            TEXT REFERENCES "User"(id) ON DELETE SET NULL,
    rejectionComment       TEXT,
    rejectedAt             TEXT,
    rejectedBy             TEXT REFERENCES "User"(id) ON DELETE SET NULL,
    paidAt                 TEXT,
    paidBy                 TEXT REFERENCES "User"(id) ON DELETE SET NULL,
    userSignature          TEXT,
    userFunction           TEXT,
    validatorSignature     TEXT,
    createdAt              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);


  await db.execute(`CREATE TABLE IF NOT EXISTS "UniteLocale" (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    phoneNumbers TEXT,
    defaultParkingSpots TEXT,
    stampImage TEXT,
    dtCode TEXT
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS "UserUL" (
    userId TEXT NOT NULL,
    ulId TEXT NOT NULL,
    is_home INTEGER NOT NULL DEFAULT 0,
    roles TEXT,
    PRIMARY KEY (userId, ulId),
    FOREIGN KEY (userId) REFERENCES "User"(id) ON DELETE CASCADE,
    FOREIGN KEY (ulId) REFERENCES "UniteLocale"(id) ON DELETE CASCADE
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS "mission_reports" (
    "id"                    TEXT PRIMARY KEY,
    "submitted_by"          TEXT NOT NULL,
    "submitted_at"          TEXT NOT NULL,
    "mission_type"          TEXT NOT NULL,
    "mission_name"          TEXT NOT NULL,
    "mission_date"          TEXT NOT NULL,
    "location"              TEXT NOT NULL,
    "volunteers"            TEXT NOT NULL,
    "pegass_ok"             INTEGER NOT NULL DEFAULT 1,
    "vehicle_id"            TEXT,
    "driver_id"             TEXT,
    "victim_count"          INTEGER NOT NULL DEFAULT 0,
    "ul18_present"          INTEGER,
    "team_dynamics"         TEXT,
    "all_found_place"       INTEGER,
    "member_difficulties"   INTEGER,
    "free_comment"          TEXT,
    "had_acr"               INTEGER NOT NULL DEFAULT 0,
    "had_hemorrhage"        INTEGER NOT NULL DEFAULT 0,
    "had_complex_care"      INTEGER NOT NULL DEFAULT 0,
    "needs_followup"        INTEGER NOT NULL DEFAULT 0,
    "drive_folder_id"       TEXT,
    "signed_report_drive_id" TEXT,
    "ulId"                  TEXT
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS "mission_report_supplies" (
    "id"            TEXT PRIMARY KEY,
    "report_id"     TEXT NOT NULL,
    "category"      TEXT NOT NULL,
    "item_name"     TEXT NOT NULL,
    "quantity_used" INTEGER NOT NULL DEFAULT 0
  )`);
}

async function truncateTables() {
  await db.execute(`DELETE FROM "mission_report_supplies"`);
  await db.execute(`DELETE FROM "mission_reports"`);
  // Nouveau système inventaire (ordre FK-safe)
  await db.execute(`DELETE FROM "InvTransfer"`);
  await db.execute(`DELETE FROM "InvGroupeMember"`);
  await db.execute(`DELETE FROM "InvStock"`);
  await db.execute(`DELETE FROM "InvTemplate"`);
  await db.execute(`DELETE FROM "InvBagTemplateItem"`);
  await db.execute(`DELETE FROM "InvLocation"`);
  await db.execute(`DELETE FROM "InvBagTemplate"`);
  await db.execute(`DELETE FROM "InvBatch"`);
  await db.execute(`DELETE FROM "InvItem"`);
  await db.execute(`DELETE FROM "InvGroupe"`);
  await db.execute(`DELETE FROM "Notification"`);
  await db.execute(`DELETE FROM "IncidentReport"`);
  await db.execute(`DELETE FROM "UserRole"`);
  await db.execute(`DELETE FROM "UserUL"`);
  await db.execute(`DELETE FROM "UniteLocale"`);
  await db.execute(`DELETE FROM "Trip"`);
  await db.execute(`DELETE FROM "Reservation"`);
  await db.execute(`DELETE FROM "VehicleMaintenanceRecord"`);
  await db.execute(`DELETE FROM "VehicleMaintenance"`);
  await db.execute(`DELETE FROM "Vehicle"`);
  await db.execute(`DELETE FROM "User"`);
  await db.execute(`DELETE FROM "Role"`);
  await db.execute(`DELETE FROM "MenuSetting"`);
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
  plate: string;
  status: string;
  mileage: number;
  fuelLevel: number;
  vin: string | null;
  parkingSpot: string | null;
  maxFuelCapacity: number | null;
  maxBatteryCapacityKwh: number | null;
  lastDesinfDate: string | null;
  nextDesinfMaxDate: string | null;
  firstRegistrationDate: string | null;
  revisionKmInterval: number | null;
  revisionYearInterval: number | null;
  desinfTracking: boolean | number;
  qrToken: string | null;
  ulId: string | null;
}> = {}) {
  const v = {
    id: 'VL001',
    name: 'VL186',
    type: 'VL',
    plate: 'AB-123-CD',
    status: 'AVAILABLE',
    mileage: 10000,
    fuelLevel: 75,
    vin: null,
    parkingSpot: 'Baigneur',
    maxFuelCapacity: null,
    maxBatteryCapacityKwh: null,
    lastDesinfDate: null,
    nextDesinfMaxDate: null,
    firstRegistrationDate: null,
    revisionKmInterval: null,
    revisionYearInterval: null,
    desinfTracking: 0,
    qrToken: null,
    ulId: 'ul-paris-18',
    ...overrides,
  };
  await db.execute({
    sql: `INSERT INTO "Vehicle" (id, name, type, plate, status, mileage, fuelLevel, vin, parkingSpot, maxFuelCapacity, maxBatteryCapacityKwh, lastDesinfDate, nextDesinfMaxDate, firstRegistrationDate, revisionKmInterval, revisionYearInterval, desinfTracking, qrToken, ulId)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [v.id, v.name, v.type, v.plate, v.status, v.mileage, v.fuelLevel, v.vin, v.parkingSpot, v.maxFuelCapacity, v.maxBatteryCapacityKwh, v.lastDesinfDate, v.nextDesinfMaxDate, v.firstRegistrationDate, v.revisionKmInterval, v.revisionYearInterval, v.desinfTracking ? 1 : 0, v.qrToken, v.ulId],
  });
  return v;
}

export async function seedUser(overrides: Partial<{
  id: string;
  email: string;
  name: string;
  papiers_valides: number;
  last_validation: string | null;
  start_date_invalidation_process: string | null;
  validated_by: string | null;
}> = {}) {
  const u = {
    id: 'user-driver',
    email: 'driver@test.com',
    name: 'Test Driver',
    papiers_valides: 1,
    last_validation: null,
    start_date_invalidation_process: null,
    validated_by: null,
    ...overrides,
  };
  await db.execute({
    sql: `INSERT OR IGNORE INTO "User" (id, email, name, papiers_valides, last_validation, start_date_invalidation_process, validated_by) VALUES (?,?,?,?,?,?,?)`,
    args: [u.id, u.email, u.name, u.papiers_valides, u.last_validation, u.start_date_invalidation_process, u.validated_by],
  });
  return u;
}

export async function seedRoles(names: string[] = ['SUPER_ADMIN', 'ADMIN', 'PRESIDENT', 'TRESORIER', 'CADRE', 'CHVL', 'CHVPSP', 'INACTIF', 'CI/RPAPS']) {
  for (const name of names) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO "Role" (id, name) VALUES (?, ?)`,
      args: [name.toLowerCase().replace('/', '-'), name],
    });
  }
}

export async function seedMenuSettings(overrides: Partial<Record<string, string>> = {}) {
  const defaults: Record<string, string> = {
    stats: 'available',
    inventory: 'available',
    missions: 'available',
    ...overrides,
  };
  for (const [key, visibility] of Object.entries(defaults)) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO "MenuSetting" (menu_key, visibility) VALUES (?, ?)`,
      args: [key, visibility],
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
  desinfResponsableId: string | null;
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
    desinfResponsableId: null,
    ...overrides,
  };
  await db.execute({
    sql: `INSERT INTO "Trip" (
            id, vehicleId, driverId, missionType,
            checkOutAt, conditionOut, mileageOut, fuelOut,
            checkInAt, conditionIn, mileageIn, fuelIn, secondDriverId,
            desinfResponsableId
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [
      t.id, t.vehicleId, t.driverId, t.missionType,
      t.checkOutAt, t.conditionOut, t.mileageOut, t.fuelOut,
      t.checkInAt, t.conditionIn, t.mileageIn, t.fuelIn, t.secondDriverId,
      t.desinfResponsableId,
    ],
  });
  return t;
}

// ── Seed helpers pour le système d'inventaire ────────────────────────────────

export async function seedInvItem(overrides: Partial<{
  id: string;
  name: string;
  category: string | null;
  notes: string | null;
  quantity: number;
}> = {}) {
  const item = {
    id: 'inv-item-1',
    name: 'Article catalogue test',
    category: 'Test',
    notes: null,
    quantity: 0,
    ...overrides,
  };
  await db.execute({
    sql: `INSERT OR IGNORE INTO "InvItem" (id, name, category, quantity, notes) VALUES (?,?,?,?,?)`,
    args: [item.id, item.name, item.category, item.quantity, item.notes],
  });
  return item;
}

export async function seedInvLocation(overrides: Partial<{
  id: string;
  type: 'STOCK_CENTRAL' | 'PHARMA_TAMPON' | 'VEHICLE' | 'SAC';
  name: string;
  vehicleId: string | null;
  parentId: string | null;
  isSealed: number;
}> = {}) {
  const loc = {
    id: 'inv-loc-1',
    type: 'STOCK_CENTRAL' as const,
    name: 'Stock Central Test',
    vehicleId: null,
    parentId: null,
    isSealed: 0,
    ...overrides,
  };
  await db.execute({
    sql: `INSERT OR IGNORE INTO "InvLocation" (id, type, name, vehicleId, parentId, isSealed) VALUES (?,?,?,?,?,?)`,
    args: [loc.id, loc.type, loc.name, loc.vehicleId, loc.parentId, loc.isSealed],
  });
  return loc;
}

export async function seedBagTemplate(overrides: Partial<{
  id: string;
  name: string;
}> = {}) {
  const tpl = {
    id: 'bag-tpl-1',
    name: 'Modèle test',
    ...overrides,
  };
  await db.execute({
    sql: `INSERT OR IGNORE INTO "InvBagTemplate" (id, name) VALUES (?, ?)`,
    args: [tpl.id, tpl.name],
  });
  return tpl;
}

export async function seedBagTemplateItem(overrides: Partial<{
  id: string;
  templateId: string;
  itemId: string;
  targetQty: number;
}> = {}) {
  const item = {
    id: 'bag-tpl-item-1',
    templateId: 'bag-tpl-1',
    itemId: 'inv-item-1',
    targetQty: 2,
    ...overrides,
  };
  await db.execute({
    sql: `INSERT OR IGNORE INTO "InvBagTemplateItem" (id, templateId, itemId, targetQty) VALUES (?, ?, ?, ?)`,
    args: [item.id, item.templateId, item.itemId, item.targetQty],
  });
  return item;
}

export async function seedInvStock(overrides: Partial<{
  id: string;
  locationId: string;
  itemId: string;
  quantity: number;
  status: string;
  expiryDate: string | null;
  criticalThreshold: number | null;
}> = {}) {
  const stock = {
    id: 'inv-stock-1',
    locationId: 'inv-loc-1',
    itemId: 'inv-item-1',
    quantity: 5,
    status: 'OK',
    expiryDate: null,
    criticalThreshold: null,
    ...overrides,
  };
  await db.execute({
    sql: `INSERT OR IGNORE INTO "InvStock" (id, locationId, itemId, quantity, status, expiryDate, criticalThreshold) VALUES (?,?,?,?,?,?,?)`,
    args: [stock.id, stock.locationId, stock.itemId, stock.quantity, stock.status, stock.expiryDate, stock.criticalThreshold],
  });
  return stock;
}

export async function seedUniteLocale(overrides: Partial<{
  id: string;
  name: string;
  slug: string;
}> = {}) {
  const ul = {
    id: 'ul-paris-18',
    name: 'Paris 18',
    slug: 'paris-18',
    ...overrides,
  };
  await db.execute({
    sql: `INSERT OR IGNORE INTO "UniteLocale" (id, name, slug) VALUES (?, ?, ?)`,
    args: [ul.id, ul.name, ul.slug],
  });
  return ul;
}
