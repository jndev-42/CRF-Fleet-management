/**
 * Migration : nettoyage DSA et colonnes inutilisées.
 * Idempotent — peut être relancé sans risque.
 *
 * Changements :
 *  - Supprime les colonnes Trip : windowsClosed, vehicleInspected, dsaUsed
 *  - Supprime les items de checklist DSA au check-in (dsa-checkin-*)
 *  - Passe les items DSA au check-out en optionnel (required = 0)
 *
 * Usage : npx tsx scripts/migrate-dsa-cleanup.ts
 */
import { createClient } from '@libsql/client';
import 'dotenv/config';

const db = createClient({
    url: (process.env.TURSO_DATABASE_URL || 'file:./dev.db').trim(),
    authToken: (process.env.TURSO_AUTH_TOKEN || '').trim(),
});

async function main() {
    console.log('🔧 Migration DSA cleanup...\n');

    // ── 1. Suppression des colonnes inutilisées sur Trip ──────────────────

    const tripCols = await db.execute(`PRAGMA table_info("Trip")`);
    const colNames = tripCols.rows.map(r => r.name as string);

    for (const col of ['windowsClosed', 'vehicleInspected', 'dsaUsed']) {
        if (colNames.includes(col)) {
            await db.execute(`ALTER TABLE "Trip" DROP COLUMN "${col}"`);
            console.log(`✅ Colonne Trip.${col} supprimée`);
        } else {
            console.log(`↩  Trip.${col} déjà absente`);
        }
    }

    // ── 2. Suppression des items de checklist DSA au check-in ─────────────

    const deleted = await db.execute({
        sql: `DELETE FROM "VehicleChecklistItem" WHERE id LIKE 'dsa-checkin-%'`,
        args: [],
    });
    console.log(`\n✅ Items DSA check-in supprimés (${deleted.rowsAffected} ligne(s))`);

    // ── 3. DSA check-out → optionnel (required = 0) ───────────────────────

    const updated = await db.execute({
        sql: `UPDATE "VehicleChecklistItem" SET required = 0 WHERE id LIKE 'dsa-checkout-%'`,
        args: [],
    });
    console.log(`✅ Items DSA check-out passés en optionnel (${updated.rowsAffected} ligne(s))`);

    console.log('\n✅ Migration terminée');
}

main().catch(e => { console.error(e); process.exit(1); });
