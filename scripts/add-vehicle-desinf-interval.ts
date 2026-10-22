/**
 * Migration production — périodicité de désinfection des VPSP.
 *
 * Ajoute `Vehicle.desinfIntervalMonths` (INTEGER NOT NULL DEFAULT 3 : 1, 2 ou 3 mois)
 * puis recalcule `nextDesinfMaxDate = date(lastDesinfDate, '+3 months')` pour les
 * véhicules déjà désinfectés (l'ancienne règle codée en dur était « + 42 jours »).
 * Les véhicules sans `lastDesinfDate` restent à NULL (« Non planifiée »).
 *
 * À exécuter AVANT le déploiement : sans la colonne, les check-in de désinfection
 * et la modale d'édition véhicule répondent 500.
 *
 * Idempotent. Usage :
 *   npx tsx scripts/add-vehicle-desinf-interval.ts            # dry-run, n'écrit rien
 *   npx tsx scripts/add-vehicle-desinf-interval.ts --apply    # applique, puis vérifie
 */
import { createClient } from '@libsql/client';
import "dotenv/config";

async function main() {
    const apply = process.argv.includes('--apply');
    console.log(`Migration : Vehicle.desinfIntervalMonths ${apply ? '(--apply)' : '(dry-run)'}`);

    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN
    });

    const cols = await db.execute(`PRAGMA table_info("Vehicle")`);
    const hasColumn = cols.rows.some(r => r.name === 'desinfIntervalMonths');
    console.log(`  colonne desinfIntervalMonths : ${hasColumn ? 'présente' : 'ABSENTE'}`);

    // Véhicules dont l'échéance diffère de lastDesinfDate + 3 mois (avant migration : la colonne
    // n'existe pas, donc tous prennent la valeur par défaut 3).
    const intervalExpr = hasColumn ? `COALESCE(desinfIntervalMonths, 3)` : `3`;
    const stale = await db.execute(`
        SELECT name, lastDesinfDate, nextDesinfMaxDate,
               date(lastDesinfDate, '+' || ${intervalExpr} || ' months') AS newDate
          FROM "Vehicle"
         WHERE lastDesinfDate IS NOT NULL
           AND (nextDesinfMaxDate IS NULL
                OR nextDesinfMaxDate != date(lastDesinfDate, '+' || ${intervalExpr} || ' months'))
    `);
    console.log(`  échéances à recalculer : ${stale.rows.length}`);
    for (const r of stale.rows) {
        console.log(`   ${r.name} : ${r.lastDesinfDate} → ${r.nextDesinfMaxDate ?? 'NULL'} devient ${r.newDate}`);
    }

    if (hasColumn && stale.rows.length === 0) {
        console.log("⚠️ Rien à faire — base déjà à jour");
        return;
    }

    if (!apply) {
        console.log("\nPlan (aucune écriture) :");
        if (!hasColumn) console.log(`  ALTER TABLE "Vehicle" ADD COLUMN "desinfIntervalMonths" INTEGER NOT NULL DEFAULT 3`);
        if (stale.rows.length > 0) console.log(`  UPDATE "Vehicle" SET nextDesinfMaxDate = date(lastDesinfDate, '+' || COALESCE(desinfIntervalMonths, 3) || ' months') WHERE lastDesinfDate IS NOT NULL`);
        console.log("\nRelancer avec --apply pour exécuter.");
        return;
    }

    if (!hasColumn) {
        await db.execute(`ALTER TABLE "Vehicle" ADD COLUMN "desinfIntervalMonths" INTEGER NOT NULL DEFAULT 3`);
        console.log("✅ Colonne desinfIntervalMonths ajoutée");
    }

    await db.execute(`
        UPDATE "Vehicle"
           SET nextDesinfMaxDate = date(lastDesinfDate, '+' || COALESCE(desinfIntervalMonths, 3) || ' months')
         WHERE lastDesinfDate IS NOT NULL
    `);

    const check = await db.execute(`
        SELECT COUNT(*) AS c FROM "Vehicle"
         WHERE lastDesinfDate IS NOT NULL
           AND (nextDesinfMaxDate IS NULL
                OR nextDesinfMaxDate != date(lastDesinfDate, '+' || desinfIntervalMonths || ' months'))
    `);
    if (Number(check.rows[0].c) !== 0) {
        console.error(`❌ ${check.rows[0].c} échéance(s) encore incohérente(s) — migration NON valide`);
        process.exit(1);
    }
    console.log("✅ Échéances recalculées et vérifiées");
}

main().catch((error: unknown) => {
    console.error("❌ Migration échouée :", error instanceof Error ? error.message : String(error));
    process.exit(1);
});
