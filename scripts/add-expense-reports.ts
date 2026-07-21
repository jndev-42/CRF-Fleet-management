/**
 * Migration de production — Création de la table ExpenseReport.
 *
 * Ce script crée la table ExpenseReport et ses index (idempotent).
 *
 * Usage :
 *   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npx tsx scripts/add-expense-reports.ts
 */
import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || url.startsWith('file:')) {
    console.error('❌ TURSO_DATABASE_URL must be set to a remote libsql:// URL');
    process.exit(1);
}

const db = createClient({ url, authToken });

async function run() {
    console.log('\n▶ Création de la table ExpenseReport...');

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "ExpenseReport" (
            "id"                     TEXT NOT NULL PRIMARY KEY,
            "userId"                 TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
            "submittedAt"            TEXT NOT NULL,
            "status"                 TEXT NOT NULL DEFAULT 'soumis',
            "imputation"             TEXT NOT NULL DEFAULT 'DLUS',
            "customImputation"       TEXT,
            "requestRefund"          INTEGER NOT NULL DEFAULT 1,
            "noReceiptDeclaration"   INTEGER NOT NULL DEFAULT 0,
            "driveFolderId"          TEXT,
            "total"                  REAL NOT NULL DEFAULT 0.0,
            "items"                  TEXT NOT NULL, -- JSON string: Array<{ label: string, amount: number }>
            "ulId"                   TEXT NOT NULL DEFAULT 'ul-paris-18',
            "validatedAt"            TEXT,
            "validatedBy"            TEXT REFERENCES "User"(id) ON DELETE SET NULL,
            "rejectionComment"       TEXT,
            "rejectedAt"             TEXT,
            "rejectedBy"             TEXT REFERENCES "User"(id) ON DELETE SET NULL,
            "paidAt"                 TEXT,
            "paidBy"                 TEXT REFERENCES "User"(id) ON DELETE SET NULL,
            "createdAt"              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt"              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('  ✓ Table ExpenseReport créée (ou déjà existante)');

    await db.execute(`
        CREATE INDEX IF NOT EXISTS "ExpenseReport_userId_idx"
        ON "ExpenseReport"("userId")
    `);
    await db.execute(`
        CREATE INDEX IF NOT EXISTS "ExpenseReport_status_idx"
        ON "ExpenseReport"("status")
    `);
    await db.execute(`
        CREATE INDEX IF NOT EXISTS "ExpenseReport_ulId_idx"
        ON "ExpenseReport"("ulId")
    `);
    console.log('  ✓ Index créés');

    console.log('\n✅ Migration terminée.\n');
}

run().catch(e => {
    console.error('Erreur fatale :', e);
    process.exit(1);
});
