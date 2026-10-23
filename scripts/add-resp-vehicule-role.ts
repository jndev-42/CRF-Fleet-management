/**
 * Migration production — rôle « Responsable véhicule » (RESP_VEHICULE).
 *
 * Le cadre perd ses droits sur les véhicules et ses notifications véhicule, qui
 * passent au responsable véhicule. Pour que personne ne perde ce qu'il avait, la
 * migration attribue RESP_VEHICULE à tout compte qui porte CADRE, partout où il le
 * porte :
 *   - insère la ligne `Role` RESP_VEHICULE (identifiant `role-resp_vehicule`, le même
 *     que l'auto-seed de GET /api/users, le seed preview et setup-dev) ;
 *   - ajoute un `UserRole` RESP_VEHICULE à chaque porteur d'un `UserRole` CADRE ;
 *   - ajoute RESP_VEHICULE à chaque CSV `UserUL.roles` qui contient CADRE.
 * CADRE n'est jamais retiré.
 *
 * La CSV est découpée en JS et comparée exactement : un `LIKE '%CADRE%'` attraperait
 * n'importe quel rôle dont le nom contient la chaîne.
 *
 * À exécuter AVANT ou au moment du déploiement : sans elle, les notifications
 * véhicule qui visaient les cadres ne partent plus qu'aux présidents et aux admins.
 *
 * Idempotent. Usage :
 *   npx tsx scripts/add-resp-vehicule-role.ts            # dry-run, n'écrit rien
 *   npx tsx scripts/add-resp-vehicule-role.ts --apply    # applique, puis vérifie
 *   npx tsx scripts/add-resp-vehicule-role.ts --env .env.preview --apply
 */
import { createClient, type InStatement } from '@libsql/client';
import dotenv from 'dotenv';

// Cible l'environnement passé en `--env` (défaut : .env).
const envFile = (() => {
    const i = process.argv.indexOf('--env');
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : '.env';
})();
dotenv.config({ path: envFile });

const CADRE = 'CADRE';
const RESP_VEHICULE = 'RESP_VEHICULE';
const ROLE_ID = 'role-resp_vehicule';

type Db = ReturnType<typeof createClient>;

/** Découpe une CSV de rôles (espaces tolérés, entrées vides écartées). */
function splitRoles(csv: string | null): string[] {
    return (csv ?? '').split(',').map(r => r.trim()).filter(Boolean);
}

interface Plan {
    roleId: string;
    hasRole: boolean;
    /** `UserRole` CADRE sans `UserRole` RESP_VEHICULE. */
    globalUsers: { userId: string; email: string }[];
    /** `UserUL` dont la CSV contient CADRE sans RESP_VEHICULE. */
    ulRows: { userId: string; email: string; ulId: string; before: string; after: string }[];
}

async function buildPlan(db: Db): Promise<Plan> {
    const role = await db.execute({ sql: `SELECT id FROM "Role" WHERE name = ?`, args: [RESP_VEHICULE] });
    const hasRole = role.rows.length > 0;
    const roleId = hasRole ? String(role.rows[0].id) : ROLE_ID;

    const global = await db.execute({
        sql: `SELECT u.id AS userId, u.email FROM "UserRole" ur
                JOIN "Role" r ON r.id = ur.roleId
                JOIN "User" u ON u.id = ur.userId
               WHERE r.name = ?
                 AND NOT EXISTS (
                     SELECT 1 FROM "UserRole" ur2 JOIN "Role" r2 ON r2.id = ur2.roleId
                      WHERE ur2.userId = ur.userId AND r2.name = ?)
               ORDER BY u.email`,
        args: [CADRE, RESP_VEHICULE],
    });

    const uls = await db.execute(`
        SELECT uu.userId, u.email, uu.ulId, uu.roles FROM "UserUL" uu
          JOIN "User" u ON u.id = uu.userId
         WHERE uu.roles IS NOT NULL AND uu.roles != ''
         ORDER BY uu.ulId, u.email`);
    const ulRows: Plan['ulRows'] = [];
    for (const r of uls.rows) {
        const before = String(r.roles);
        const parts = splitRoles(before);
        if (!parts.includes(CADRE) || parts.includes(RESP_VEHICULE)) continue;
        ulRows.push({
            userId: String(r.userId),
            email: String(r.email),
            ulId: String(r.ulId),
            before,
            after: [...parts, RESP_VEHICULE].join(','),
        });
    }

    return {
        roleId,
        hasRole,
        globalUsers: global.rows.map(r => ({ userId: String(r.userId), email: String(r.email) })),
        ulRows,
    };
}

