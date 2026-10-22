/**
 * Migration production — mémoire des alertes d'échéance quotidiennes.
 *
 * Crée la table `ScheduledAlert` (une ligne par alerte déjà envoyée, pour n'alerter
 * qu'une fois par étape et par échéance). Idempotente : ne crée que ce qui manque.
 *
 * À exécuter AVANT le déploiement de la v5.29.0 : sans la table, le cron
 * `/api/cron/daily-alerts` répond 500 et n'envoie aucune notification.
 *
 * Usage :
 *   npx tsx scripts/add-scheduled-alerts.ts            # dry-run, n'écrit rien
 *   npx tsx scripts/add-scheduled-alerts.ts --apply    # applique, puis vérifie
 */
import { createClient } from '@libsql/client';
import "dotenv/config";
import { SCHEDULED_ALERT_DDL, SCHEDULED_ALERT_TABLE } from '../src/lib/alerts/schema';

async function main() {
    const apply = process.argv.includes('--apply');
    console.log(`Migration : alertes d'échéance ${apply ? '(--apply)' : '(dry-run)'}`);

    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN
    });

    const hasTable = async () => (await db.execute({
        sql: `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
        args: [SCHEDULED_ALERT_TABLE],
    })).rows.length > 0;

    const present = await hasTable();
    console.log(`  table ${SCHEDULED_ALERT_TABLE} : ${present ? 'présente' : 'ABSENTE'}`);

    if (present) {
        console.log("⚠️ Rien à faire — base déjà à jour");
        return;
    }

    if (!apply) {
        console.log("\nPlan (aucune écriture) :");
        console.log(`  ${SCHEDULED_ALERT_DDL.replace(/\s+/g, ' ')}`);
        console.log("\nRelancer avec --apply pour exécuter.");
        return;
    }

    await db.execute(SCHEDULED_ALERT_DDL);

    if (!(await hasTable())) {
        console.error(`❌ table ${SCHEDULED_ALERT_TABLE} absente après migration — migration NON valide`);
        process.exit(1);
    }
    console.log("✅ Table des alertes d'échéance confirmée");
}

main().catch((error: unknown) => {
    console.error("❌ Migration échouée :", error instanceof Error ? error.message : String(error));
    process.exit(1);
});
