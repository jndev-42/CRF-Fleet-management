/**
 * Migration de production — Contrôles techniques & révisions.
 *
 * Ce script :
 *   1. Ajoute les colonnes Vehicle.firstRegistrationDate / revisionKmInterval / revisionYearInterval (idempotent)
 *   2. Crée la table VehicleMaintenanceRecord (idempotent)
 *   3. Met à jour les dates de 1ère immatriculation des véhicules réels
 *   4. Insère les enregistrements CT/révision historiques (idempotent)
 *
 * Usage :
 *   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npx tsx scripts/add-maintenance-prod.ts
 */
import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || url.startsWith('file:')) {
    console.error('❌ TURSO_DATABASE_URL must be set to a remote libsql:// URL');
    process.exit(1);
}

const db = createClient({ url, authToken });

async function run() {
    // ── 1. Migrations de colonnes (idempotentes) ──────────────────────────────
    console.log('\n▶ Migrations de schéma...');
    const schemaMigrations = [
        { name: 'Vehicle.firstRegistrationDate', sql: `ALTER TABLE "Vehicle" ADD COLUMN "firstRegistrationDate" TEXT` },
        { name: 'Vehicle.revisionKmInterval',    sql: `ALTER TABLE "Vehicle" ADD COLUMN "revisionKmInterval" INTEGER` },
        { name: 'Vehicle.revisionYearInterval',  sql: `ALTER TABLE "Vehicle" ADD COLUMN "revisionYearInterval" INTEGER` },
    ];

    for (const m of schemaMigrations) {
        try {
            await db.execute(m.sql);
            console.log('  ✓', m.name, 'ajoutée');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- libSQL error shape
        } catch (e: any) {
            if (e?.message?.includes('duplicate column') || e?.message?.includes('already exists')) {
                console.log('  ~', m.name, '(déjà présente)');
            } else {
                console.error('  ✗', m.name, e?.message);
                process.exit(1);
            }
        }
    }

    // ── 2. Table VehicleMaintenanceRecord ─────────────────────────────────────
    console.log('\n▶ Table VehicleMaintenanceRecord...');
    await db.execute(`
        CREATE TABLE IF NOT EXISTS "VehicleMaintenanceRecord" (
            "id"        TEXT    NOT NULL PRIMARY KEY,
            "vehicleId" TEXT    NOT NULL REFERENCES "Vehicle"(id),
            "date"      TEXT    NOT NULL,
            "type"      TEXT    NOT NULL,
            "mileage"   INTEGER,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('  ✓ Table prête');

    // ── 3. Données des véhicules (immatriculation + intervalles révision) ───────
    console.log('\n▶ Mise à jour des véhicules...');
    const vehicleData: Array<{ pattern: string; firstRegistrationDate: string; revisionKmInterval: number | null; revisionYearInterval: number | null }> = [
        { pattern: 'VL 486', firstRegistrationDate: '2017-12-06', revisionKmInterval: 20000, revisionYearInterval: 2 },
        { pattern: 'VPSP 182', firstRegistrationDate: '2016-09-05', revisionKmInterval: 40000, revisionYearInterval: 2 },
        { pattern: 'VL 186', firstRegistrationDate: '2026-02-18', revisionKmInterval: 40000, revisionYearInterval: 2 },
        { pattern: 'VL 188', firstRegistrationDate: '2024-03-11', revisionKmInterval: 15000, revisionYearInterval: 1 },
    ];

    for (const { pattern, firstRegistrationDate, revisionKmInterval, revisionYearInterval } of vehicleData) {
        const res = await db.execute({
            sql: `UPDATE "Vehicle"
                  SET firstRegistrationDate = ?,
                      revisionKmInterval    = ?,
                      revisionYearInterval  = ?
                  WHERE name LIKE ?`,
            args: [firstRegistrationDate, revisionKmInterval, revisionYearInterval, pattern],
        });
        const label = pattern.replace('%', '');
        if ((res.rowsAffected ?? 0) > 0) {
            console.log(`  ✓ ${label} → immat ${firstRegistrationDate}, révision ${revisionKmInterval} km / ${revisionYearInterval} an(s)`);
        } else {
            console.log(`  ⚠ ${label} introuvable`);
        }
    }

    // ── 4. Enregistrements CT / révision ─────────────────────────────────────
    console.log('\n▶ Insertion des enregistrements de maintenance...');

    const records: Array<{ pattern: string; date: string; type: 'CT' | 'REVISION' | 'CT_REVISION'; mileage: number | null }> = [
        { pattern: 'VL 188', date: '2026-03-06', type: 'REVISION',    mileage: null },
        { pattern: 'VPSP 182', date: '2025-04-29', type: 'CT_REVISION', mileage: null },
        { pattern: 'VL 486', date: '2025-05-02', type: 'CT',          mileage: null },
        { pattern: 'VL 486', date: '2025-05-02', type: 'REVISION',    mileage: null },
    ];

    for (const rec of records) {
        const vehicleRes = await db.execute({
            sql: `SELECT id FROM "Vehicle" WHERE name LIKE ? LIMIT 1`,
            args: [rec.pattern],
        });

        const label = `${rec.pattern.replace('%', '')} ${rec.date} ${rec.type}`;

        if (vehicleRes.rows.length === 0) {
            console.log(`  ⚠ Véhicule introuvable pour ${label}`);
            continue;
        }

        const vehicleId = vehicleRes.rows[0].id as string;

        // Idempotent : skip si un enregistrement identique (même vehicleId + date + type) existe déjà
        const existing = await db.execute({
            sql: `SELECT id FROM "VehicleMaintenanceRecord" WHERE vehicleId = ? AND date = ? AND type = ?`,
            args: [vehicleId, rec.date, rec.type],
        });

        if (existing.rows.length > 0) {
            console.log(`  ~ ${label} (déjà présent)`);
            continue;
        }

        await db.execute({
            sql: `INSERT INTO "VehicleMaintenanceRecord" (id, vehicleId, date, type, mileage) VALUES (?, ?, ?, ?, ?)`,
            args: [crypto.randomUUID(), vehicleId, rec.date, rec.type, rec.mileage],
        });
        console.log(`  ✓ ${label}`);
    }

    console.log('\n✅ Migration terminée.\n');
}

run().catch(e => {
    console.error('Erreur fatale :', e);
    process.exit(1);
});
