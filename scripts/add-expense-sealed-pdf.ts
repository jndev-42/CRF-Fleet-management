/**
 * Migration — colonnes de scellement cryptographique des notes de frais.
 *
 * Ajoute à `ExpenseReport` :
 *   - `payerSignature`     : signature du trésorier (scellement #3)
 *   - `r2Key`              : clé Cloudflare R2 du PDF scellé courant
 *   - `signatureRevisions` : journal JSON des révisions signées
 *
 * Idempotent : relançable sans effet de bord (vérifie l'existence avant ALTER).
 *
 * Usage :
 *   npx tsx scripts/add-expense-sealed-pdf.ts                   # .env.local
 *   npx tsx scripts/add-expense-sealed-pdf.ts --env .env.preview
 *
 * ⚠️ Cible la base DISTANTE (Turso) via TURSO_DATABASE_URL / TURSO_AUTH_TOKEN.
 * Pour le développement local, `scripts/setup-dev.ts` applique déjà ces colonnes.
 */

import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import { MAX_ITEMS_SINGLE_PAGE } from '../src/lib/expenses/signature-layout';

// Cible l'environnement passé en `--env` (défaut : .env.local).
// Permet d'appliquer la migration sur preview avant la production.
const envFile = (() => {
    const i = process.argv.indexOf('--env');
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : '.env.local';
})();
dotenv.config({ path: envFile });

const NEW_COLUMNS = ['payerSignature', 'r2Key', 'signatureRevisions'] as const;

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

    // Contrôle d'exploitation lié à la décision D6 : une note dépassant
    // MAX_ITEMS_SINGLE_PAGE postes produit un PDF de 2 pages, que le scellement
    // refuse. Les notes DÉJÀ en base
    // ne peuvent pas être refusées rétroactivement — il faut connaître leur nombre
    // avant de lancer le backfill (§K13 du plan de consensus).
    const longNotes = await db.execute(`
        SELECT COUNT(*) AS n FROM "ExpenseReport"
        WHERE status != 'brouillon' AND json_array_length(items) > ${MAX_ITEMS_SINGLE_PAGE}
    `);
    const n = Number(longNotes.rows[0]?.n ?? 0);

    console.log(`\n${added} colonne(s) ajoutée(s).`);
    console.log(`Notes existantes de plus de ${MAX_ITEMS_SINGLE_PAGE} postes : ${n}`);
    if (n > 0) {
        console.log(
            '  ⚠️ Ces notes ne tiennent pas sur une page. Le backfill devra les sceller\n' +
            '     sans widget visible (3 signatures invisibles) — voir §K13 du plan.'
        );
    }
}

main().catch(e => {
    console.error('Échec de la migration :', e);
    process.exit(1);
});
