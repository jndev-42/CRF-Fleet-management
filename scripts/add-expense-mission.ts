/**
 * Migration de production — Ajout des colonnes nom et date de mission sur ExpenseReport.
 *
 * Ce script ajoute les colonnes suivantes à la table ExpenseReport (idempotent) :
 * - missionName (TEXT, nullable) — nom / objet de la mission
 * - missionDate (TEXT, nullable) — date de la mission (ISO yyyy-MM-dd), distincte de submittedAt
 *
 * Les colonnes sont volontairement nullables : les notes de frais déjà générées restent
 * valides et leur PDF conserve le rendu historique.
 *
 * Usage :
 *   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npx tsx scripts/add-expense-mission.ts
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
    console.log('\n▶ Migration : Ajout des colonnes missionName et missionDate sur ExpenseReport...');

    await addColumnIfNotExists('ExpenseReport', 'missionName', 'TEXT');
    await addColumnIfNotExists('ExpenseReport', 'missionDate', 'TEXT');

    console.log('\n✅ Migration terminée.\n');
}

run().catch(e => {
    console.error('Erreur fatale :', e);
    process.exit(1);
});
