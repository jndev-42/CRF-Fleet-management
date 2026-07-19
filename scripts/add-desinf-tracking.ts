/**
 * Migration : ajout des colonnes de suivi de désinfection pour véhicules non-VPSP.
 *
 * Ajoute 2 nouvelles colonnes :
 *   - Vehicle.desinfTracking (INTEGER DEFAULT 0) — suivi désinfection activé pour non-VPSP
 *   - Trip.desinfType (TEXT) — type de désinfection ('simple' | 'complète')
 *
 * Idempotent — peut être relancé sans risque.
 * Usage : npx tsx --env-file=.env scripts/add-desinf-tracking.ts
 */
import { createClient } from '@libsql/client';

const db = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
});

async function main() {
    console.log('🔧 Migration : ajout des colonnes de suivi de désinfection (prod)...\n');

    const vehicleCols = await db.execute(`PRAGMA table_info("Vehicle")`);

    if (!vehicleCols.rows.some(r => r.name === 'desinfTracking')) {
        await db.execute(`ALTER TABLE "Vehicle" ADD COLUMN "desinfTracking" INTEGER DEFAULT 0`);
        console.log('  ✅ Vehicle.desinfTracking ajoutée');
    } else {
        console.log('  ↩  Vehicle.desinfTracking déjà présente');
    }

    const tripCols = await db.execute(`PRAGMA table_info("Trip")`);

    if (!tripCols.rows.some(r => r.name === 'desinfType')) {
        await db.execute(`ALTER TABLE "Trip" ADD COLUMN "desinfType" TEXT`);
        console.log('  ✅ Trip.desinfType ajoutée');
    } else {
        console.log('  ↩  Trip.desinfType déjà présente');
    }

    console.log('\n✅ Migration prod terminée avec succès.');
}

main().catch(e => { console.error(e); process.exit(1); });
