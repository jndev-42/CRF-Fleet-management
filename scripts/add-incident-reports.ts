/**
 * Migration de production — Création de la table IncidentReport.
 *
 * Ce script crée la table IncidentReport et ses index (idempotent).
 * Conçue pour accueillir les phases 2/3 sans migration future.
 *
 * Usage :
 *   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npx tsx scripts/add-incident-reports.ts
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
    console.log('\n▶ Création de la table IncidentReport...');

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "IncidentReport" (
            "id"             TEXT NOT NULL PRIMARY KEY,
            "vehicleId"      TEXT NOT NULL REFERENCES "Vehicle"(id) ON DELETE CASCADE,
            "userId"         TEXT NOT NULL REFERENCES "User"(id),
            "tripId"         TEXT REFERENCES "Trip"(id) ON DELETE SET NULL,
            "reservationId"  TEXT REFERENCES "Reservation"(id) ON DELETE SET NULL,

            "type"           TEXT,
            "status"         TEXT NOT NULL DEFAULT 'DRAFT',

            "occurredAt"     DATETIME,
            "location"       TEXT,
            "latitude"       REAL,
            "longitude"      REAL,

            "radarData"      TEXT,
            "damages"        TEXT,
            "victims"        TEXT,
            "actions"        TEXT,

            "driveFolderId"  TEXT,
            "freeComment"    TEXT,

            "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "submittedAt"    DATETIME
        )
    `);
    console.log('  ✓ Table IncidentReport créée (ou déjà existante)');

    await db.execute(`
        CREATE INDEX IF NOT EXISTS "IncidentReport_vehicleId_idx"
        ON "IncidentReport"("vehicleId")
    `);
    await db.execute(`
        CREATE INDEX IF NOT EXISTS "IncidentReport_userId_idx"
        ON "IncidentReport"("userId")
    `);
    await db.execute(`
        CREATE INDEX IF NOT EXISTS "IncidentReport_tripId_idx"
        ON "IncidentReport"("tripId")
    `);
    await db.execute(`
        CREATE INDEX IF NOT EXISTS "IncidentReport_status_idx"
        ON "IncidentReport"("status")
    `);
    console.log('  ✓ Index créés');

    console.log('\n✅ Migration terminée.\n');
}

run().catch(e => {
    console.error('Erreur fatale :', e);
    process.exit(1);
});