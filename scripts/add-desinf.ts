/**
 * Migration : ajout des colonnes de désinfection.
 *
 * Ajoute 4 nouvelles colonnes :
 *   - Vehicle.lastDesinfDate      (TEXT, NULL) — date de la dernière désinf. YYYY-MM-DD
 *   - Vehicle.nextDesinfMaxDate   (TEXT, NULL) — lastDesinfDate + 42 jours
 *   - Trip.desinfResponsable      (TEXT, NULL) — nom du responsable de la désinf.
 *   - Trip.desinfLotNumber        (TEXT, NULL) — numéro de lot du produit désinfectant
 *
 * Idempotent — peut être relancé sans risque.
 * Usage : npx tsx scripts/add-desinf.ts
 */
import { createClient } from '@libsql/client';

const db = createClient({
    url: ('file:./dev.db').trim(),
    authToken: ('').trim(),
});

async function main() {
    console.log('🔧 Migration : ajout des colonnes de désinfection...\n');

    const vehicleCols = await db.execute(`PRAGMA table_info("Vehicle")`);

    if (!vehicleCols.rows.some(r => r.name === 'lastDesinfDate')) {
        await db.execute(`ALTER TABLE "Vehicle" ADD COLUMN "lastDesinfDate" TEXT`);
        console.log('  ✅ Vehicle.lastDesinfDate ajoutée');
    } else {
        console.log('  ↩  Vehicle.lastDesinfDate déjà présente');
    }

    if (!vehicleCols.rows.some(r => r.name === 'nextDesinfMaxDate')) {
        await db.execute(`ALTER TABLE "Vehicle" ADD COLUMN "nextDesinfMaxDate" TEXT`);
        console.log('  ✅ Vehicle.nextDesinfMaxDate ajoutée');
    } else {
        console.log('  ↩  Vehicle.nextDesinfMaxDate déjà présente');
    }

    const tripCols = await db.execute(`PRAGMA table_info("Trip")`);

    if (!tripCols.rows.some(r => r.name === 'desinfResponsable')) {
        await db.execute(`ALTER TABLE "Trip" ADD COLUMN "desinfResponsable" TEXT`);
        console.log('  ✅ Trip.desinfResponsable ajoutée');
    } else {
        console.log('  ↩  Trip.desinfResponsable déjà présente');
    }

    if (!tripCols.rows.some(r => r.name === 'desinfLotNumber')) {
        await db.execute(`ALTER TABLE "Trip" ADD COLUMN "desinfLotNumber" TEXT`);
        console.log('  ✅ Trip.desinfLotNumber ajoutée');
    } else {
        console.log('  ↩  Trip.desinfLotNumber déjà présente');
    }

    console.log('\n✅ Migration terminée.');
}

main().catch(e => { console.error(e); process.exit(1); });
