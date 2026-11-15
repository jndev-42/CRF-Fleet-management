/**
 * Migration production — colonne `InvItem.orderedAt` (repère « Commandé » du récap Stock faible).
 *
 * Purement visuel : date à laquelle un gestionnaire a marqué l'article comme commandé.
 * Effacée automatiquement par le cron quotidien dès que l'article repasse au-dessus du minimum.
 *
 * À exécuter AVANT le déploiement : sans la colonne, GET et PATCH /api/inventory/low-stock
 * répondent 500 et le cron quotidien journalise une erreur (sans bloquer les alertes).
 *
 * Usage :
 *   npx tsx scripts/add-inventory-ordered-at.ts                       # .env, dry-run, n'écrit rien
 *   npx tsx scripts/add-inventory-ordered-at.ts --apply               # .env, applique, puis vérifie
 *   npx tsx scripts/add-inventory-ordered-at.ts --env .env.preview --apply
 */
import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

// Cible l'environnement passé en `--env` (défaut : .env).
const envFile = (() => {
    const i = process.argv.indexOf('--env');
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : '.env';
})();
dotenv.config({ path: envFile });

async function hasColumn(db: ReturnType<typeof createClient>): Promise<boolean> {
    const cols = await db.execute(`PRAGMA table_info("InvItem")`);
    return cols.rows.some(r => r.name === 'orderedAt');
}

async function main() {
    const apply = process.argv.includes('--apply');
    console.log(`Migration (${envFile}) : InvItem.orderedAt ${apply ? '(--apply)' : '(dry-run)'}`);

    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN
    });

    const present = await hasColumn(db);
    console.log(`  colonne orderedAt : ${present ? 'présente' : 'ABSENTE'}`);

    if (present) {
        console.log("⚠️ Rien à faire — base déjà à jour");
        return;
    }

    if (!apply) {
        console.log("\nPlan (aucune écriture) :");
        console.log(`  ALTER TABLE "InvItem" ADD COLUMN "orderedAt" DATETIME`);
        console.log("\nRelancer avec --apply pour exécuter.");
        return;
    }

    await db.execute(`ALTER TABLE "InvItem" ADD COLUMN "orderedAt" DATETIME`);

    if (!(await hasColumn(db))) {
        console.error("❌ Colonne orderedAt absente après ajout — migration NON valide");
        process.exit(1);
    }
    console.log("✅ Colonne orderedAt ajoutée et confirmée");
}

main().catch((error: unknown) => {
    console.error("❌ Migration échouée :", error instanceof Error ? error.message : String(error));
    process.exit(1);
});
