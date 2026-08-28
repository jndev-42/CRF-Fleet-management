/**
 * Migration — dépôt transitoire des justificatifs d'une note de frais.
 *
 * Ajoute à `ExpenseReport` :
 *   - `pendingReceiptKeys` : clés R2 (JSON) des justificatifs déposés pendant
 *     qu'une note est encore au statut brouillon, en attente d'intégration au
 *     PDF lors du premier scellement.
 *
 * Idempotent : relançable sans effet de bord (vérifie l'existence avant ALTER).
 *
 * Usage :
 *   npx tsx scripts/add-expense-pending-receipts.ts                   # .env.local
 *   npx tsx scripts/add-expense-pending-receipts.ts --env .env.preview
 *
 * ⚠️ Cible la base DISTANTE (Turso) via TURSO_DATABASE_URL / TURSO_AUTH_TOKEN.
 * Pour le développement local, `scripts/setup-dev.ts` applique déjà cette colonne.
 */

import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

const envFile = (() => {
    const i = process.argv.indexOf('--env');
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : '.env.local';
})();
dotenv.config({ path: envFile });

const NEW_COLUMNS = ['pendingReceiptKeys'] as const;

async function main(): Promise<void> {
    const url = process.env.TURSO_DATABASE_URL?.trim();
    const authToken = process.env.TURSO_AUTH_TOKEN?.trim();

    if (!url) {
        console.error('TURSO_DATABASE_URL est absente. Renseignez .env.local avant de lancer la migration.');
        process.exit(1);
    }

    console.log(`Environnement : ${envFile}`);
    console.log(`Base cible    : ${url.replace(/^libsql:\/\//, '').split('.')[0]}\n`);

    const db = createClient({ url: url.replace(/^libsql:\/\//, 'https://'), authToken: authToken || '' });

    const cols = await db.execute('PRAGMA table_info("ExpenseReport")');
    const existing = cols.rows.map(r => r.name as string);

    let added = 0;
    for (const col of NEW_COLUMNS) {
        if (existing.includes(col)) {
            console.log(`  = ${col} déjà présente`);
            continue;
        }
        await db.execute(`ALTER TABLE "ExpenseReport" ADD COLUMN "${col}" TEXT`);
        console.log(`  + ${col} ajoutée`);
        added++;
    }

    console.log(`\n${added} colonne(s) ajoutée(s).`);
}

main().catch(e => {
    console.error('Échec de la migration :', e);
    process.exit(1);
});
