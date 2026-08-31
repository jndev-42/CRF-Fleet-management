/**
 * Migration de production — Budgets analytiques par UL sur les notes de frais.
 *
 * Crée la table `ExpenseBudget` et ses index, puis sème les 5 budgets par défaut
 * dans chaque UL qui n'en possède AUCUN (idempotence à l'unité UL).
 *
 * ⚠️ CE SCRIPT N'EST PAS EN LECTURE SEULE, MÊME EN DRY-RUN.
 * La DDL (table + index) s'exécute dans les deux modes : elle est idempotente et
 * non destructrice, et sans la table le dry-run ne pourrait rien compter.
 * Seuls les INSERT sont gardés par `--apply`.
 *
 * ⚠️ Idempotence à l'unité UL, pas au couple (UL, nom) : le renommage rétroactif
 * d'un budget est autorisé. Une UL ayant renommé « Repas » en « Restauration » se
 * verrait réinjecter « Repas » par un test nom par nom, et finirait avec un
 * budget parasite.
 *
 * Aucune ligne d'`ExpenseReport` n'est lue ni modifiée.
 *
 * Ordre de mise en service : dry-run prod → `--apply` prod → contrôle → PUIS
 * merge sur `main` (le déploiement Vercel est automatique sur `main`, et sans la
 * table la saisie des notes de frais serait bloquée).
 *
 * Usage :
 *   npx tsx scripts/add-expense-budgets.ts            # dry-run (défaut)
 *   npx tsx scripts/add-expense-budgets.ts --apply    # exécution réelle
 */
import { createClient } from '@libsql/client';
import { DEFAULT_EXPENSE_BUDGETS, seedDefaultBudgets } from '../src/lib/expenses/budgets';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || url.startsWith('file:')) {
    console.error('❌ TURSO_DATABASE_URL must be set to a remote libsql:// URL');
    process.exit(1);
}

const db = createClient({ url, authToken });

const APPLY = process.argv.includes('--apply');

async function run() {
    console.log('\n▶ Migration : Budgets analytiques (table ExpenseBudget)...');
    if (!APPLY) {
        console.log('  ℹ Mode dry-run : la table et les index sont créés, aucun budget n\'est inséré.');
    }

    // ── Schéma ────────────────────────────────────────────────────
    // Le REFERENCES est DOCUMENTAIRE : les clés étrangères ne sont pas activées
    // dans ce repo (aucun PRAGMA foreign_keys, cf. src/lib/db.ts).
    await db.execute(`
        CREATE TABLE IF NOT EXISTS "ExpenseBudget" (
            "id"        TEXT NOT NULL PRIMARY KEY,
            "ulId"      TEXT NOT NULL REFERENCES "UniteLocale"("id") ON DELETE CASCADE,
            "name"      TEXT NOT NULL,
            "archived"  INTEGER NOT NULL DEFAULT 0,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('  ✓ Table ExpenseBudget prête');

    // Unicité du nom parmi les budgets ACTIFS uniquement : un budget actif peut
    // reprendre le nom d'un budget archivé.
    await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS "ExpenseBudget_ulId_name_active_idx"
        ON "ExpenseBudget"("ulId", "name") WHERE "archived" = 0
    `);
    await db.execute(`
        CREATE INDEX IF NOT EXISTS "ExpenseBudget_ulId_idx"
        ON "ExpenseBudget"("ulId")
    `);
    console.log('  ✓ Index ExpenseBudget_ulId_name_active_idx et ExpenseBudget_ulId_idx prêts');

    // ── Rattrapage des ULs existantes ─────────────────────────────
    const uls = await db.execute('SELECT id FROM "UniteLocale"');
    const now = new Date().toISOString();

    let seededULs = 0;
    let skippedULs = 0;
    let createdBudgets = 0;

    for (const row of uls.rows) {
        const ulId = row.id as string;
        const existing = await db.execute({
            // TOUS statuts, archivés inclus : la présence d'un budget archivé
            // suffit à considérer l'UL comme déjà initialisée.
            sql: 'SELECT COUNT(*) AS n FROM "ExpenseBudget" WHERE "ulId" = ?',
            args: [ulId],
        });
        const n = Number(existing.rows[0]?.n ?? 0);

        if (n > 0) {
            skippedULs++;
            console.log(`  ℹ UL ${ulId} : déjà ${n} budget(s), ignorée`);
            continue;
        }

        seededULs++;
        if (APPLY) {
            createdBudgets += await seedDefaultBudgets(db, ulId, now);
            console.log(`  ✓ UL ${ulId} : ${DEFAULT_EXPENSE_BUDGETS.length} budgets créés`);
        } else {
            createdBudgets += DEFAULT_EXPENSE_BUDGETS.length;
            console.log(`  ▶ UL ${ulId} : ${DEFAULT_EXPENSE_BUDGETS.length} budgets seraient créés (${DEFAULT_EXPENSE_BUDGETS.join(', ')})`);
        }
    }

    console.log(`\n  ULs semées   : ${seededULs}`);
    console.log(`  ULs ignorées : ${skippedULs}`);
    console.log(`  Budgets ${APPLY ? 'créés' : 'à créer'} : ${createdBudgets}`);

    if (APPLY) {
        console.log('\n✅ Migration terminée.\n');
    } else {
        console.log('\nDry-run terminé. Relancez avec --apply pour écrire.\n');
    }
}

run().catch(e => {
    console.error('Erreur fatale :', e);
    process.exit(1);
});
