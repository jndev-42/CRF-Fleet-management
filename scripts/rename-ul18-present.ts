/**
 * Migration : renomme la colonne `ul18_present` en `presence_ul` sur la table
 * `mission_reports`.
 *
 * Contexte : le champ représentait en réalité la présence de l'UL du
 * soumetteur (pas spécifiquement "UL 18") — le nom de colonne est corrigé
 * pour ne plus hardcoder une UL en particulier. Le libellé affiché reste
 * dynamique côté application (nom de l'UL réelle).
 *
 * Quand exécuter : une seule fois en production après déploiement de la
 * version introduisant le renommage.
 * Usage : npx tsx scripts/rename-ul18-present.ts
 *
 * Idempotent — sans effet si `presence_ul` existe déjà ou si la table est
 * fraîchement créée (sans `ul18_present`).
 */
import { createClient } from '@libsql/client';

const db = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
});

async function main() {
    console.log('🔧 Migration : renommage de ul18_present en presence_ul sur mission_reports...\n');

    const cols = await db.execute('PRAGMA table_info("mission_reports")');
    const colNames = cols.rows.map(r => r.name as string);

    if (colNames.includes('presence_ul')) {
        console.log('  ↳ Colonne presence_ul déjà présente, migration ignorée.');
    } else if (colNames.includes('ul18_present')) {
        await db.execute(`ALTER TABLE "mission_reports" RENAME COLUMN "ul18_present" TO "presence_ul"`);
        console.log('  ↳ Colonne ul18_present renommée en presence_ul avec succès.');
    } else {
        console.log('  ↳ Colonne ul18_present absente (installation fraîche), migration ignorée.');
    }

    console.log('\n✅ Migration terminée.');
}

main().catch(e => { console.error(e); process.exit(1); });
