/**
 * Migration production — serveur MCP et jetons d'accès IA.
 *
 * Crée la table `McpToken` et son index `(userId)`, et ajoute la colonne
 * `AuditLog.via` (marque « MCP · <nom du jeton> » des actions faites par une IA)
 * si elle est absente. Idempotente.
 *
 * À exécuter AVANT le déploiement : sans la table, l'onglet « Accès IA (MCP) »
 * (`/api/mcp-tokens`) et le serveur `/api/mcp` répondent 500 ; sans la colonne,
 * le journal d'audit (`/api/audit-logs`) répond 500 et plus aucune action n'est
 * tracée (les routes, elles, répondent normalement).
 *
 * Usage :
 *   npx tsx scripts/add-mcp-tokens.ts            # dry-run, n'écrit rien
 *   npx tsx scripts/add-mcp-tokens.ts --apply    # applique, puis vérifie
 */
import { createClient } from '@libsql/client';
import "dotenv/config";
import { AUDIT_LOG_TABLE, AUDIT_LOG_VIA_COLUMN_DDL } from '../src/lib/audit/schema';
import { MCP_TOKEN_DDL, MCP_TOKEN_INDEXES, MCP_TOKEN_TABLE } from '../src/lib/mcp/schema';

async function main() {
    const apply = process.argv.includes('--apply');
    console.log(`Migration : serveur MCP et jetons d'accès IA ${apply ? '(--apply)' : '(dry-run)'}`);

    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN
    });

    const readSchema = async () => new Set(
        (await db.execute(`SELECT name FROM sqlite_master WHERE type IN ('table', 'index')`)).rows.map(r => String(r.name)),
    );
    const readAuditColumns = async () => new Set(
        (await db.execute(`PRAGMA table_info("${AUDIT_LOG_TABLE}")`)).rows.map(r => String(r.name)),
    );

    const existing = await readSchema();
    if (!existing.has(AUDIT_LOG_TABLE)) {
        console.error(`❌ Table ${AUDIT_LOG_TABLE} absente : exécuter d'abord scripts/add-audit-log.ts`);
        process.exit(1);
    }
    const hasTable = existing.has(MCP_TOKEN_TABLE);
    const missingIndexes = MCP_TOKEN_INDEXES.filter(i => !existing.has(i.name));
    const hasVia = (await readAuditColumns()).has('via');

    console.log(`  table ${MCP_TOKEN_TABLE} : ${hasTable ? 'présente' : 'ABSENTE'}`);
    for (const i of MCP_TOKEN_INDEXES) console.log(`  index ${i.name} : ${existing.has(i.name) ? 'présent' : 'ABSENT'}`);
    console.log(`  colonne ${AUDIT_LOG_TABLE}.via : ${hasVia ? 'présente' : 'ABSENTE'}`);

    if (hasTable && missingIndexes.length === 0 && hasVia) {
        console.log("⚠️ Rien à faire — base déjà à jour");
        return;
    }

    if (!apply) {
        console.log("\nPlan (aucune écriture) :");
        if (!hasTable) console.log(`  ${MCP_TOKEN_DDL.replace(/\s+/g, ' ')}`);
        for (const i of missingIndexes) console.log(`  ${i.ddl}`);
        if (!hasVia) console.log(`  ${AUDIT_LOG_VIA_COLUMN_DDL}`);
        console.log("\nRelancer avec --apply pour exécuter.");
        return;
    }

    await db.execute(MCP_TOKEN_DDL);
    for (const i of MCP_TOKEN_INDEXES) await db.execute(i.ddl);
    if (!hasVia) await db.execute(AUDIT_LOG_VIA_COLUMN_DDL);

    const after = await readSchema();
    const failures = [MCP_TOKEN_TABLE, ...MCP_TOKEN_INDEXES.map(i => i.name)].filter(n => !after.has(n));
    if (!(await readAuditColumns()).has('via')) failures.push(`${AUDIT_LOG_TABLE}.via`);
    if (failures.length > 0) {
        console.error(`❌ Absents après migration : ${failures.join(', ')} — migration NON valide`);
        process.exit(1);
    }
    console.log("✅ Table des jetons MCP, index et colonne AuditLog.via confirmés");
}

main().catch((error: unknown) => {
    console.error("❌ Migration échouée :", error instanceof Error ? error.message : String(error));
    process.exit(1);
});
