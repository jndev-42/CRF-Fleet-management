/**
 * Migration : ajoute la colonne `drive_folder_id` à la table `mission_reports`.
 *
 * Quand exécuter : une seule fois en production après déploiement de la v2.1.0.
 * Usage : npx tsx scripts/add-mission-drive-folder.ts
 *
 * Idempotent — la migration est ignorée si la colonne existe déjà.
 */
import { createClient } from '@libsql/client';

const db = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
});

async function main() {
    console.log('🔧 Migration : ajout de drive_folder_id à mission_reports...\n');

    const cols = await db.execute('PRAGMA table_info("mission_reports")');
    const colNames = cols.rows.map(r => r.name as string);

    if (!colNames.includes('drive_folder_id')) {
        await db.execute(`ALTER TABLE "mission_reports" ADD COLUMN "drive_folder_id" TEXT`);
        console.log('  ↳ Colonne drive_folder_id ajoutée avec succès.');
    } else {
        console.log('  ↳ Colonne drive_folder_id déjà présente, migration ignorée.');
    }

    console.log('\n✅ Migration terminée.');
}

main().catch(e => { console.error(e); process.exit(1); });
