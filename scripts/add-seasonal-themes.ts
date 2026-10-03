/**
 * Migration production — thèmes saisonniers.
 *
 * Crée les tables `SeasonalTheme` (activation et plage de dates de chaque thème) et
 * `SeasonalThemeUL` (UL ciblées par thème ; aucune ligne = toutes les UL).
 * Idempotente : ne crée que les tables manquantes.
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
import { SEASONAL_THEME_DDL, SEASONAL_THEME_TABLE, SEASONAL_THEME_UL_DDL, SEASONAL_THEME_UL_TABLE } from '../src/lib/themes/schema';

async function main() {
    const apply = process.argv.includes('--apply');
    console.log(`Migration : thèmes saisonniers ${apply ? '(--apply)' : '(dry-run)'}`);

    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN
    });

    const tables = [
        { name: SEASONAL_THEME_TABLE, ddl: SEASONAL_THEME_DDL },
        { name: SEASONAL_THEME_UL_TABLE, ddl: SEASONAL_THEME_UL_DDL },
    ];

    const hasTable = async (name: string) => (await db.execute({
        sql: `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
        args: [name],
    })).rows.length > 0;

    const missing: typeof tables = [];
    for (const table of tables) {
        const present = await hasTable(table.name);
        console.log(`  table ${table.name} : ${present ? 'présente' : 'ABSENTE'}`);
        if (!present) missing.push(table);
    }

    if (missing.length === 0) {
        console.log("⚠️ Rien à faire — base déjà à jour");
        return;
    }

    if (!apply) {
        console.log("\nPlan (aucune écriture) :");
        for (const table of missing) console.log(`  ${table.ddl.replace(/\s+/g, ' ')}`);
        console.log("\nRelancer avec --apply pour exécuter.");
        return;
    }

    for (const table of missing) await db.execute(table.ddl);

    for (const table of tables) {
        if (!(await hasTable(table.name))) {
            console.error(`❌ Table ${table.name} absente après migration — migration NON valide`);
            process.exit(1);
        }
    }
    console.log("✅ Tables des thèmes saisonniers confirmées");
}

main().catch((error: unknown) => {
    console.error("❌ Migration échouée :", error instanceof Error ? error.message : String(error));
    process.exit(1);
});
