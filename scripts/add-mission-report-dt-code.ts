/**
 * Migration production — colonne `mission_reports.dt_code`.
 *
 * Un compte rendu est désormais rattaché explicitement soit à une UL (`ulId`),
 * soit à une Direction Territoriale (`dt_code`), jamais aux deux. La DT n'est PAS
 * une entité stockée : `dt_code` reçoit la valeur brute d'un `UniteLocale.dtCode`
 * existant (ex. `"DT 75"`), sans ligne `UniteLocale` dédiée.
 *
 * À exécuter AVANT le déploiement : le POST `/api/missions` écrit la colonne dès
 * la première soumission, donc tant qu'elle manque en production chaque création
 * de compte rendu répond 500.
 *
 * Les rapports existants gardent leur `ulId` et reçoivent `dt_code = NULL` —
 * l'invariant « exactement un des deux » reste donc vrai pour l'historique.
 *
 * Usage :
 *   npx tsx scripts/add-mission-report-dt-code.ts                        # .env, dry-run
 *   npx tsx scripts/add-mission-report-dt-code.ts --apply                # .env, applique
 *   npx tsx scripts/add-mission-report-dt-code.ts --env .env.preview --apply
 */
import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

// Cible l'environnement passé en `--env` (défaut : .env).
const envFile = (() => {
    const i = process.argv.indexOf('--env');
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : '.env';
})();
dotenv.config({ path: envFile });

const COLUMN = 'dt_code';

async function main() {
    const apply = process.argv.includes('--apply');
    console.log(`Migration (${envFile}) : mission_reports.${COLUMN} ${apply ? '(--apply)' : '(dry-run)'}`);

    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN
    });

    const cols = await db.execute(`PRAGMA table_info("mission_reports")`);
    if (cols.rows.length === 0) {
        console.error('❌ Table "mission_reports" introuvable — migration impossible');
        process.exit(1);
    }

    const hasColumn = cols.rows.some(r => r.name === COLUMN);
    console.log(`  colonne ${COLUMN} : ${hasColumn ? 'présente' : 'ABSENTE'}`);

    // Contrôle d'hygiène : un rapport sans ulId ne pourra jamais être rapproché
    // d'une UL ni d'une DT, donc il disparaîtra de « Tous les rapports ». On le
    // signale sans bloquer — c'est de l'historique, pas une erreur de migration.
    const orphans = await db.execute(`SELECT COUNT(*) AS c FROM "mission_reports" WHERE "ulId" IS NULL OR "ulId" = 'default'`);
    const orphanCount = Number(orphans.rows[0].c);
    if (orphanCount > 0) {
        console.log(`  ⚠️ ${orphanCount} rapport(s) sans UL exploitable (ulId NULL ou 'default') — visibles uniquement via « Mes rapports »`);
    }

    if (hasColumn) {
        console.log("⚠️ Rien à faire — base déjà à jour");
        return;
    }

    if (!apply) {
        console.log("\nPlan (aucune écriture) :");
        console.log(`  ALTER TABLE "mission_reports" ADD COLUMN "${COLUMN}" TEXT`);
        console.log("\nRelancer avec --apply pour exécuter.");
        return;
    }

    await db.execute(`ALTER TABLE "mission_reports" ADD COLUMN "${COLUMN}" TEXT`);

    // Vérification explicite plutôt que confiance dans l'absence d'exception :
    // la colonne conditionne chaque INSERT du POST, un échec silencieux ici
    // ferait tomber toutes les soumissions après déploiement.
    const after = await db.execute(`PRAGMA table_info("mission_reports")`);
    if (!after.rows.some(r => r.name === COLUMN)) {
        console.error(`❌ Colonne ${COLUMN} absente après ALTER — migration NON valide`);
        process.exit(1);
    }
    console.log(`✅ Colonne ${COLUMN} confirmée`);
    console.log("ℹ️ Les rapports existants conservent leur ulId et reçoivent dt_code = NULL.");
}

main().catch((error: unknown) => {
    console.error("❌ Migration échouée :", error instanceof Error ? error.message : String(error));
    process.exit(1);
});
