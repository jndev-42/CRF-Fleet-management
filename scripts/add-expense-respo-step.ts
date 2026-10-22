/**
 * Migration production — étape « responsable d'activité » des notes de frais.
 *
 * Ajoute à `ExpenseReport` :
 *   - `workflowVersion INTEGER DEFAULT 1` — 1 : ancien circuit (le président valide
 *     en une étape) ; 2 : RESPO puis président. Écrit à 2 au scellement #1. Les
 *     notes existantes prennent 1 : leur PDF scellé ne porte que trois champs de
 *     signature et elles DOIVENT suivre l'ancien circuit ;
 *   - `respoValidatedAt`, `respoValidatedBy`, `respoSignature`.
 * Puis insère la ligne `Role` RESPO (identifiant `role-respo`, le même que le seed
 * preview et l'auto-seed de GET /api/users).
 *
 * À exécuter AVANT le déploiement : les routes des notes de frais lisent et écrivent
 * ces colonnes. Sans elles, la liste (GET /api/expenses), le détail, la soumission
 * et la validation répondent 500 — le module Notes de frais est inutilisable.
 *
 * ⚠️ RÔLE RESPO HÉRITÉ. Un ancien rôle RESPO (gestionnaire de flotte) a existé. Les
 * comptes qui le portent encore, dans `UserUL.roles` ou `UserRole`, deviendraient
 * silencieusement valideurs de notes de frais : le script les liste (e-mail, UL),
 * en dry-run comme en --apply, pour qu'un administrateur décide quoi en faire.
 *
 * Idempotent. Usage :
 *   npx tsx scripts/add-expense-respo-step.ts            # dry-run, n'écrit rien
 *   npx tsx scripts/add-expense-respo-step.ts --apply    # applique, puis vérifie
 *   npx tsx scripts/add-expense-respo-step.ts --env .env.preview --apply
 */
import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

// Cible l'environnement passé en `--env` (défaut : .env).
const envFile = (() => {
    const i = process.argv.indexOf('--env');
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : '.env';
})();
dotenv.config({ path: envFile });

const COLUMNS: { name: string; ddl: string }[] = [
    { name: 'workflowVersion', ddl: `ALTER TABLE "ExpenseReport" ADD COLUMN "workflowVersion" INTEGER DEFAULT 1` },
    { name: 'respoValidatedAt', ddl: `ALTER TABLE "ExpenseReport" ADD COLUMN "respoValidatedAt" TEXT` },
    { name: 'respoValidatedBy', ddl: `ALTER TABLE "ExpenseReport" ADD COLUMN "respoValidatedBy" TEXT REFERENCES "User"("id") ON DELETE SET NULL` },
    { name: 'respoSignature', ddl: `ALTER TABLE "ExpenseReport" ADD COLUMN "respoSignature" TEXT` },
];

/** Comptes portant déjà RESPO : via `UserUL.roles` (par UL) ou `UserRole` (global). */
async function listRespoHolders(db: ReturnType<typeof createClient>): Promise<void> {
    const viaUl = await db.execute(`
        SELECT u.email, uu.ulId FROM "UserUL" uu JOIN "User" u ON u.id = uu.userId
         WHERE ',' || REPLACE(COALESCE(uu.roles, ''), ' ', '') || ',' LIKE '%,RESPO,%'
         ORDER BY uu.ulId, u.email`);
    const viaRole = await db.execute(`
        SELECT u.email, GROUP_CONCAT(uu.ulId) AS uls FROM "UserRole" ur
          JOIN "Role" r ON r.id = ur.roleId
          JOIN "User" u ON u.id = ur.userId
          LEFT JOIN "UserUL" uu ON uu.userId = u.id
         WHERE r.name = 'RESPO'
         GROUP BY u.email ORDER BY u.email`);
    const total = viaUl.rows.length + viaRole.rows.length;
    console.log(`  comptes portant déjà RESPO : ${total}`);
    for (const r of viaUl.rows) console.log(`   ${r.email} — UL ${r.ulId} (UserUL.roles)`);
    for (const r of viaRole.rows) console.log(`   ${r.email} — UL ${r.uls ?? 'aucune'} (UserRole)`);
    if (total > 0) {
        console.log("  ⚠️ Ces comptes deviendront valideurs des notes de frais de leur UL : retirez-leur RESPO s'il s'agit de l'ancien rôle.");
    }
}

async function main() {
    const apply = process.argv.includes('--apply');
    console.log(`Migration (${envFile}) : étape RESPO des notes de frais ${apply ? '(--apply)' : '(dry-run)'}`);

    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN
    });

    const cols = await db.execute(`PRAGMA table_info("ExpenseReport")`);
    const present = new Set(cols.rows.map(r => r.name as string));
    const missing = COLUMNS.filter(c => !present.has(c.name));
    for (const c of COLUMNS) {
        console.log(`  colonne ${c.name.padEnd(17)} : ${present.has(c.name) ? 'présente' : 'ABSENTE'}`);
    }

    const role = await db.execute({ sql: `SELECT id FROM "Role" WHERE name = ?`, args: ['RESPO'] });
    const hasRole = role.rows.length > 0;
    console.log(`  rôle RESPO              : ${hasRole ? 'présent' : 'ABSENT'}`);
    await listRespoHolders(db);

    if (missing.length === 0 && hasRole) {
        console.log("⚠️ Rien à faire — base déjà à jour");
        return;
    }

    if (!apply) {
        console.log("\nPlan (aucune écriture) :");
        for (const c of missing) console.log(`  ${c.ddl}`);
        if (!hasRole) console.log(`  INSERT OR IGNORE INTO "Role" (id, name) VALUES ('role-respo', 'RESPO')`);
        console.log("\nRelancer avec --apply pour exécuter.");
        return;
    }

    for (const c of missing) {
        await db.execute(c.ddl);
        console.log(`✅ Colonne ${c.name} ajoutée`);
    }
    if (!hasRole) {
        await db.execute({
            sql: `INSERT OR IGNORE INTO "Role" (id, name) VALUES (?, ?)`,
            args: ['role-respo', 'RESPO'],
        });
        console.log("✅ Rôle RESPO ajouté");
    }

    // Vérification : colonnes présentes, rôle présent, et aucune note existante
    // basculée par erreur sur le nouveau circuit.
    const after = await db.execute(`PRAGMA table_info("ExpenseReport")`);
    const afterNames = new Set(after.rows.map(r => r.name as string));
    const stillMissing = COLUMNS.filter(c => !afterNames.has(c.name)).map(c => c.name);
    if (stillMissing.length) {
        console.error(`❌ Colonnes toujours absentes : ${stillMissing.join(', ')}`);
        process.exit(1);
    }
    const roleAfter = await db.execute({ sql: `SELECT id FROM "Role" WHERE name = ?`, args: ['RESPO'] });
    if (roleAfter.rows.length === 0) {
        console.error("❌ Rôle RESPO toujours absent");
        process.exit(1);
    }
    const v2 = await db.execute(`SELECT COUNT(*) AS c FROM "ExpenseReport" WHERE workflowVersion = 2`);
    console.log(`  notes déjà sur le circuit v2 : ${v2.rows[0].c}`);
    await listRespoHolders(db);
    console.log("✅ Migration appliquée et vérifiée");
}

main().catch((error: unknown) => {
    console.error("❌ Migration échouée :", error instanceof Error ? error.message : String(error));
    process.exit(1);
});
