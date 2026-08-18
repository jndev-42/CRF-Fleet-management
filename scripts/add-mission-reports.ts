/**
 * Migration : Création des tables pour les Comptes Rendus de Mission.
 * Idempotent — peut être relancé sans risque.
 *
 * Usage : npx tsx scripts/add-mission-reports.ts
 */
import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || url.startsWith('file:')) {
    console.error('❌ TURSO_DATABASE_URL must be set to a remote libsql:// URL');
    process.exit(1);
}

const db = createClient({ url, authToken });

async function main() {
    console.log('🔧 Migration : Comptes Rendus de Mission...\n');

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
            "presence_ul"           INTEGER,
            "team_dynamics"         TEXT,
            "all_found_place"       INTEGER,
            "member_difficulties"   INTEGER,
            "free_comment"          TEXT,
            "had_acr"               INTEGER NOT NULL DEFAULT 0,
            "had_hemorrhage"        INTEGER NOT NULL DEFAULT 0,
            "had_complex_care"      INTEGER NOT NULL DEFAULT 0,
            "needs_followup"        INTEGER NOT NULL DEFAULT 0
        )
    `);
    console.log('  ✅ Table mission_reports créée (ou déjà existante)');

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "mission_report_supplies" (
            "id"            TEXT PRIMARY KEY,
            "report_id"     TEXT NOT NULL REFERENCES "mission_reports"(id) ON DELETE CASCADE,
            "category"      TEXT NOT NULL,
            "item_name"     TEXT NOT NULL,
            "quantity_used" INTEGER NOT NULL DEFAULT 0
        )
    `);
    console.log('  ✅ Table mission_report_supplies créée (ou déjà existante)');

    await db.execute(`
        CREATE INDEX IF NOT EXISTS "mission_reports_submitted_by_idx"
        ON "mission_reports"("submitted_by")
    `);
    await db.execute(`
        CREATE INDEX IF NOT EXISTS "mission_reports_mission_date_idx"
        ON "mission_reports"("mission_date")
    `);
    await db.execute(`
        CREATE INDEX IF NOT EXISTS "mission_report_supplies_report_id_idx"
        ON "mission_report_supplies"("report_id")
    `);

    console.log('\n✅ Migration terminée');
    db.close();
}

main().catch(e => {
    console.error('Erreur migration:', e);
    process.exit(1);
});
