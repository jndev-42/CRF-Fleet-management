/**
 * Migration production — table `mission_report_interventions`.
 *
 * Le compte rendu de mission ventile désormais son total « nombre d'intervention »
 * (colonne inchangée `mission_reports.victim_count`) dans deux grilles indépendantes :
 *   - `breakdown = 'MODE'`   → type de prise en charge (SOINS, DECHARGE, DAE, EVAC_CRF, EVAC_AUTRES)
 *   - `breakdown = 'NATURE'` → nature clinique (PETITS_SOINS, MALAISE, TRAUMATISME, INCONSCIENCE, ARRET_CARDIAQUE)
 *
 * À exécuter AVANT le déploiement : le POST `/api/missions` écrit cette table dès la
 * première soumission avec `victim_count >= 1`, donc tant qu'elle manque en production
 * chaque création de compte rendu détaillé répond 500.
 *
 * Les rapports existants ne sont PAS migrés : ils gardent leur `victim_count` sans aucune
 * ligne de détail, et leur fiche affiche le total seul (affichage dégradé assumé).
 *
 * Usage :
 *   npx tsx scripts/add-mission-report-interventions.ts                        # .env, dry-run
 *   npx tsx scripts/add-mission-report-interventions.ts --apply                # .env, applique
 *   npx tsx scripts/add-mission-report-interventions.ts --env .env.preview --apply
 */
import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

// Cible l'environnement passé en `--env` (défaut : .env).
const envFile = (() => {
    const i = process.argv.indexOf('--env');
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : '.env';
})();
dotenv.config({ path: envFile });

const TABLE = 'mission_report_interventions';
const INDEX = 'mission_report_interventions_report_id_idx';

const CREATE_TABLE_SQL = `
    CREATE TABLE IF NOT EXISTS "${TABLE}" (
        "id"        TEXT PRIMARY KEY,
        "report_id" TEXT NOT NULL REFERENCES "mission_reports"(id) ON DELETE CASCADE,
        "breakdown" TEXT NOT NULL CHECK ("breakdown" IN ('MODE', 'NATURE')),
        "category"  TEXT NOT NULL,
        "quantity"  INTEGER NOT NULL DEFAULT 0
    )
`;

const CREATE_INDEX_SQL = `CREATE INDEX IF NOT EXISTS "${INDEX}" ON "${TABLE}"("report_id")`;

async function main() {
    const apply = process.argv.includes('--apply');
    console.log(`Migration (${envFile}) : table ${TABLE} ${apply ? '(--apply)' : '(dry-run)'}`);

    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN
    });

    // La table enfant référence `mission_reports` : sans le parent, la FK serait
    // orpheline et chaque INSERT échouerait après déploiement.
    const parent = await db.execute(`PRAGMA table_info("mission_reports")`);
    if (parent.rows.length === 0) {
        console.error('❌ Table "mission_reports" introuvable — migration impossible');
        process.exit(1);
    }

    const existing = await db.execute(`PRAGMA table_info("${TABLE}")`);
    const hasTable = existing.rows.length > 0;
    console.log(`  table ${TABLE} : ${hasTable ? 'présente' : 'ABSENTE'}`);

    if (!apply) {
        console.log("\nPlan (aucune écriture) :");
        if (!hasTable) console.log(`  ${CREATE_TABLE_SQL.trim()}`);
        console.log(`  ${CREATE_INDEX_SQL}`);
        console.log("\nRelancer avec --apply pour exécuter.");
        return;
    }

    if (!hasTable) {
        await db.execute(CREATE_TABLE_SQL);
    }

    // Toujours rejoué : un run précédent a pu créer la table puis échouer avant
    // l'index (connexion coupée). Sortir tôt sur « table présente » laisserait
    // alors l'index manquant pour toujours. `IF NOT EXISTS` rend l'appel gratuit.
    await db.execute(CREATE_INDEX_SQL);

    if (hasTable) {
        console.log(`⚠️ Table déjà présente — index ${INDEX} vérifié`);
        return;
    }

    // Vérification explicite plutôt que confiance dans l'absence d'exception :
    // la table conditionne chaque INSERT du POST détaillé, un échec silencieux ici
    // ferait tomber toutes les soumissions après déploiement.
    const after = await db.execute(`PRAGMA table_info("${TABLE}")`);
    const columns = after.rows.map(r => String(r.name));
    const expected = ['id', 'report_id', 'breakdown', 'category', 'quantity'];
    const missing = expected.filter(c => !columns.includes(c));
    if (missing.length > 0) {
        console.error(`❌ Colonnes manquantes après CREATE (${missing.join(', ')}) — migration NON valide`);
        process.exit(1);
    }
    console.log(`✅ Table ${TABLE} confirmée (${columns.join(', ')})`);
    console.log("ℹ️ Les rapports existants ne reçoivent aucune ligne de détail — total seul sur leur fiche.");
}

main().catch((error: unknown) => {
    console.error("❌ Migration échouée :", error instanceof Error ? error.message : String(error));
    process.exit(1);
});
