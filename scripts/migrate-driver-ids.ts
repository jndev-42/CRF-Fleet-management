/**
 * Migration one-shot : remplace les colonnes dénormalisées driverName/driverEmail/
 * secondDriverName/secondDriverEmail de la table Trip par des FK driverId/secondDriverId.
 *
 * Quand l'exécuter :
 *   - Sur la DB de production (Turso) AVANT de déployer le code qui utilise driverId.
 *   - Sur la DB locale après avoir mis à jour setup-dev.ts (déjà idempotent via setup-dev).
 *
 * Usage : npx tsx scripts/migrate-driver-ids.ts
 *
 * Idempotent — peut être relancé sans risque.
 */
import { createClient } from '@libsql/client';

const db = createClient({
    url: (process.env.TURSO_DATABASE_URL || 'file:./dev.db').trim(),
    authToken: (process.env.TURSO_AUTH_TOKEN || '').trim(),
});

async function main() {
    console.log('🔧 Migration : driverName/driverEmail → driverId FK\n');

    // ── Étape 1 : Ajouter les nouvelles colonnes si elles n'existent pas ──────
    const cols = await db.execute(`PRAGMA table_info("Trip")`);
    const existing = new Set(cols.rows.map(r => r.name as string));

    if (!existing.has('driverId')) {
        await db.execute(`ALTER TABLE "Trip" ADD COLUMN "driverId" TEXT REFERENCES "User" ("id")`);
        console.log('  ✅ Colonne Trip.driverId ajoutée');
    } else {
        console.log('  ↩  Trip.driverId déjà présente');
    }

    if (!existing.has('secondDriverId')) {
        await db.execute(`ALTER TABLE "Trip" ADD COLUMN "secondDriverId" TEXT REFERENCES "User" ("id")`);
        console.log('  ✅ Colonne Trip.secondDriverId ajoutée');
    } else {
        console.log('  ↩  Trip.secondDriverId déjà présente');
    }

    // ── Étape 2 : Backfill driverId depuis driverEmail ────────────────────────
    if (existing.has('driverEmail')) {
        const backfillResult = await db.execute(`
            UPDATE "Trip"
            SET driverId = (SELECT id FROM "User" WHERE email = Trip.driverEmail)
            WHERE driverId IS NULL AND driverEmail IS NOT NULL
        `);
        console.log(`\n  ✅ Backfill driverId : ${backfillResult.rowsAffected} ligne(s) mise(s) à jour`);

        // Lignes non résolues (email inconnu)
        const unmatched = await db.execute(`
            SELECT id, driverEmail FROM "Trip"
            WHERE driverId IS NULL AND driverEmail IS NOT NULL
        `);
        if (unmatched.rows.length > 0) {
            console.warn(`\n  ⚠️  ${unmatched.rows.length} trajet(s) sans correspondance User (email inconnu) :`);
            for (const row of unmatched.rows) {
                console.warn(`     - Trip ${row.id} : ${row.driverEmail}`);
            }
        } else {
            console.log('  ✅ Tous les trajets ont un driverId résolu');
        }
    } else {
        console.log('  ↩  Colonne driverEmail absente — backfill ignoré');
    }

    // ── Étape 3 : Backfill secondDriverId depuis secondDriverEmail ────────────
    if (existing.has('secondDriverEmail')) {
        const backfillResult2 = await db.execute(`
            UPDATE "Trip"
            SET secondDriverId = (SELECT id FROM "User" WHERE email = Trip.secondDriverEmail)
            WHERE secondDriverId IS NULL AND secondDriverEmail IS NOT NULL
        `);
        console.log(`  ✅ Backfill secondDriverId : ${backfillResult2.rowsAffected} ligne(s) mise(s) à jour`);
    } else {
        console.log('  ↩  Colonne secondDriverEmail absente — backfill secondDriverId ignoré');
    }

    // ── Étape 4 : Supprimer les anciennes colonnes ────────────────────────────
    const dropCols = ['driverName', 'driverEmail', 'secondDriverName', 'secondDriverEmail'];
    const freshCols = await db.execute(`PRAGMA table_info("Trip")`);
    const freshExisting = new Set(freshCols.rows.map(r => r.name as string));

    for (const col of dropCols) {
        if (freshExisting.has(col)) {
            await db.execute({ sql: `ALTER TABLE "Trip" DROP COLUMN "${col}"`, args: [] });
            console.log(`  ✅ Colonne Trip.${col} supprimée`);
        } else {
            console.log(`  ↩  Trip.${col} absente — skip`);
        }
    }

    console.log('\n✅ Migration terminée !');
}

main().catch(e => { console.error(e); process.exit(1); });
