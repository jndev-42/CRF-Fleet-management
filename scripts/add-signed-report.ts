/**
 * Migration : ajoute la colonne `signed_report_drive_id` à la table `mission_reports`.
 *
 * Quand exécuter : une seule fois en production après déploiement de la fonctionnalité
 * d'upload du rapport papier signé par l'organisateur.
 * Usage : npx tsx scripts/add-signed-report.ts
 *
 * Idempotent — la migration est ignorée si la colonne existe déjà.
 */
import { createClient } from '@libsql/client';

const db = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
});

async function main() {
    console.log('🔧 Migration : ajout de signed_report_drive_id à mission_reports...\n');

    const cols = await db.execute('PRAGMA table_info("mission_reports")');
    const colNames = cols.rows.map(r => r.name as string);

    if (!colNames.includes('signed_report_drive_id')) {
        await db.execute(`ALTER TABLE "mission_reports" ADD COLUMN "signed_report_drive_id" TEXT`);
        console.log('  ↳ Colonne signed_report_drive_id ajoutée avec succès.');
    } else {
        console.log('  ↳ Colonne signed_report_drive_id déjà présente, migration ignorée.');
    }

    console.log('\n✅ Migration terminée.');
}

main().catch(e => { console.error(e); process.exit(1); });
