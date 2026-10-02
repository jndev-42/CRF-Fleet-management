/**
 * Migration production — journal d'audit (traçabilité des actions utilisateurs).
 *
 * Crée la table `AuditLog` et ses index `(createdAt)` et `(actorEmail, createdAt)`.
 * Idempotente (`IF NOT EXISTS`).
 *
 * À exécuter AVANT le déploiement : sans la table, l'onglet « Journal d'audit »
 * (`GET /api/audit-logs`) répond 500. Les routes mutantes, elles, continuent de
 * répondre normalement — l'écriture d'audit est non fatale — mais rien n'est tracé.
 *
 * Usage :
 *   npx tsx scripts/add-audit-log.ts            # dry-run, n'écrit rien
 *   npx tsx scripts/add-audit-log.ts --apply    # applique, puis vérifie
 */
import { createClient } from '@libsql/client';
import "dotenv/config";
import { AUDIT_LOG_DDL, AUDIT_LOG_INDEXES, AUDIT_LOG_TABLE } from '../src/lib/audit/schema';

async function main() {
    const apply = process.argv.includes('--apply');
    console.log(`Migration : journal d'audit ${apply ? '(--apply)' : '(dry-run)'}`);

    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN
    });

    const readSchema = async () => new Set(
        (await db.execute(`SELECT name FROM sqlite_master WHERE type IN ('table', 'index')`)).rows.map(r => String(r.name)),
    );
    const existing = await readSchema();
    const hasTable = existing.has(AUDIT_LOG_TABLE);
    const missingIndexes = AUDIT_LOG_INDEXES.filter(i => !existing.has(i.name));

    console.log(`  table ${AUDIT_LOG_TABLE} : ${hasTable ? 'présente' : 'ABSENTE'}`);
    for (const i of AUDIT_LOG_INDEXES) console.log(`  index ${i.name} : ${existing.has(i.name) ? 'présent' : 'ABSENT'}`);

    if (hasTable && missingIndexes.length === 0) {
        console.log("⚠️ Rien à faire — base déjà à jour");
        return;
    }

    if (!apply) {
        console.log("\nPlan (aucune écriture) :");
        if (!hasTable) console.log(`  ${AUDIT_LOG_DDL.replace(/\s+/g, ' ')}`);
        for (const i of missingIndexes) console.log(`  ${i.ddl}`);
        console.log("\nRelancer avec --apply pour exécuter.");
        return;
    }

    await db.execute(AUDIT_LOG_DDL);
    for (const i of AUDIT_LOG_INDEXES) await db.execute(i.ddl);

    const after = await readSchema();
    const failures = [AUDIT_LOG_TABLE, ...AUDIT_LOG_INDEXES.map(i => i.name)].filter(n => !after.has(n));
    if (failures.length > 0) {
        console.error(`❌ Absents après migration : ${failures.join(', ')} — migration NON valide`);
        process.exit(1);
    }
    console.log("✅ Table et index du journal d'audit confirmés");
}

main().catch((error: unknown) => {
    console.error("❌ Migration échouée :", error instanceof Error ? error.message : String(error));
    process.exit(1);
});