function printPlan(plan: Plan): void {
    console.log(`  rôle RESP_VEHICULE : ${plan.hasRole ? `présent (${plan.roleId})` : 'ABSENT'}`);
    console.log(`  UserRole CADRE sans RESP_VEHICULE : ${plan.globalUsers.length}`);
    for (const u of plan.globalUsers) console.log(`   ${u.email}`);
    console.log(`  UserUL avec CADRE sans RESP_VEHICULE : ${plan.ulRows.length}`);
    for (const r of plan.ulRows) console.log(`   ${r.email} — UL ${r.ulId} : '${r.before}' → '${r.after}'`);
}

async function main() {
    const apply = process.argv.includes('--apply');
    console.log(`Migration (${envFile}) : rôle RESP_VEHICULE pour les porteurs de CADRE ${apply ? '(--apply)' : '(dry-run)'}`);

    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN,
    });

    const plan = await buildPlan(db);
    printPlan(plan);

    if (plan.hasRole && plan.globalUsers.length === 0 && plan.ulRows.length === 0) {
        console.log('⚠️ Rien à faire — base déjà à jour');
        return;
    }

    if (!apply) {
        console.log('\nPlan (aucune écriture) :');
        if (!plan.hasRole) console.log(`  INSERT OR IGNORE INTO "Role" (id, name) VALUES ('${ROLE_ID}', '${RESP_VEHICULE}')`);
        if (plan.globalUsers.length) console.log(`  INSERT OR IGNORE INTO "UserRole" … × ${plan.globalUsers.length}`);
        if (plan.ulRows.length) console.log(`  UPDATE "UserUL" SET roles = … × ${plan.ulRows.length}`);
        console.log('\nRelancer avec --apply pour exécuter.');
        return;
    }

    const statements: InStatement[] = [];
    if (!plan.hasRole) {
        statements.push({ sql: `INSERT OR IGNORE INTO "Role" (id, name) VALUES (?, ?)`, args: [ROLE_ID, RESP_VEHICULE] });
    }
    for (const u of plan.globalUsers) {
        statements.push({ sql: `INSERT OR IGNORE INTO "UserRole" (userId, roleId) VALUES (?, ?)`, args: [u.userId, plan.roleId] });
    }
    for (const r of plan.ulRows) {
        // Garde `roles = ?` : une CSV modifiée entre le plan et l'écriture n'est pas écrasée.
        statements.push({
            sql: `UPDATE "UserUL" SET roles = ? WHERE userId = ? AND ulId = ? AND roles = ?`,
            args: [r.after, r.userId, r.ulId, r.before],
        });
    }
    await db.batch(statements, 'write');
    console.log(`✅ ${statements.length} écriture(s) appliquée(s)`);

    // Vérification : plus aucun porteur de CADRE sans RESP_VEHICULE.
    const after = await buildPlan(db);
    printPlan(after);
    if (!after.hasRole || after.globalUsers.length || after.ulRows.length) {
        console.error('❌ Des porteurs de CADRE restent sans RESP_VEHICULE');
        process.exit(1);
    }
    console.log('✅ Migration appliquée et vérifiée');
}

main().catch((error: unknown) => {
    console.error('❌ Migration échouée :', error instanceof Error ? error.message : String(error));
    process.exit(1);
});
