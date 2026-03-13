/**
 * Script d'initialisation de la base de données locale pour le développement.
 * Idempotent — peut être relancé sans risque.
 *
 * Usage : npm run dev:setup
 */
import { createClient } from '@libsql/client';
import crypto from 'crypto';

const db = createClient({
    url: ('file:./dev.db').trim(),
    authToken: ('').trim(),
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
        CREATE TABLE IF NOT EXISTS "User" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "email" TEXT NOT NULL UNIQUE,
            "name" TEXT,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "UserRole" (
            "userId" TEXT NOT NULL,
            "roleId" TEXT NOT NULL,
            PRIMARY KEY ("userId", "roleId"),
            FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE,
            FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE CASCADE
        )
    `);

    // Seed des rôles
    const roles = ['ADMIN', 'RESPO', 'CHVL', 'CHVPSP', 'GUEST'];
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

    // ── Session Renault ───────────────────────────────────────────

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "RenaultSession" (
            "id"        INTEGER PRIMARY KEY DEFAULT 1,
            "idToken"   TEXT NOT NULL,
            "accountId" TEXT NOT NULL,
            "expiresAt" INTEGER NOT NULL
        )
    `);

    console.log('✅ Tables créées\n');

    // ── Utilisateurs de test ──────────────────────────────────────

    const devUsers = [
        { email: 'admin@dev.local', name: 'Admin Dev', roles: ['ADMIN', 'CHVL'] },
        { email: 'respo@dev.local', name: 'Respo Dev', roles: ['RESPO', 'CHVL'] },
        { email: 'chvl@dev.local', name: 'Chauffeur Dev', roles: ['CHVL'] },
        { email: 'guest@dev.local', name: 'Invité Dev', roles: ['GUEST'] },
    ];

    for (const devUser of devUsers) {
        let userId: string;
        const existing = await db.execute({
            sql: `SELECT id FROM "User" WHERE email = ?`,
            args: [devUser.email],
        });

        if (existing.rows.length > 0) {
            userId = existing.rows[0].id as string;
            console.log(`↩  ${devUser.email} déjà existant`);
        } else {
            userId = crypto.randomUUID();
            await db.execute({
                sql: `INSERT INTO "User" (id, email, name) VALUES (?, ?, ?)`,
                args: [userId, devUser.email, devUser.name],
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
        console.log(`👤 ${devUser.email.padEnd(24)} roles: ${devUser.roles.join(', ')}`);
    }

    // ── Véhicules de démonstration ────────────────────────────────

    const count = await db.execute(`SELECT COUNT(*) as n FROM "Vehicle"`);
    if ((count.rows[0].n as number) === 0) {
        const vehicles = [
            { name: 'VL186 — Renault Zoé', type: 'VL', plate: 'EZ-123-RF', fuelType: 'Électrique', fuelLevel: 80, mileage: 12450, parkingSpot: 'Baigneur', maxFuelCapacity: null, maxBatteryCapacityKwh: 52 },
            { name: 'VL188 — Renault Kangoo', type: 'VL', plate: 'FZ-456-RF', fuelType: 'Diesel', fuelLevel: 60, mileage: 34200, parkingSpot: 'Baigneur', maxFuelCapacity: 60, maxBatteryCapacityKwh: null },
            { name: 'VL182 — Peugeot 208', type: 'VL', plate: 'GZ-789-RF', fuelType: 'Essence', fuelLevel: 45, mileage: 8900, parkingSpot: 'Baigneur', maxFuelCapacity: 50, maxBatteryCapacityKwh: null },
            { name: 'VPSP01 — Peugeot Boxer', type: 'VPSP', plate: 'HZ-001-RF', fuelType: 'Diesel', fuelLevel: 70, mileage: 52100, parkingSpot: 'Baigneur', maxFuelCapacity: 80, maxBatteryCapacityKwh: null },
        ];
        for (const v of vehicles) {
            await db.execute({
                sql: `INSERT INTO "Vehicle" (id, name, type, plate, fuelType, fuelLevel, mileage, parkingSpot, maxFuelCapacity, maxBatteryCapacityKwh, status, createdAt, updatedAt)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'AVAILABLE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                args: [crypto.randomUUID(), v.name, v.type, v.plate, v.fuelType, v.fuelLevel, v.mileage, v.parkingSpot, v.maxFuelCapacity, v.maxBatteryCapacityKwh],
            });
        }
        console.log('\n🚗 4 véhicules de démo créés');
    } else {
        console.log('\n🚗 Véhicules déjà présents, skip');
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

    console.log('\n✅ Setup terminé ! Lance maintenant : npm run dev');
    console.log('\nComptes disponibles sur http://localhost:3000/login :');
    console.log('  Admin    → admin@dev.local');
    console.log('  Respo    → respo@dev.local');
    console.log('  Chauffeur→ chvl@dev.local');
    console.log('  Invité   → guest@dev.local');
}

main().catch(e => { console.error(e); process.exit(1); });
