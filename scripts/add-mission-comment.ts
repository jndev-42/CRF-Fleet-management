/**
 * Migration : ajoute la colonne `mission_comment` à la table `mission_reports`.
 *
 * Quand exécuter : une seule fois en production après déploiement de la version
 * introduisant l'étape "Commentaire" du compte rendu de mission.
 * Usage : npx tsx scripts/add-mission-comment.ts
 *
 * Idempotent — la migration est ignorée si la colonne existe déjà.
 */
import { createClient } from '@libsql/client';

const db = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
});

async function main() {
    console.log('🔧 Migration : ajout de mission_comment à mission_reports...\n');

    const cols = await db.execute('PRAGMA table_info("mission_reports")');
    const colNames = cols.rows.map(r => r.name as string);

    if (!colNames.includes('mission_comment')) {
        await db.execute(`ALTER TABLE "mission_reports" ADD COLUMN "mission_comment" TEXT`);
        console.log('  ↳ Colonne mission_comment ajoutée avec succès.');
    } else {
        console.log('  ↳ Colonne mission_comment déjà présente, migration ignorée.');
    }

    console.log('\n✅ Migration terminée.');
}

main().catch(e => { console.error(e); process.exit(1); });
