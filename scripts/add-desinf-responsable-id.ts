/**
 * Migration : ajout de la colonne desinfResponsableId sur Trip.
 *
 * Ajoute 1 nouvelle colonne :
 *   - Trip.desinfResponsableId (TEXT, NULL) — ID de l'utilisateur pré-renseigné comme responsable désinf.
 *
 * Idempotent — peut être relancé sans risque.
 * Usage : npx tsx scripts/add-desinf-responsable-id.ts
 */
import { createClient } from '@libsql/client';

const db = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
});

async function main() {
    console.log('🔧 Migration : ajout de la colonne desinfResponsableId sur Trip...\n');

    const tripCols = await db.execute(`PRAGMA table_info("Trip")`);

    if (!tripCols.rows.some(r => r.name === 'desinfResponsableId')) {
        await db.execute(`ALTER TABLE "Trip" ADD COLUMN "desinfResponsableId" TEXT`);
        console.log('  ✅ Trip.desinfResponsableId ajoutée');
    } else {
        console.log('  ↩  Trip.desinfResponsableId déjà présente');
    }

    console.log('\n✅ Migration terminée.');
}

main().catch(e => { console.error(e); process.exit(1); });
