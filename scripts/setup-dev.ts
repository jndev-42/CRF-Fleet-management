/**
 * Script d'initialisation de la base de données locale pour le développement.
 * Idempotent — peut être relancé sans risque.
 *
 * Usage : npm run dev:setup
 */
import { createClient } from '@libsql/client';
import crypto from 'crypto';

// DEV_DB_URL allows dev-db-init.ts to target the container sqld (http://localhost:8080).
// Defaults to file:./dev.db when run directly via npm run dev:setup.
const db = createClient({
    url: (process.env.DEV_DB_URL ?? process.env.TURSO_DATABASE_URL ?? 'file:./dev.db').trim(),
    authToken: (process.env.DEV_DB_TOKEN ?? process.env.TURSO_AUTH_TOKEN ?? '').trim(),
});

async function main() {
    console.log('🔧 Initialisation de la base de données dev...\n');

    // ── Rôles & Utilisateurs ──────────────────────────────────────

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "Role" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "name" TEXT NOT NULL UNIQUE
        )
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "InvBatch" (
            "id"         TEXT NOT NULL PRIMARY KEY,
            "itemId"     TEXT NOT NULL REFERENCES "InvItem"("id") ON DELETE CASCADE,
            "quantity"   INTEGER NOT NULL DEFAULT 0,
            "expiryDate" TEXT, -- ISO date string YYYY-MM-DD
            "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "User" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "email" TEXT NOT NULL UNIQUE,
            "name" TEXT,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Idempotent: add license validation columns if they don't exist yet
    const userCols = await db.execute('PRAGMA table_info("User")');
    const colNames = userCols.rows.map(r => r.name as string);
    if (!colNames.includes('papiers_valides')) {
        await db.execute(`ALTER TABLE "User" ADD COLUMN "papiers_valides" INTEGER NOT NULL DEFAULT 1`);
    }
    if (!colNames.includes('last_validation')) {
        await db.execute(`ALTER TABLE "User" ADD COLUMN "last_validation" TEXT`);
    }
    if (!colNames.includes('start_date_invalidation_process')) {
        await db.execute(`ALTER TABLE "User" ADD COLUMN "start_date_invalidation_process" TEXT`);
    }
    if (!colNames.includes('validated_by')) {
        await db.execute(`ALTER TABLE "User" ADD COLUMN "validated_by" TEXT`);
    }

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "UserRole" (
            "userId" TEXT NOT NULL,
            "roleId" TEXT NOT NULL,
            PRIMARY KEY ("userId", "roleId"),
            FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE,
            FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE CASCADE
        )
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "UniteLocale" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "name" TEXT NOT NULL UNIQUE,
            "slug" TEXT NOT NULL UNIQUE,
            "phoneNumbers" TEXT,
            "defaultParkingSpots" TEXT
        )
    `);

    const ulCols = await db.execute('PRAGMA table_info("UniteLocale")');
    if (!ulCols.rows.some(r => r.name === 'defaultParkingSpots')) {
        await db.execute(`ALTER TABLE "UniteLocale" ADD COLUMN "defaultParkingSpots" TEXT`);
    }

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "UserUL" (
            "userId" TEXT NOT NULL,
            "ulId" TEXT NOT NULL,
            "is_home" INTEGER NOT NULL DEFAULT 0,
            "roles" TEXT,
            PRIMARY KEY ("userId", "ulId"),
            FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE,
            FOREIGN KEY ("ulId") REFERENCES "UniteLocale"("id") ON DELETE CASCADE
        )
    `);

    // Seed de l'UL par défaut
    const p18PhoneNumbers = JSON.stringify([
        { label: 'DLUS', number: '06 20 13 93 64' },
        { label: 'DLUSA', number: '06 05 49 99 67' },
        { label: 'MOT', number: '06 16 08 19 06' }
    ]);
    const p18ParkingSpots = JSON.stringify([
        "Baigneur (devant l'UL)",
        "Parking Aubervilliers"
    ]);
    await db.execute({
        sql: `INSERT OR IGNORE INTO "UniteLocale" (id, name, slug, phoneNumbers, defaultParkingSpots) VALUES (?, ?, ?, ?, ?)`,
        args: ['ul-paris-18', 'Paris 18', 'paris-18', p18PhoneNumbers, p18ParkingSpots]
    });
    await db.execute({
        sql: `UPDATE "UniteLocale" SET defaultParkingSpots = ? WHERE id = 'ul-paris-18' AND (defaultParkingSpots IS NULL OR defaultParkingSpots = '')`,
        args: [p18ParkingSpots]
    });

    // Seed des rôles
    const roles = ['ADMIN', 'RESPO', 'CHVL', 'CHVPSP', 'INACTIF', 'SECOURISTE', 'CI/RPAPS'];
    for (const role of roles) {
        await db.execute({
            sql: `INSERT OR IGNORE INTO "Role" (id, name) VALUES (?, ?)`,
            args: [crypto.randomUUID(), role],
        });
    }

    const roleRows = await db.execute(`SELECT id, name FROM "Role"`);
    const roleIds: Record<string, string> = {};
    roleRows.rows.forEach(r => { roleIds[r.name as string] = r.id as string; });

    // ── Véhicules ─────────────────────────────────────────────────

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "Vehicle" (
            "id"          TEXT NOT NULL PRIMARY KEY,
            "name"        TEXT NOT NULL,
            "type"        TEXT,
            "plate"       TEXT,
            "status"      TEXT NOT NULL DEFAULT 'AVAILABLE',
            "parkingSpot" TEXT,
            "fuelLevel"   INTEGER DEFAULT 100,
            "mileage"     INTEGER DEFAULT 0,
            "hasDSA"      INTEGER DEFAULT 0,
            "notes"       TEXT,
            "vin"              TEXT,
            "fuelType"              TEXT DEFAULT 'Essence',
            "maxFuelCapacity"       INTEGER,
            "maxBatteryCapacityKwh" INTEGER,
            "lastDesinfDate"        TEXT,
            "nextDesinfMaxDate"     TEXT,
            "createdAt"             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // ── Sorties (Trip) ────────────────────────────────────────────

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "Trip" (
            "id"                     TEXT NOT NULL PRIMARY KEY,
            "vehicleId"              TEXT NOT NULL,
            "driverId"               TEXT REFERENCES "User" ("id"),
            "secondDriverId"         TEXT REFERENCES "User" ("id"),
            "missionType"            TEXT,
            "missionName"            TEXT,
            "checkOutAt"             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "checkInAt"              DATETIME,
            "mileageOut"             INTEGER,
            "mileageIn"              INTEGER,
            "fuelOut"                INTEGER,
            "fuelIn"                 INTEGER,
            "conditionOut"           TEXT,
            "conditionIn"            TEXT,
            "cleanlinessOut"         TEXT,
            "cleanlinessIn"          TEXT,
            "parkingOut"             TEXT,
            "parkingIn"              TEXT,
            "dsaChecked"             INTEGER DEFAULT 0,
            "incident"               TEXT,
            "commentsOut"            TEXT,
            "commentsIn"             TEXT,
            "checklistOut"           TEXT,
            "checklistIn"            TEXT,
            "driveFolderId"          TEXT,
            "parkingPhoto"           TEXT,
            "renaultDataValidated"   INTEGER DEFAULT NULL,
            "renaultLastCheckedAt"   TEXT DEFAULT NULL,
            "desinfResponsable"      TEXT,
            "desinfLotNumber"        TEXT,
            "createdAt"              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE CASCADE
        )
    `);

    // Migrations idempotentes Vehicle pour DBs existantes
    const vehicleCols = await db.execute(`PRAGMA table_info("Vehicle")`);
    if (!vehicleCols.rows.some(r => r.name === 'maxFuelCapacity')) {
        await db.execute(`ALTER TABLE "Vehicle" ADD COLUMN "maxFuelCapacity" INTEGER`);
        console.log('  ↳ Migration : colonne Vehicle.maxFuelCapacity ajoutée');
    }
    if (!vehicleCols.rows.some(r => r.name === 'maxBatteryCapacityKwh')) {
        await db.execute(`ALTER TABLE "Vehicle" ADD COLUMN "maxBatteryCapacityKwh" INTEGER`);
        console.log('  ↳ Migration : colonne Vehicle.maxBatteryCapacityKwh ajoutée');
    }
    if (!vehicleCols.rows.some(r => r.name === 'lastDesinfDate')) {
        await db.execute(`ALTER TABLE "Vehicle" ADD COLUMN "lastDesinfDate" TEXT`);
        console.log('  ↳ Migration : colonne Vehicle.lastDesinfDate ajoutée');
    }
    if (!vehicleCols.rows.some(r => r.name === 'nextDesinfMaxDate')) {
        await db.execute(`ALTER TABLE "Vehicle" ADD COLUMN "nextDesinfMaxDate" TEXT`);
        console.log('  ↳ Migration : colonne Vehicle.nextDesinfMaxDate ajoutée');
    }
    if (!vehicleCols.rows.some(r => r.name === 'firstRegistrationDate')) {
        await db.execute(`ALTER TABLE "Vehicle" ADD COLUMN "firstRegistrationDate" TEXT`);
        console.log('  ↳ Migration : colonne Vehicle.firstRegistrationDate ajoutée');
    }
    if (!vehicleCols.rows.some(r => r.name === 'revisionKmInterval')) {
        await db.execute(`ALTER TABLE "Vehicle" ADD COLUMN "revisionKmInterval" INTEGER`);
        console.log('  ↳ Migration : colonne Vehicle.revisionKmInterval ajoutée');
    }
    if (!vehicleCols.rows.some(r => r.name === 'revisionYearInterval')) {
        await db.execute(`ALTER TABLE "Vehicle" ADD COLUMN "revisionYearInterval" INTEGER`);
        console.log('  ↳ Migration : colonne Vehicle.revisionYearInterval ajoutée');
    }

    // Migrations idempotentes pour DBs existantes
    const tripCols = await db.execute(`PRAGMA table_info("Trip")`);
    const existingCols = new Set(tripCols.rows.map(r => r.name as string));
    const migrations: Array<[string, string]> = [
        ['cleanlinessOut',         'TEXT'],
        ['cleanlinessIn',          'TEXT'],
        ['incident',               'TEXT'],
        ['parkingPhoto',           'TEXT'],
        ['renaultDataValidated',   'INTEGER DEFAULT NULL'],
        ['renaultLastCheckedAt',   'TEXT DEFAULT NULL'],
        ['driverId',               'TEXT REFERENCES "User" ("id")'],
        ['secondDriverId',         'TEXT REFERENCES "User" ("id")'],
        ['desinfResponsable',      'TEXT'],
        ['desinfLotNumber',        'TEXT'],
    ];
    for (const [col, def] of migrations) {
        if (!existingCols.has(col)) {
            await db.execute(`ALTER TABLE "Trip" ADD COLUMN "${col}" ${def}`);
            console.log(`  ↳ Migration : colonne Trip.${col} ajoutée`);
        }
    }

    // Backfill driverId / secondDriverId from email for existing rows (only if old columns still exist)
    if (existingCols.has('driverEmail')) {
        await db.execute({
            sql: `UPDATE "Trip" SET driverId = (SELECT id FROM "User" WHERE email = Trip.driverEmail) WHERE driverId IS NULL AND driverEmail IS NOT NULL`,
            args: [],
        });
    }
    if (existingCols.has('secondDriverEmail')) {
        await db.execute({
            sql: `UPDATE "Trip" SET secondDriverId = (SELECT id FROM "User" WHERE email = Trip.secondDriverEmail) WHERE secondDriverId IS NULL AND secondDriverEmail IS NOT NULL`,
            args: [],
        });
    }

    // Drop old denormalized driver columns if they exist
    const dropCols = ['driverName', 'driverEmail', 'secondDriverName', 'secondDriverEmail', 'windowsClosed', 'vehicleInspected', 'dsaUsed'];
    for (const col of dropCols) {
        const colInfo = await db.execute({ sql: `PRAGMA table_info(Trip)`, args: [] });
        const colExists = colInfo.rows.some(r => r.name === col);
        if (colExists) {
            await db.execute({ sql: `ALTER TABLE "Trip" DROP COLUMN "${col}"`, args: [] });
            console.log(`  ↳ Migration : colonne Trip.${col} supprimée`);
        }
    }

    // ── Notifications ─────────────────────────────────────────────

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "Notification" (
            "id"        TEXT NOT NULL PRIMARY KEY,
            "userId"    TEXT NOT NULL,
            "title"     TEXT NOT NULL,
            "message"   TEXT NOT NULL,
            "url"       TEXT,
            "isRead"    INTEGER NOT NULL DEFAULT 0,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "ulId"      TEXT,
            FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE
        )
    `);

    await db.execute(`
        CREATE INDEX IF NOT EXISTS "Notification_userId_isRead_idx"
        ON "Notification"("userId", "isRead")
    `);

    // ── Réservations ──────────────────────────────────────────────

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "Reservation" (
            "id"        TEXT NOT NULL PRIMARY KEY,
            "vehicleId" TEXT NOT NULL,
            "userEmail" TEXT NOT NULL,
            "userName"  TEXT NOT NULL,
            "startTime" DATETIME NOT NULL,
            "endTime"   DATETIME NOT NULL,
            "reason"    TEXT,
            "status"    TEXT NOT NULL DEFAULT 'PENDING',
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE CASCADE
        )
    `);

    await db.execute(`
        CREATE INDEX IF NOT EXISTS "Reservation_vehicleId_startTime_idx"
        ON "Reservation"("vehicleId", "startTime")
    `);

    // ── Checklist véhicule ────────────────────────────────────────

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "VehicleChecklistItem" (
            "id"        TEXT NOT NULL PRIMARY KEY,
            "vehicleId" TEXT NOT NULL,
            "label"     TEXT NOT NULL,
            "type"      TEXT NOT NULL CHECK ("type" IN ('checkout', 'checkin')),
            "required"  INTEGER NOT NULL DEFAULT 0,
            "order"     INTEGER NOT NULL DEFAULT 0,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE CASCADE
        )
    `);

    await db.execute(`
        CREATE INDEX IF NOT EXISTS "VehicleChecklistItem_vehicleId_type_idx"
        ON "VehicleChecklistItem"("vehicleId", "type")
    `);

    // Remove DSA checkin checklist items (no longer used)
    await db.execute({ sql: `DELETE FROM "VehicleChecklistItem" WHERE id LIKE 'dsa-checkin-%'`, args: [] });

    // Make DSA checkout checklist items non-required
    await db.execute({ sql: `UPDATE "VehicleChecklistItem" SET required = 0 WHERE id LIKE 'dsa-checkout-%'`, args: [] });

    // ── Contrôle technique & Révisions ───────────────────────────

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "VehicleMaintenanceRecord" (
            "id"        TEXT NOT NULL PRIMARY KEY,
            "vehicleId" TEXT NOT NULL REFERENCES "Vehicle"(id),
            "date"      TEXT NOT NULL,
            "type"      TEXT NOT NULL,
            "mileage"   INTEGER,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // ── Session Renault ───────────────────────────────────────────

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "RenaultSession" (
            "id"        INTEGER PRIMARY KEY DEFAULT 1,
            "idToken"   TEXT NOT NULL,
            "accountId" TEXT NOT NULL,
            "expiresAt" INTEGER NOT NULL
        )
    `);

    // ── Inventaire ────────────────────────────────────────────────

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "InvStockList" (
            "id"        TEXT NOT NULL PRIMARY KEY,
            "name"      TEXT NOT NULL,
            "ulId"      TEXT NOT NULL DEFAULT 'default',
            "isDefault" INTEGER NOT NULL DEFAULT 0,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "InvItem" (
            "id"        TEXT NOT NULL PRIMARY KEY,
            "stockId"   TEXT REFERENCES "InvStockList"("id") ON DELETE CASCADE,
            "name"      TEXT NOT NULL,
            "category"  TEXT,
            "unit"      TEXT NOT NULL DEFAULT 'unité',
            "notes"     TEXT,
            "ulId"      TEXT,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "InvLocation" (
            "id"        TEXT NOT NULL PRIMARY KEY,
            "type"      TEXT NOT NULL CHECK (type IN ('STOCK_CENTRAL', 'PHARMA_TAMPON', 'VEHICLE', 'SAC')),
            "name"      TEXT NOT NULL,
            "vehicleId" TEXT REFERENCES "Vehicle"("id") ON DELETE CASCADE,
            "parentId"  TEXT REFERENCES "InvLocation"("id") ON DELETE CASCADE,
            "isSealed"  INTEGER NOT NULL DEFAULT 0,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS "InvLocation_singleton"
        ON "InvLocation"("type") WHERE type IN ('STOCK_CENTRAL', 'PHARMA_TAMPON')
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "InvStock" (
            "id"                TEXT NOT NULL PRIMARY KEY,
            "locationId"        TEXT NOT NULL REFERENCES "InvLocation"("id") ON DELETE CASCADE,
            "itemId"            TEXT NOT NULL REFERENCES "InvItem"("id") ON DELETE RESTRICT,
            "quantity"          INTEGER NOT NULL DEFAULT 0,
            "expiryDate"        TEXT,
            "status"            TEXT NOT NULL DEFAULT 'OK',
            "criticalThreshold" INTEGER,
            "createdAt"         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt"         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE ("locationId", "itemId")
        )
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "InvTemplate" (
            "id"         TEXT NOT NULL PRIMARY KEY,
            "locationId" TEXT NOT NULL REFERENCES "InvLocation"("id") ON DELETE CASCADE,
            "itemId"     TEXT NOT NULL REFERENCES "InvItem"("id") ON DELETE CASCADE,
            "targetQty"  INTEGER NOT NULL DEFAULT 1,
            "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE ("locationId", "itemId")
        )
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "InvGroupe" (
            "id"          TEXT NOT NULL PRIMARY KEY,
            "name"        TEXT NOT NULL,
            "description" TEXT,
            "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "InvGroupeMember" (
            "groupeId"   TEXT NOT NULL REFERENCES "InvGroupe"("id") ON DELETE CASCADE,
            "locationId" TEXT NOT NULL REFERENCES "InvLocation"("id") ON DELETE CASCADE,
            PRIMARY KEY ("groupeId", "locationId")
        )
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "InvTransfer" (
            "id"             TEXT NOT NULL PRIMARY KEY,
            "itemId"         TEXT NOT NULL REFERENCES "InvItem"("id") ON DELETE RESTRICT,
            "fromLocationId" TEXT REFERENCES "InvLocation"("id") ON DELETE SET NULL,
            "toLocationId"   TEXT NOT NULL REFERENCES "InvLocation"("id") ON DELETE RESTRICT,
            "qty"            INTEGER NOT NULL,
            "movedBy"        TEXT NOT NULL,
            "movedAt"        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "note"           TEXT
        )
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "InvBagTemplate" (
            "id"        TEXT NOT NULL PRIMARY KEY,
            "name"      TEXT NOT NULL UNIQUE,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "InvBagTemplateItem" (
            "id"         TEXT NOT NULL PRIMARY KEY,
            "templateId" TEXT NOT NULL REFERENCES "InvBagTemplate"("id") ON DELETE CASCADE,
            "itemId"     TEXT NOT NULL REFERENCES "InvItem"("id") ON DELETE CASCADE,
            "targetQty"  INTEGER NOT NULL DEFAULT 1,
            UNIQUE ("templateId", "itemId")
        )
    `);

    // Migration idempotente : ajout de templateId sur InvLocation
    const invLocCols = await db.execute(`PRAGMA table_info("InvLocation")`);
    if (!invLocCols.rows.some(r => r.name === 'templateId')) {
        await db.execute(`ALTER TABLE "InvLocation" ADD COLUMN "templateId" TEXT REFERENCES "InvBagTemplate"("id") ON DELETE SET NULL`);
        console.log('  ↳ Migration : colonne InvLocation.templateId ajoutée');
    }

    // ── Comptes Rendus de Mission ─────────────────────────────────

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "mission_reports" (
            "id"                    TEXT PRIMARY KEY,
            "submitted_by"          TEXT NOT NULL REFERENCES "User"(id),
            "submitted_at"          TEXT NOT NULL,
            "mission_type"          TEXT NOT NULL,
            "mission_name"          TEXT NOT NULL,
            "mission_date"          TEXT NOT NULL,
            "location"              TEXT NOT NULL,
            "volunteers"            TEXT NOT NULL,
            "pegass_ok"             INTEGER NOT NULL DEFAULT 1,
            "vehicle_id"            TEXT REFERENCES "Vehicle"(id),
            "driver_id"             TEXT REFERENCES "User"(id),
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
            "ulId"                  TEXT
        )
    `);

    // Idempotent: add drive_folder_id column for existing DBs
    const missionCols = await db.execute('PRAGMA table_info("mission_reports")');
    if (!missionCols.rows.some(r => r.name === 'drive_folder_id')) {
        await db.execute(`ALTER TABLE "mission_reports" ADD COLUMN "drive_folder_id" TEXT`);
        console.log('  ↳ Migration : colonne mission_reports.drive_folder_id ajoutée');
    }
    if (!missionCols.rows.some(r => r.name === 'signed_report_drive_id')) {
        await db.execute(`ALTER TABLE "mission_reports" ADD COLUMN "signed_report_drive_id" TEXT`);
        console.log('  ↳ Migration : colonne mission_reports.signed_report_drive_id ajoutée');
    }

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "mission_report_supplies" (
            "id"            TEXT PRIMARY KEY,
            "report_id"     TEXT NOT NULL REFERENCES "mission_reports"(id) ON DELETE CASCADE,
            "category"      TEXT NOT NULL,
            "item_name"     TEXT NOT NULL,
            "quantity_used" INTEGER NOT NULL DEFAULT 0
        )
    `);

    await db.execute(`CREATE INDEX IF NOT EXISTS "mission_reports_submitted_by_idx" ON "mission_reports"("submitted_by")`);
    await db.execute(`CREATE INDEX IF NOT EXISTS "mission_reports_mission_date_idx" ON "mission_reports"("mission_date")`);
    await db.execute(`CREATE INDEX IF NOT EXISTS "mission_report_supplies_report_id_idx" ON "mission_report_supplies"("report_id")`);

    // ── MenuSetting ───────────────────────────────────────────────

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "MenuSetting" (
            "menu_key"   TEXT NOT NULL PRIMARY KEY,
            "visibility" TEXT NOT NULL DEFAULT 'available'
                         CHECK (visibility IN ('available', 'admin_only', 'disabled')),
            "updatedAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // ── Rapports d'incidents ──────────────────────────────────────

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "IncidentReport" (
            "id"              TEXT PRIMARY KEY,
            "vehicleId"       TEXT NOT NULL REFERENCES "Vehicle"("id") ON DELETE CASCADE,
            "userId"          TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
            "tripId"          TEXT REFERENCES "Trip"("id") ON DELETE SET NULL,
            "reservationId"   TEXT REFERENCES "Reservation"("id") ON DELETE SET NULL,
            "type"            TEXT, -- 'ACCIDENT', 'FLASH'
            "status"          TEXT NOT NULL DEFAULT 'DRAFT',
            "occurredAt"      TEXT, -- ISO Date
            "location"        TEXT,
            "flashDetails"    TEXT, -- JSON: { ficheInter, horsSamu }
            "accidentDetails" TEXT, -- JSON: { crfZones, thirdPartyZones, hasThirdParty, thirdPartyPhotos }
            "damages"         TEXT, -- JSON: { crf: boolean, thirdParty: boolean, urban: boolean, person: boolean }
            "victims"         TEXT, -- JSON: { crf: boolean, thirdParty: boolean, severity: boolean }
            "actions"         TEXT, -- JSON: { emergencyCalled: boolean, onyxContacted: boolean, reportMade: boolean }
            "context"         TEXT, -- JSON: { vehicleStopped: boolean, motion: 'forward' | 'backward' | 'none' }
            "description"     TEXT,
            "retrospection"   TEXT,
            "driveFolderId"   TEXT,
            "createdAt"       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt"       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.execute({ sql: `INSERT OR IGNORE INTO "MenuSetting" (menu_key, visibility) VALUES (?, ?)`, args: ['stats', 'available'] });
    await db.execute({ sql: `INSERT OR IGNORE INTO "MenuSetting" (menu_key, visibility) VALUES (?, ?)`, args: ['inventory', 'available'] });
    await db.execute({ sql: `INSERT OR IGNORE INTO "MenuSetting" (menu_key, visibility) VALUES (?, ?)`, args: ['missions', 'available'] });

    console.log('✅ Tables créées\n');

    // ── Utilisateurs de test ──────────────────────────────────────

    const today = new Date().toISOString().slice(0, 10);
    const devUsers = [
        { email: 'admin@dev.local', name: 'Admin Dev', roles: ['ADMIN', 'CHVL'], papiers_valides: 0, start_date_invalidation_process: today },
        { email: 'respo@dev.local', name: 'Respo Dev', roles: ['RESPO', 'CHVL'], papiers_valides: 0, start_date_invalidation_process: today },
        { email: 'chvl@dev.local', name: 'Chauffeur Dev', roles: ['CHVL'], papiers_valides: 0, start_date_invalidation_process: today },
        { email: 'guest@dev.local', name: 'Inactif Dev', roles: ['INACTIF'], papiers_valides: 1, start_date_invalidation_process: null },
        { email: 'secouriste@dev.local', name: 'Secouriste Dev', roles: ['SECOURISTE'], papiers_valides: 1, start_date_invalidation_process: null },
    ];

    for (const devUser of devUsers) {
        let userId: string;
        const existing = await db.execute({
            sql: `SELECT id FROM "User" WHERE email = ?`,
            args: [devUser.email],
        });

        if (existing.rows.length > 0) {
            userId = existing.rows[0].id as string;
            // Idempotent: update license columns in case they were just added
            await db.execute({
                sql: `UPDATE "User" SET papiers_valides = ?, start_date_invalidation_process = ? WHERE id = ?`,
                args: [devUser.papiers_valides, devUser.start_date_invalidation_process, userId],
            });
            console.log(`↩  ${devUser.email} déjà existant`);
        } else {
            userId = crypto.randomUUID();
            await db.execute({
                sql: `INSERT INTO "User" (id, email, name, papiers_valides, start_date_invalidation_process) VALUES (?, ?, ?, ?, ?)`,
                args: [userId, devUser.email, devUser.name, devUser.papiers_valides, devUser.start_date_invalidation_process],
            });
        }

        for (const roleName of devUser.roles) {
            const rId = roleIds[roleName];
            if (rId) {
                await db.execute({
                    sql: `INSERT OR IGNORE INTO "UserRole" (userId, roleId) VALUES (?, ?)`,
                    args: [userId, rId],
                });
            }
        }

        // Associer à l'UL par défaut (ul-paris-18)
        await db.execute({
            sql: `INSERT OR IGNORE INTO "UserUL" (userId, ulId, is_home, roles) VALUES (?, 'ul-paris-18', 1, ?)`,
            args: [userId, devUser.roles.join(',')],
        });

        console.log(`👤 ${devUser.email.padEnd(24)} roles: ${devUser.roles.join(', ')}`);
    }

    // ── Backfill SECOURISTE pour tous les non-INACTIF ────────────────
    {
        const secouristeRow = await db.execute({ sql: `SELECT id FROM "Role" WHERE name = ?`, args: ['SECOURISTE'] });
        const inactifRow = await db.execute({ sql: `SELECT id FROM "Role" WHERE name = ?`, args: ['INACTIF'] });
        if (secouristeRow.rows.length > 0 && inactifRow.rows.length > 0) {
            const secouristeId = secouristeRow.rows[0].id as string;
            const inactifRoleId = inactifRow.rows[0].id as string;
            // Tous les utilisateurs qui ont au moins un rôle non-INACTIF et qui n'ont pas encore SECOURISTE
            const usersToBackfill = await db.execute({
                sql: `SELECT DISTINCT ur.userId FROM "UserRole" ur
                      JOIN "Role" r ON ur.roleId = r.id
                      WHERE r.name != 'INACTIF'
                        AND ur.userId NOT IN (
                            SELECT userId FROM "UserRole" WHERE roleId = ?
                        )
                        AND ur.userId NOT IN (
                            SELECT DISTINCT ur2.userId FROM "UserRole" ur2 WHERE ur2.roleId = ?
                            EXCEPT
                            SELECT DISTINCT ur3.userId FROM "UserRole" ur3 JOIN "Role" r3 ON ur3.roleId = r3.id WHERE r3.name != 'INACTIF'
                        )`,
                args: [secouristeId, inactifRoleId],
            });
            for (const row of usersToBackfill.rows) {
                await db.execute({
                    sql: `INSERT OR IGNORE INTO "UserRole" (userId, roleId) VALUES (?, ?)`,
                    args: [row.userId, secouristeId],
                });
            }
            if (usersToBackfill.rows.length > 0) {
                console.log(`🔄 Backfill SECOURISTE : ${usersToBackfill.rows.length} utilisateur(s) mis à jour`);
            }
        }
    }

    // ── Véhicules de démonstration ────────────────────────────────

    const count = await db.execute(`SELECT COUNT(*) as n FROM "Vehicle"`);
    if ((count.rows[0].n as number) === 0) {
        const vehicles = [
            { name: 'VL186 — Renault Zoé', type: 'VL', plate: 'EZ-123-RF', fuelType: 'Électrique', fuelLevel: 80, mileage: 12450, parkingSpot: 'Baigneur', maxFuelCapacity: null, maxBatteryCapacityKwh: 52, lastDesinfDate: null, nextDesinfMaxDate: null, firstRegistrationDate: '2018-03-20', revisionKmInterval: 40000, revisionYearInterval: 2 },
            { name: 'VL188 — Renault Kangoo', type: 'VL', plate: 'FZ-456-RF', fuelType: 'Diesel', fuelLevel: 60, mileage: 34200, parkingSpot: 'Baigneur', maxFuelCapacity: 60, maxBatteryCapacityKwh: null, lastDesinfDate: null, nextDesinfMaxDate: null, firstRegistrationDate: '2020-06-15', revisionKmInterval: 15000, revisionYearInterval: 1 },
            { name: 'VL182 — Peugeot 208', type: 'VL', plate: 'GZ-789-RF', fuelType: 'Essence', fuelLevel: 45, mileage: 8900, parkingSpot: 'Baigneur', maxFuelCapacity: 50, maxBatteryCapacityKwh: null, lastDesinfDate: null, nextDesinfMaxDate: null, firstRegistrationDate: '2019-11-08', revisionKmInterval: 40000, revisionYearInterval: 2 },
            { name: 'VPSP01 — Peugeot Boxer', type: 'VPSP', plate: 'HZ-001-RF', fuelType: 'Diesel', fuelLevel: 70, mileage: 52100, parkingSpot: 'Baigneur', maxFuelCapacity: 80, maxBatteryCapacityKwh: null, lastDesinfDate: '2026-02-04', nextDesinfMaxDate: '2026-03-18', firstRegistrationDate: '2021-09-01', revisionKmInterval: null, revisionYearInterval: null },
        ];
        for (const v of vehicles) {
            await db.execute({
                sql: `INSERT INTO "Vehicle" (id, name, type, plate, fuelType, fuelLevel, mileage, parkingSpot, maxFuelCapacity, maxBatteryCapacityKwh, lastDesinfDate, nextDesinfMaxDate, firstRegistrationDate, revisionKmInterval, revisionYearInterval, status, createdAt, updatedAt)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'AVAILABLE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                args: [crypto.randomUUID(), v.name, v.type, v.plate, v.fuelType, v.fuelLevel, v.mileage, v.parkingSpot, v.maxFuelCapacity, v.maxBatteryCapacityKwh, v.lastDesinfDate, v.nextDesinfMaxDate, v.firstRegistrationDate, v.revisionKmInterval, v.revisionYearInterval],
            });
        }
        console.log('\n🚗 4 véhicules de démo créés');
    } else {
        // Idempotent update of maintenance fields for existing vehicles
        await db.execute({
            sql: `UPDATE "Vehicle" SET firstRegistrationDate = '2020-06-15', revisionKmInterval = 15000, revisionYearInterval = 1
                  WHERE name LIKE 'VL188%' AND (firstRegistrationDate IS NULL OR firstRegistrationDate = '')`,
            args: [],
        });
        await db.execute({
            sql: `UPDATE "Vehicle" SET firstRegistrationDate = '2018-03-20', revisionKmInterval = 40000, revisionYearInterval = 2
                  WHERE name LIKE 'VL186%' AND (firstRegistrationDate IS NULL OR firstRegistrationDate = '')`,
            args: [],
        });
        await db.execute({
            sql: `UPDATE "Vehicle" SET firstRegistrationDate = '2019-11-08', revisionKmInterval = 40000, revisionYearInterval = 2
                  WHERE name LIKE 'VL182%' AND (firstRegistrationDate IS NULL OR firstRegistrationDate = '')`,
            args: [],
        });
        await db.execute({
            sql: `UPDATE "Vehicle" SET firstRegistrationDate = '2021-09-01'
                  WHERE name LIKE 'VPSP01%' AND (firstRegistrationDate IS NULL OR firstRegistrationDate = '')`,
            args: [],
        });
        console.log('\n🚗 Véhicules déjà présents, données maintenance mises à jour');
    }

    // ── MaintenanceRecords de démonstration ──────────────────────

    const maintCount = await db.execute(`SELECT COUNT(*) as n FROM "VehicleMaintenanceRecord"`);
    if ((maintCount.rows[0].n as number) === 0) {
        const vl188Row = await db.execute({ sql: `SELECT id FROM "Vehicle" WHERE name LIKE 'VL188%' LIMIT 1`, args: [] });
        const vl186Row = await db.execute({ sql: `SELECT id FROM "Vehicle" WHERE name LIKE 'VL186%' LIMIT 1`, args: [] });
        const vpsp01Row = await db.execute({ sql: `SELECT id FROM "Vehicle" WHERE name LIKE 'VPSP01%' LIMIT 1`, args: [] });

        if (vl188Row.rows.length > 0) {
            const vid = vl188Row.rows[0].id as string;
            await db.execute({ sql: `INSERT INTO "VehicleMaintenanceRecord" (id, vehicleId, date, type, mileage) VALUES (?, ?, ?, ?, ?)`, args: [crypto.randomUUID(), vid, '2024-01-15', 'CT', null] });
            await db.execute({ sql: `INSERT INTO "VehicleMaintenanceRecord" (id, vehicleId, date, type, mileage) VALUES (?, ?, ?, ?, ?)`, args: [crypto.randomUUID(), vid, '2024-01-15', 'REVISION', 62000] });
        }
        if (vl186Row.rows.length > 0) {
            const vid = vl186Row.rows[0].id as string;
            await db.execute({ sql: `INSERT INTO "VehicleMaintenanceRecord" (id, vehicleId, date, type, mileage) VALUES (?, ?, ?, ?, ?)`, args: [crypto.randomUUID(), vid, '2023-06-10', 'CT', null] });
            await db.execute({ sql: `INSERT INTO "VehicleMaintenanceRecord" (id, vehicleId, date, type, mileage) VALUES (?, ?, ?, ?, ?)`, args: [crypto.randomUUID(), vid, '2021-06-10', 'CT', null] });
        }
        if (vpsp01Row.rows.length > 0) {
            const vid = vpsp01Row.rows[0].id as string;
            await db.execute({ sql: `INSERT INTO "VehicleMaintenanceRecord" (id, vehicleId, date, type, mileage) VALUES (?, ?, ?, ?, ?)`, args: [crypto.randomUUID(), vid, '2025-02-20', 'CT', null] });
        }
        console.log('🔧 MaintenanceRecords de démo créés');
    } else {
        console.log('🔧 MaintenanceRecords déjà présents, skip');
    }

    // ── Trips de démonstration ────────────────────────────────────

    const tripCount = await db.execute(`SELECT COUNT(*) as n FROM "Trip"`);
    if ((tripCount.rows[0].n as number) === 0) {
        const vehicleRows = await db.execute(`SELECT id, name, mileage FROM "Vehicle"`);
        const vehicleList = vehicleRows.rows.map(r => ({
            id: r.id as string,
            name: r.name as string,
            mileage: r.mileage as number,
        }));

        // Seed demo drivers as User rows (idempotent)
        const driverDefs = [
            { name: 'Marc Dupont', email: 'marc.dupont@dev.local' },
            { name: 'Sandrine Martin', email: 'sandrine.martin@dev.local' },
            { name: 'Luc Bernard', email: 'luc.bernard@dev.local' },
            { name: 'Amélie Petit', email: 'amelie.petit@dev.local' },
            { name: 'Clément Leroy', email: 'clement.leroy@dev.local' },
        ];
        const driverIds: string[] = [];
        for (const d of driverDefs) {
            const existing = await db.execute({ sql: `SELECT id FROM "User" WHERE email = ?`, args: [d.email] });
            if (existing.rows.length > 0) {
                driverIds.push(existing.rows[0].id as string);
            } else {
                const uid = crypto.randomUUID();
                await db.execute({ sql: `INSERT INTO "User" (id, email, name) VALUES (?, ?, ?)`, args: [uid, d.email, d.name] });
                driverIds.push(uid);
            }
        }

        const missionTypes = ['Opération', 'Formation', 'Logistique', 'Autre'];

        // Track mileage per vehicle
        const vehicleMileage: Record<string, number> = {};
        vehicleList.forEach(v => { vehicleMileage[v.id] = v.mileage; });

        const now = Date.now();
        const tripsToCreate = 25;

        // Assign trips: for VL186 (index 0), Marc gets ~8 out of ~11, Sandrine ~3
        // This achieves >50% dominance for Marc on VL186
        const vehicleDriverMap: Array<{ vehicleIdx: number; driverIdx: number }> = [];

        // VL186: 11 trips - Marc(8), Sandrine(2), Luc(1)
        for (let i = 0; i < 8; i++) vehicleDriverMap.push({ vehicleIdx: 0, driverIdx: 0 });
        vehicleDriverMap.push({ vehicleIdx: 0, driverIdx: 1 });
        vehicleDriverMap.push({ vehicleIdx: 0, driverIdx: 1 });
        vehicleDriverMap.push({ vehicleIdx: 0, driverIdx: 2 });

        // VL188: 8 trips - Sandrine(4), Luc(2), Amélie(1), Clément(1)
        for (let i = 0; i < 4; i++) vehicleDriverMap.push({ vehicleIdx: 1, driverIdx: 1 });
        for (let i = 0; i < 2; i++) vehicleDriverMap.push({ vehicleIdx: 1, driverIdx: 2 });
        vehicleDriverMap.push({ vehicleIdx: 1, driverIdx: 3 });
        vehicleDriverMap.push({ vehicleIdx: 1, driverIdx: 4 });

        // VL182: 4 trips - Marc(1), Amélie(2), Clément(1)
        vehicleDriverMap.push({ vehicleIdx: 2, driverIdx: 0 });
        for (let i = 0; i < 2; i++) vehicleDriverMap.push({ vehicleIdx: 2, driverIdx: 3 });
        vehicleDriverMap.push({ vehicleIdx: 2, driverIdx: 4 });

        // VPSP01: 2 trips - Luc(1), Amélie(1)
        vehicleDriverMap.push({ vehicleIdx: 3, driverIdx: 2 });
        vehicleDriverMap.push({ vehicleIdx: 3, driverIdx: 3 });

        // Shuffle
        for (let i = vehicleDriverMap.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [vehicleDriverMap[i], vehicleDriverMap[j]] = [vehicleDriverMap[j], vehicleDriverMap[i]];
        }

        const tripsList = vehicleDriverMap.slice(0, tripsToCreate);

        for (let i = 0; i < tripsList.length; i++) {
            const { vehicleIdx, driverIdx } = tripsList[i];
            const vehicle = vehicleList[vehicleIdx % vehicleList.length];
            const driverId = driverIds[driverIdx];
            const missionType = missionTypes[Math.floor(Math.random() * missionTypes.length)];

            // Spread trips over last 60 days
            const daysAgo = Math.floor(Math.random() * 58) + 1;
            const checkOutAt = new Date(now - daysAgo * 24 * 60 * 60 * 1000);
            const tripDurationHours = 1 + Math.floor(Math.random() * 6);
            const checkInAt = new Date(checkOutAt.getTime() + tripDurationHours * 60 * 60 * 1000);

            const mileageOut = vehicleMileage[vehicle.id];
            const kmTrip = 20 + Math.floor(Math.random() * 120);
            const mileageIn = mileageOut + kmTrip;
            vehicleMileage[vehicle.id] = mileageIn;

            const fuelOut = 40 + Math.floor(Math.random() * 60);
            const fuelIn = fuelOut - (5 + Math.floor(Math.random() * 20));

            // Leave 2 active trips (no checkIn)
            const isActive = i < 2;

            const incident = (Math.random() < 0.08) ? 'Incident mineur signalé lors de la sortie.' : null;

            await db.execute({
                sql: `INSERT INTO "Trip" (
                    id, vehicleId, driverId, missionType,
                    checkOutAt, checkInAt,
                    mileageOut, mileageIn,
                    fuelOut, fuelIn,
                    conditionOut, conditionIn,
                    incident, createdAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                args: [
                    crypto.randomUUID(),
                    vehicle.id,
                    driverId,
                    missionType,
                    checkOutAt.toISOString(),
                    isActive ? null : checkInAt.toISOString(),
                    mileageOut,
                    isActive ? null : mileageIn,
                    fuelOut,
                    isActive ? null : fuelIn,
                    'Bon état',
                    isActive ? null : 'Bon état',
                    incident,
                ],
            });
        }
        console.log(`\n📊 ${tripsToCreate} trips de démo créés`);
    } else {
        console.log('\n📊 Trips déjà présents, skip');
    }

    // ── Rôle SECOURISTE pour tous les non-INACTIF ───────────────────

    const secouristeRoleId = roleIds['SECOURISTE'];
    if (secouristeRoleId) {
        await db.execute({
            sql: `INSERT OR IGNORE INTO "UserRole" ("userId", "roleId")
                  SELECT u.id, ?
                  FROM "User" u
                  WHERE u.id NOT IN (
                    SELECT ur.userId FROM "UserRole" ur
                    JOIN "Role" r ON r.id = ur.roleId
                    WHERE r.name = 'INACTIF'
                  )`,
            args: [secouristeRoleId],
        });
        console.log('\n🚑 Rôle SECOURISTE assigné aux utilisateurs non-INACTIF');
    }

    // ── Inventaire de démonstration ───────────────────────────────

    const invLocationCount = await db.execute(`SELECT COUNT(*) as n FROM "InvLocation"`);
    if ((invLocationCount.rows[0].n as number) === 0) {
        // Lieux singletons
        await db.execute({ sql: `INSERT OR IGNORE INTO "InvLocation" (id, type, name) VALUES ('loc-stock-central', 'STOCK_CENTRAL', 'Stock Central')`, args: [] });
        await db.execute({ sql: `INSERT OR IGNORE INTO "InvLocation" (id, type, name) VALUES ('loc-pharma-tampon', 'PHARMA_TAMPON', 'Pharmacie Tampon')`, args: [] });

        // Lieux véhicules (récupère les IDs réels)
        const vehRows = await db.execute(`SELECT id, name FROM "Vehicle"`);
        for (const vr of vehRows.rows) {
            const vId = vr.id as string;
            const vName = vr.name as string;
            const shortName = vName.split(' ')[0]; // ex: "VL186"
            await db.execute({
                sql: `INSERT OR IGNORE INTO "InvLocation" (id, type, name, vehicleId) VALUES (?, 'VEHICLE', ?, ?)`,
                args: [`loc-veh-${shortName}`, shortName, vId],
            });
        }

        // Articles catalogue
        const catalogItems = [
            { id: 'item-couverture',      name: 'Couverture de survie',         category: 'Matériel',          unit: 'unité' },
            { id: 'item-gants',           name: 'Gants nitrile',                category: 'Protection',        unit: 'boîte' },
            { id: 'item-pansements',      name: 'Pansements stériles',          category: 'Pansements',        unit: 'unité' },
            { id: 'item-masque-o2-adulte',name: 'Masque O2 adulte',             category: 'Oxygénothérapie',   unit: 'unité' },
            { id: 'item-masque-o2-ped',   name: 'Masque O2 pédiatrique',        category: 'Oxygénothérapie',   unit: 'unité' },
            { id: 'item-dsa',             name: 'Défibrillateur DSA',           category: 'Réanimation',       unit: 'unité' },
            { id: 'item-colliers',        name: 'Colliers cervicaux',           category: 'Immobilisation',    unit: 'set' },
            { id: 'item-aspirateur',      name: 'Aspirateur de mucosités',      category: 'Réanimation',       unit: 'unité' },
            { id: 'item-serum',           name: 'Sérum physiologique 500ml',    category: 'Pharmacie',         unit: 'flacon' },
            { id: 'item-compresses',      name: 'Compresses stériles 10x10',    category: 'Pansements',        unit: 'sachet' },
            { id: 'item-trousse-vl',      name: 'Trousse de secours VL',        category: 'Matériel',          unit: 'unité' },
        ];
        for (const item of catalogItems) {
            await db.execute({
                sql: `INSERT OR IGNORE INTO "InvItem" (id, name, category, ulId) VALUES (?, ?, ?, 'ul-paris-18')`,
                args: [item.id, item.name, item.category],
            });
        }

        // Sacs enfants de VPSP01
        const vpsp01LocRes = await db.execute(`SELECT id FROM "InvLocation" WHERE name = 'VPSP01' AND type = 'VEHICLE'`);
        const vpsp01LocId = vpsp01LocRes.rows.length > 0 ? vpsp01LocRes.rows[0].id as string : null;

        if (vpsp01LocId) {
            // Récupère vehicleId réel pour VPSP01
            const vpsp01VehRes = await db.execute({ sql: `SELECT vehicleId FROM "InvLocation" WHERE id = ?`, args: [vpsp01LocId] });
            const vpsp01VehId = vpsp01VehRes.rows.length > 0 ? vpsp01VehRes.rows[0].vehicleId as string : null;

            await db.execute({
                sql: `INSERT OR IGNORE INTO "InvLocation" (id, type, name, vehicleId, parentId, isSealed) VALUES ('loc-sac-pse1', 'SAC', 'Sac PSE1', ?, ?, 1)`,
                args: [vpsp01VehId, vpsp01LocId],
            });
        }

        // Sac O2 (dans Pharmacie Tampon)
        await db.execute({
            sql: `INSERT OR IGNORE INTO "InvLocation" (id, type, name, vehicleId, parentId, isSealed) VALUES ('loc-sac-o2', 'SAC', 'Sac O2', NULL, 'loc-pharma-tampon', 0)`,
            args: [],
        });

        // Stocks — Sac PSE1
        const sacPse1Stocks = [
            { item: 'item-gants',      qty: 1,  expiry: null,         threshold: null, status: 'OK' },
            { item: 'item-pansements', qty: 10, expiry: '2026-12-31', threshold: 5,    status: 'OK' },
            { item: 'item-couverture', qty: 2,  expiry: null,         threshold: 1,    status: 'OK' },
        ];
        for (const s of sacPse1Stocks) {
            await db.execute({
                sql: `INSERT OR IGNORE INTO "InvStock" (id, locationId, itemId, quantity, expiryDate, criticalThreshold, status) VALUES (?, 'loc-sac-pse1', ?, ?, ?, ?, ?)`,
                args: [crypto.randomUUID(), s.item, s.qty, s.expiry, s.threshold, s.status],
            });
        }

        // Stocks — Sac O2
        const sacO2Stocks = [
            { item: 'item-masque-o2-adulte', qty: 3, expiry: null, threshold: 2, status: 'OK' },
            { item: 'item-masque-o2-ped',    qty: 2, expiry: null, threshold: 1, status: 'OK' },
        ];
        for (const s of sacO2Stocks) {
            await db.execute({
                sql: `INSERT OR IGNORE INTO "InvStock" (id, locationId, itemId, quantity, expiryDate, criticalThreshold, status) VALUES (?, 'loc-sac-o2', ?, ?, ?, ?, ?)`,
                args: [crypto.randomUUID(), s.item, s.qty, s.expiry, s.threshold, s.status],
            });
        }

        // Stocks — Stock Central
        const centralStocks = [
            { item: 'item-dsa',       qty: 2, expiry: null, threshold: null, status: 'OK' },
            { item: 'item-colliers',  qty: 3, expiry: null, threshold: 1,    status: 'OK' },
            { item: 'item-aspirateur',qty: 1, expiry: null, threshold: 1,    status: 'OK' },
        ];
        for (const s of centralStocks) {
            await db.execute({
                sql: `INSERT OR IGNORE INTO "InvStock" (id, locationId, itemId, quantity, expiryDate, criticalThreshold, status) VALUES (?, 'loc-stock-central', ?, ?, ?, ?, ?)`,
                args: [crypto.randomUUID(), s.item, s.qty, s.expiry, s.threshold, s.status],
            });
        }

        // Stocks — Pharmacie Tampon
        const pharmaStocks = [
            { item: 'item-serum',      qty: 1, expiry: '2026-04-15', threshold: 3, status: 'MANQUANT' },
            { item: 'item-compresses', qty: 5, expiry: '2026-06-30', threshold: 3, status: 'OK' },
        ];
        for (const s of pharmaStocks) {
            await db.execute({
                sql: `INSERT OR IGNORE INTO "InvStock" (id, locationId, itemId, quantity, expiryDate, criticalThreshold, status) VALUES (?, 'loc-pharma-tampon', ?, ?, ?, ?, ?)`,
                args: [crypto.randomUUID(), s.item, s.qty, s.expiry, s.threshold, s.status],
            });
        }

        // Stock sur VL186 directement
        const vl186LocRes = await db.execute(`SELECT id FROM "InvLocation" WHERE name = 'VL186' AND type = 'VEHICLE'`);
        if (vl186LocRes.rows.length > 0) {
            const vl186LocId = vl186LocRes.rows[0].id as string;
            await db.execute({
                sql: `INSERT OR IGNORE INTO "InvStock" (id, locationId, itemId, quantity, status) VALUES (?, ?, 'item-trousse-vl', 1, 'OK')`,
                args: [crypto.randomUUID(), vl186LocId],
            });
        }

        // Groupe PSE1
        await db.execute({ sql: `INSERT OR IGNORE INTO "InvGroupe" (id, name, description) VALUES ('groupe-pse1', 'Lot PSE1', 'Matériel PSE1 complet')`, args: [] });
        await db.execute({ sql: `INSERT OR IGNORE INTO "InvGroupeMember" (groupeId, locationId) VALUES ('groupe-pse1', 'loc-sac-pse1')`, args: [] });

        // Modèles de contenu de sac réutilisables (InvBagTemplate)
        await db.execute({
            sql: `INSERT OR IGNORE INTO "InvBagTemplate" (id, name) VALUES ('tpl-pse1', 'PSE1 Standard')`,
            args: [],
        });
        const pse1Items = [
            { item: 'item-couverture', targetQty: 2 },
            { item: 'item-gants',      targetQty: 1 },
            { item: 'item-pansements', targetQty: 10 },
        ];
        for (const t of pse1Items) {
            await db.execute({
                sql: `INSERT OR IGNORE INTO "InvBagTemplateItem" (id, templateId, itemId, targetQty) VALUES (?, 'tpl-pse1', ?, ?)`,
                args: [crypto.randomUUID(), t.item, t.targetQty],
            });
        }

        await db.execute({
            sql: `INSERT OR IGNORE INTO "InvBagTemplate" (id, name) VALUES ('tpl-o2', 'Oxygénothérapie')`,
            args: [],
        });
        const o2Items = [
            { item: 'item-masque-o2-adulte', targetQty: 3 },
            { item: 'item-masque-o2-ped',    targetQty: 2 },
        ];
        for (const t of o2Items) {
            await db.execute({
                sql: `INSERT OR IGNORE INTO "InvBagTemplateItem" (id, templateId, itemId, targetQty) VALUES (?, 'tpl-o2', ?, ?)`,
                args: [crypto.randomUUID(), t.item, t.targetQty],
            });
        }

        // Attacher les modèles aux sacs
        await db.execute({
            sql: `UPDATE "InvLocation" SET templateId = 'tpl-pse1' WHERE id = 'loc-sac-pse1'`,
            args: [],
        });
        await db.execute({
            sql: `UPDATE "InvLocation" SET templateId = 'tpl-o2' WHERE id = 'loc-sac-o2'`,
            args: [],
        });

        console.log('\n📦 Inventaire de démonstration créé');
    } else {
        console.log('\n📦 Inventaire déjà présent, skip');
    // ── Comptes Rendus de Mission de démonstration ────────────────

    const missionCount = await db.execute(`SELECT COUNT(*) as n FROM "mission_reports"`);
    if ((missionCount.rows[0].n as number) === 0) {
        const adminRow = await db.execute({ sql: `SELECT id FROM "User" WHERE email = 'admin@dev.local' LIMIT 1`, args: [] });
        const chvlRow = await db.execute({ sql: `SELECT id FROM "User" WHERE email = 'chvl@dev.local' LIMIT 1`, args: [] });
        const vpspRow = await db.execute({ sql: `SELECT id FROM "Vehicle" WHERE type = 'VPSP' LIMIT 1`, args: [] });
        const vlRow = await db.execute({ sql: `SELECT id FROM "Vehicle" WHERE type = 'VL' LIMIT 1`, args: [] });

        if (adminRow.rows.length > 0 && chvlRow.rows.length > 0) {
            const adminId = adminRow.rows[0].id as string;
            const chvlId = chvlRow.rows[0].id as string;
            const vpspId = vpspRow.rows.length > 0 ? vpspRow.rows[0].id as string : null;
            const vlId = vlRow.rows.length > 0 ? vlRow.rows[0].id as string : null;

            const report1Id = crypto.randomUUID();
            await db.execute({
                sql: `INSERT INTO "mission_reports" (id, submitted_by, submitted_at, mission_type, mission_name, mission_date, location, volunteers, pegass_ok, vehicle_id, driver_id, victim_count, ul18_present, team_dynamics, all_found_place, member_difficulties, free_comment, had_acr, had_hemorrhage, had_complex_care, needs_followup, ulId)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ul-paris-18')`,
                args: [report1Id, adminId, '2026-03-10T18:30:00.000Z', 'RESEAU', 'Poste Secours Fête de Quartier', '2026-03-10', 'Salle des fêtes Paris 18', 'Marie Dupont, Jean Martin', 1, vpspId, adminId, 3, 1, 'BIEN', 1, 0, 'Bonne ambiance, équipe soudée.', 0, 0, 0, 0],
            });
            for (const [cat, item, qty] of [
                ['SAC_PRIMAIRE', "Gants d'examen (paire)", 4],
                ['SAC_PRIMAIRE', 'Compresses stériles 10x10', 6],
                ['HYGIENE', 'Masque chirurgical', 3],
            ] as Array<[string, string, number]>) {
                await db.execute({ sql: `INSERT INTO "mission_report_supplies" (id, report_id, category, item_name, quantity_used) VALUES (?, ?, ?, ?, ?)`, args: [crypto.randomUUID(), report1Id, cat, item, qty] });
            }

            const report2Id = crypto.randomUUID();
            await db.execute({
                sql: `INSERT INTO "mission_reports" (id, submitted_by, submitted_at, mission_type, mission_name, mission_date, location, volunteers, pegass_ok, vehicle_id, driver_id, victim_count, ul18_present, team_dynamics, all_found_place, member_difficulties, free_comment, had_acr, had_hemorrhage, had_complex_care, needs_followup, ulId)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ul-paris-18')`,
                args: [report2Id, chvlId, '2026-03-15T20:00:00.000Z', 'PAPS', 'PAPS Montmartre', '2026-03-15', 'Place du Tertre, Paris 18', 'Moi', 1, vlId, chvlId, 1, 0, null, null, null, null, 0, 1, 0, 1],
            });
            for (const [cat, item, qty] of [
                ['HEMORRHAGIE', 'Garrot tourniquet CAT', 1],
                ['SAC_PRIMAIRE', "Gants d'examen (paire)", 2],
                ['OXYGENE', 'Masque haute concentration adulte', 1],
            ] as Array<[string, string, number]>) {
                await db.execute({ sql: `INSERT INTO "mission_report_supplies" (id, report_id, category, item_name, quantity_used) VALUES (?, ?, ?, ?, ?)`, args: [crypto.randomUUID(), report2Id, cat, item, qty] });
            }

            const report3Id = crypto.randomUUID();
            await db.execute({
                sql: `INSERT INTO "mission_reports" (id, submitted_by, submitted_at, mission_type, mission_name, mission_date, location, volunteers, pegass_ok, vehicle_id, driver_id, victim_count, ul18_present, team_dynamics, all_found_place, member_difficulties, free_comment, had_acr, had_hemorrhage, had_complex_care, needs_followup, ulId)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ul-paris-18')`,
                args: [report3Id, adminId, '2026-03-18T14:00:00.000Z', 'AUTRE', 'Formation premiers secours lycée', '2026-03-18', 'Lycée Jacques Decour, Paris 9', 'Sophie Leroy, Paul Remy, Anne Dumont', 1, null, adminId, 0, 1, 'PLUTOT_BIEN', 1, 1, 'Un bénévole en difficultée sur les gestes techniques, accompagnement prévu.', 0, 0, 0, 0],
            });
            await db.execute({ sql: `INSERT INTO "mission_report_supplies" (id, report_id, category, item_name, quantity_used) VALUES (?, ?, ?, ?, ?)`, args: [crypto.randomUUID(), report3Id, 'SAC_PRIMAIRE', 'Masque de bouche-à-bouche', 5] });

            console.log('\n📋 3 comptes rendus de mission de démo créés');
        }
    } else {
        console.log('\n📋 Comptes rendus de mission déjà présents, skip');
    }

    console.log('\n✅ Setup terminé ! Lance maintenant : npm run dev');
    console.log('\nComptes disponibles sur http://localhost:3000/login :');
    console.log('  Admin    → admin@dev.local');
    console.log('  Respo    → respo@dev.local');
    console.log('  Chauffeur→ chvl@dev.local');
    console.log('  Invité   → guest@dev.local');
    }
}

main().catch(e => { console.error(e); process.exit(1); });
