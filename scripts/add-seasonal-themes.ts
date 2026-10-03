/**
 * Migration production — thèmes saisonniers.
 *
 * Crée la table `SeasonalTheme` (activation et plage de dates de chaque thème).
 * Idempotente (`IF NOT EXISTS`).
 *
 * À exécuter AVANT le déploiement de la v5.21.0 : sans la table,
 * `GET /api/themes/active` et `/api/settings/themes*` répondent 500 (l'habillage
 * reste simplement absent côté utilisateur, l'onglet « Thèmes » est inutilisable).
 *
 * Usage :
 *   npx tsx scripts/add-seasonal-themes.ts            # dry-run, n'écrit rien
 *   npx tsx scripts/add-seasonal-themes.ts --apply    # applique, puis vérifie
 */
import { createClient } from '@libsql/client';
import "dotenv/config";
import { SEASONAL_THEME_DDL, SEASONAL_THEME_TABLE } from '../src/lib/themes/schema';

async function main() {
    const apply = process.argv.includes('--apply');
    console.log(`Migration : thèmes saisonniers ${apply ? '(--apply)' : '(dry-run)'}`);

    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN
    });

    const hasTable = async () => (await db.execute({
        sql: `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
        args: [SEASONAL_THEME_TABLE],
    })).rows.length > 0;

    console.log(`  table ${SEASONAL_THEME_TABLE} : ${await hasTable() ? 'présente' : 'ABSENTE'}`);

    if (await hasTable()) {
        console.log("⚠️ Rien à faire — base déjà à jour");
        return;
    }

    if (!apply) {
        console.log("\nPlan (aucune écriture) :");
        console.log(`  ${SEASONAL_THEME_DDL.replace(/\s+/g, ' ')}`);
        console.log("\nRelancer avec --apply pour exécuter.");
        return;
    }

    await db.execute(SEASONAL_THEME_DDL);

    if (!(await hasTable())) {
        console.error(`❌ Table ${SEASONAL_THEME_TABLE} absente après migration — migration NON valide`);
        process.exit(1);
    }
    console.log("✅ Table des thèmes saisonniers confirmée");
}

main().catch((error: unknown) => {
    console.error("❌ Migration échouée :", error instanceof Error ? error.message : String(error));
    process.exit(1);
});
