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
            "vin"         TEXT,
            "fuelType"    TEXT DEFAULT 'Essence',
            "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // ── Sorties (Trip) ────────────────────────────────────────────

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "Trip" (
            "id"                TEXT NOT NULL PRIMARY KEY,
            "vehicleId"         TEXT NOT NULL,
            "driverName"        TEXT NOT NULL,
            "driverEmail"       TEXT NOT NULL,
            "missionType"       TEXT,
            "missionName"       TEXT,
            "checkOutAt"        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "checkInAt"         DATETIME,
            "mileageOut"        INTEGER,
            "mileageIn"         INTEGER,
            "fuelOut"           INTEGER,
            "fuelIn"            INTEGER,
            "conditionOut"      TEXT,
            "conditionIn"       TEXT,
            "cleanlinessOut"    TEXT,
            "cleanlinessIn"     TEXT,
            "parkingOut"        TEXT,
            "parkingIn"         TEXT,
            "dsaChecked"        INTEGER DEFAULT 0,
            "dsaUsed"           INTEGER DEFAULT 0,
            "windowsClosed"     INTEGER DEFAULT 0,
            "vehicleInspected"  INTEGER DEFAULT 0,
            "incident"          TEXT,
            "commentsOut"       TEXT,
            "commentsIn"        TEXT,
            "secondDriverName"  TEXT,
            "secondDriverEmail" TEXT,
            "checklistOut"      TEXT,
            "checklistIn"       TEXT,
            "driveFolderId"     TEXT,
            "parkingPhoto"      TEXT,
            "createdAt"         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE CASCADE
        )
    `);

    // Migrations idempotentes pour DBs existantes
    const tripCols = await db.execute(`PRAGMA table_info("Trip")`);
    const existingCols = new Set(tripCols.rows.map(r => r.name as string));
    const migrations: Array<[string, string]> = [
        ['cleanlinessOut',   'TEXT'],
        ['cleanlinessIn',    'TEXT'],
        ['dsaUsed',          'INTEGER DEFAULT 0'],
        ['windowsClosed',    'INTEGER DEFAULT 0'],
        ['vehicleInspected', 'INTEGER DEFAULT 0'],
        ['incident',         'TEXT'],
        ['parkingPhoto',     'TEXT'],
    ];
    for (const [col, def] of migrations) {
        if (!existingCols.has(col)) {
            await db.execute(`ALTER TABLE "Trip" ADD COLUMN "${col}" ${def}`);
            console.log(`  ↳ Migration : colonne Trip.${col} ajoutée`);
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
            { name: 'VL186 — Renault Zoé', type: 'VL', plate: 'EZ-123-RF', fuelType: 'Électrique', fuelLevel: 80, mileage: 12450, parkingSpot: 'Baigneur' },
            { name: 'VL188 — Renault Kangoo', type: 'VL', plate: 'FZ-456-RF', fuelType: 'Diesel', fuelLevel: 60, mileage: 34200, parkingSpot: 'Baigneur' },
            { name: 'VL182 — Peugeot 208', type: 'VL', plate: 'GZ-789-RF', fuelType: 'Essence', fuelLevel: 45, mileage: 8900, parkingSpot: 'Baigneur' },
            { name: 'VPSP01 — Peugeot Boxer', type: 'VPSP', plate: 'HZ-001-RF', fuelType: 'Diesel', fuelLevel: 70, mileage: 52100, parkingSpot: 'Baigneur' },
        ];
        for (const v of vehicles) {
            await db.execute({
                sql: `INSERT INTO "Vehicle" (id, name, type, plate, fuelType, fuelLevel, mileage, parkingSpot, status, createdAt, updatedAt)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'AVAILABLE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                args: [crypto.randomUUID(), v.name, v.type, v.plate, v.fuelType, v.fuelLevel, v.mileage, v.parkingSpot],
            });
        }
        console.log('\n🚗 4 véhicules de démo créés');
    } else {
        console.log('\n🚗 Véhicules déjà présents, skip');
    }

    console.log('\n✅ Setup terminé ! Lance maintenant : npm run dev');
    console.log('\nComptes disponibles sur http://localhost:3000/login :');
    console.log('  Admin    → admin@dev.local');
    console.log('  Respo    → respo@dev.local');
    console.log('  Chauffeur→ chvl@dev.local');
    console.log('  Invité   → guest@dev.local');
}

main().catch(e => { console.error(e); process.exit(1); });
