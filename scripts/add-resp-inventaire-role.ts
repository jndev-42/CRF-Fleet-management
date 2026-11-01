/**
 * Migration — rôle « Responsable inventaire » (RESP_INVENTAIRE).
 *
 * Insère la ligne `Role` RESP_INVENTAIRE (identifiant `role-resp_inventaire`, le même
 * que le seed preview et setup-dev). Aucune route ne crée de rôle : sans cette ligne,
 * Gestion des utilisateurs ne propose pas le rôle (`availableRoles` ne liste que les
 * rôles présents en base) et une attribution par le repli global `UserRole` est ignorée.
 *
 * N'attribue le rôle à personne : c'est un administrateur qui le coche ensuite.
 * Signale aussi, sans les écrire, les autres rôles de `MANAGEABLE_ROLES` absents de
 * la table — ils relèvent de leur propre migration.
 *
 * À exécuter AVANT ou au moment du déploiement de la v5.36.0.
 *
 * Idempotent. Usage :
 *   npx tsx scripts/add-resp-inventaire-role.ts                         # dry-run, n'écrit rien
 *   npx tsx scripts/add-resp-inventaire-role.ts --apply                 # applique, puis vérifie
 *   npx tsx scripts/add-resp-inventaire-role.ts --env .env.preview --apply
 */
import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import { MANAGEABLE_ROLES, ROLES } from '../src/lib/roles';

// Cible l'environnement passé en `--env` (défaut : .env).
const envFile = (() => {
    const i = process.argv.indexOf('--env');
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : '.env';
})();
dotenv.config({ path: envFile });

const ROLE_NAME = ROLES.RESP_INVENTAIRE;
const ROLE_ID = 'role-resp_inventaire';

type Db = ReturnType<typeof createClient>;

async function existingRoleNames(db: Db): Promise<Set<string>> {
    const res = await db.execute(`SELECT name FROM "Role"`);
    return new Set(res.rows.map(r => String(r.name)));
}

async function main() {
    const apply = process.argv.includes('--apply');
    const url = (process.env.TURSO_DATABASE_URL || '').trim();
    if (!url) {
        console.error(`❌ TURSO_DATABASE_URL absent (fichier ${envFile}).`);
        process.exit(1);
    }
    const db = createClient({ url, authToken: (process.env.TURSO_AUTH_TOKEN || '').trim() });
    console.log(`▶ Base : ${url.startsWith('file:') ? url : new URL(url).host} (${envFile})`);
    console.log(apply ? '▶ Mode : --apply (écriture)' : '▶ Mode : dry-run (aucune écriture)');

    const before = await existingRoleNames(db);
    const others = MANAGEABLE_ROLES.filter(r => r !== ROLE_NAME && !before.has(r));
    if (others.length > 0) {
        console.warn(`⚠ Autres rôles gérables absents de "Role" (non traités ici) : ${others.join(', ')}`);
    }

    if (before.has(ROLE_NAME)) {
        console.log(`✓ Rôle ${ROLE_NAME} déjà présent — rien à faire.`);
        return;
    }

    console.log(`• À insérer : "Role" (${ROLE_ID}, ${ROLE_NAME})`);
    if (!apply) {
        console.log('ℹ Dry-run : relancer avec --apply pour écrire.');
        return;
    }

    await db.execute({
        sql: `INSERT OR IGNORE INTO "Role" (id, name) VALUES (?, ?)`,
        args: [ROLE_ID, ROLE_NAME],
    });

    const after = await existingRoleNames(db);
    if (!after.has(ROLE_NAME)) {
        console.error(`❌ Vérification : ${ROLE_NAME} toujours absent après insertion.`);
        process.exit(1);
    }
    console.log(`✅ Rôle ${ROLE_NAME} inséré et vérifié.`);
}

main().catch(e => {
    console.error('Erreur fatale :', e instanceof Error ? e.message : String(e));
    process.exit(1);
});
