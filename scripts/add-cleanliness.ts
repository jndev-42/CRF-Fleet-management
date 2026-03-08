/**
 * Migration : ajout des colonnes cleanlinessOut et cleanlinessIn sur la table Trip.
 * Idempotent — peut être relancé sans risque.
 *
 * Usage : npx tsx scripts/add-cleanliness.ts
 */
import { createClient } from '@libsql/client';
import 'dotenv/config';

const db = createClient({
    url: (process.env.TURSO_DATABASE_URL || 'file:./dev.db').trim(),
    authToken: (process.env.TURSO_AUTH_TOKEN || '').trim(),
});

async function main() {
    const cols = await db.execute(`PRAGMA table_info("Trip")`);
    const names = cols.rows.map(r => r.name as string);

    if (!names.includes('cleanlinessOut')) {
        await db.execute(`ALTER TABLE "Trip" ADD COLUMN "cleanlinessOut" TEXT`);
        console.log('✅ Colonne cleanlinessOut ajoutée');
    } else {
        console.log('↩  cleanlinessOut déjà présente');
    }

    if (!names.includes('cleanlinessIn')) {
        await db.execute(`ALTER TABLE "Trip" ADD COLUMN "cleanlinessIn" TEXT`);
        console.log('✅ Colonne cleanlinessIn ajoutée');
    } else {
        console.log('↩  cleanlinessIn déjà présente');
    }

    console.log('\n✅ Migration terminée');
}

main().catch(e => { console.error(e); process.exit(1); });
