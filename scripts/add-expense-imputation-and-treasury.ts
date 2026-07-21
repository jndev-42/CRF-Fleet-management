/**
 * Migration de production — Ajout des colonnes pour imputation, motif de refus et trésorerie.
 *
 * Ce script ajoute les colonnes suivantes à la table ExpenseReport (idempotent) :
 * - imputation (TEXT, default 'DLUS')
 * - customImputation (TEXT, nullable)
 * - rejectionComment (TEXT, nullable)
 * - rejectedAt (TEXT, nullable)
 * - rejectedBy (TEXT, nullable)
 * - paidAt (TEXT, nullable)
 * - paidBy (TEXT, nullable)
 *
 * Usage :
 *   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npx tsx scripts/add-expense-imputation-and-treasury.ts
 */
import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || url.startsWith('file:')) {
    console.error('❌ TURSO_DATABASE_URL must be set to a remote libsql:// URL');
    process.exit(1);
}

const db = createClient({ url, authToken });

async function addColumnIfNotExists(tableName: string, columnName: string, columnDef: string) {
    try {
        await db.execute(`ALTER TABLE "${tableName}" ADD COLUMN "${columnName}" ${columnDef}`);
        console.log(`  ✓ Colonne ${columnName} ajoutée avec succès`);
    } catch (e: unknown) {
        const err = e as { message?: string };
        if (err.message?.includes('duplicate column name')) {
            console.log(`  ℹ Colonne ${columnName} existe déjà`);
        } else {
            console.error(`  ❌ Erreur lors de l'ajout de la colonne ${columnName}:`, err.message);
        }
    }
}

async function run() {
    console.log('\n▶ Migration : Ajout des colonnes imputation, refus et trésorerie sur ExpenseReport...');

    await addColumnIfNotExists('ExpenseReport', 'imputation', "TEXT NOT NULL DEFAULT 'DLUS'");
    await addColumnIfNotExists('ExpenseReport', 'customImputation', 'TEXT');
    await addColumnIfNotExists('ExpenseReport', 'rejectionComment', 'TEXT');
    await addColumnIfNotExists('ExpenseReport', 'rejectedAt', 'TEXT');
    await addColumnIfNotExists('ExpenseReport', 'rejectedBy', 'TEXT');
    await addColumnIfNotExists('ExpenseReport', 'paidAt', 'TEXT');
    await addColumnIfNotExists('ExpenseReport', 'paidBy', 'TEXT');

    console.log('\n✅ Migration terminée.\n');
}

run().catch(e => {
    console.error('Erreur fatale :', e);
    process.exit(1);
});
