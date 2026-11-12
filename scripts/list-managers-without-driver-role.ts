/**
 * Liste (LECTURE SEULE) les comptes qui perdent l'emprunt avec la v5.51.0 : non INACTIF,
 * portant ADMIN, SUPER_ADMIN ou RESP_VEHICULE (dans `UserRole` ou dans `UserUL.roles`) mais ni
 * CHVL ni CHVPSP dans `UserRole`. Seuls les chauffeurs empruntent désormais.
 *
 * Leur ajouter CHVL/CHVPSP efface leurs papiers et démarre une grâce de 14 jours.
 *
 * À exécuter AVANT le déploiement de la v5.51.0. N'écrit rien.
 *
 * Usage :
 *   npx tsx scripts/list-managers-without-driver-role.ts                      # .env
 *   npx tsx scripts/list-managers-without-driver-role.ts --env .env.preview
 */
import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

// Cible l'environnement passé en `--env` (défaut : .env).
const envFile = (() => {
    const i = process.argv.indexOf('--env');
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : '.env';
})();
dotenv.config({ path: envFile });

const MANAGER_ROLES = ['ADMIN', 'SUPER_ADMIN', 'RESP_VEHICULE'];
const BLOCKING_ROLES = ['INACTIF', 'GUEST'];
const DRIVER_ROLES = ['CHVL', 'CHVPSP'];

function splitCsv(csv: unknown): string[] {
    return typeof csv === 'string' ? csv.split(',').map(r => r.trim()).filter(Boolean) : [];
}

async function main() {
    console.log(`Comptes gestionnaires sans rôle chauffeur (${envFile}, lecture seule)`);

    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN,
    });

    const users = await db.execute(`SELECT id, email, name FROM "User" ORDER BY email`);
    const globalRoles = await db.execute(
        `SELECT ur.userId AS userId, r.name AS role FROM "UserRole" ur JOIN "Role" r ON ur.roleId = r.id`,
    );
    const ulRows = await db.execute(
        `SELECT uu.userId AS userId, uu.is_home AS isHome, uu.roles AS roles, ul.name AS ulName
         FROM "UserUL" uu JOIN "UniteLocale" ul ON ul.id = uu.ulId`,
    );

    const rolesByUser = new Map<string, Set<string>>();
    const globalByUser = new Map<string, Set<string>>();
    const homeUlByUser = new Map<string, string>();
    const add = (map: Map<string, Set<string>>, id: string, role: string) => {
        if (!map.has(id)) map.set(id, new Set());
        map.get(id)!.add(role);
    };
    for (const r of globalRoles.rows) {
        add(rolesByUser, r.userId as string, r.role as string);
        add(globalByUser, r.userId as string, r.role as string);
    }
    for (const r of ulRows.rows) {
        for (const role of splitCsv(r.roles)) add(rolesByUser, r.userId as string, role);
        if (Number(r.isHome) === 1) homeUlByUser.set(r.userId as string, r.ulName as string);
    }

    let total = 0;
    for (const u of users.rows) {
        const id = u.id as string;
        const all = rolesByUser.get(id) ?? new Set<string>();
        const global = globalByUser.get(id) ?? new Set<string>();
        if (BLOCKING_ROLES.some(r => all.has(r))) continue;
        if (!MANAGER_ROLES.some(r => all.has(r))) continue;
        if (DRIVER_ROLES.some(r => global.has(r))) continue;
        total++;
        console.log(
            `  ${u.email} | ${u.name ?? '—'} | UL : ${homeUlByUser.get(id) ?? '—'} | rôles : ${[...all].sort().join(', ')}`,
        );
    }

    console.log(`\nTotal : ${total} compte(s) sans CHVL ni CHVPSP qui perdent l'emprunt.`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
