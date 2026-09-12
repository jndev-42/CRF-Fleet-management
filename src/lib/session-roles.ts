import type { InStatement, ResultSet } from '@libsql/client';
import { ROLES } from '@/lib/roles';

/**
 * Exécuteur minimal : `db` comme une transaction le satisfont.
 *
 * Structurel, et non `Pick<Client, 'execute'>` : cela immunise contre les surcharges
 * `execute(sql, args)` ajoutées par @libsql/client, et permet à un test de passer un
 * espion sans fabriquer un client complet.
 */
export type SessionRolesExecutor = {
    execute(stmt: InStatement): Promise<ResultSet>;
};

/** Découpe la CSV de `UserUL.roles` (NULL, chaîne vide et espaces tolérés). */
function parseRolesCsv(raw: unknown): string[] {
    if (typeof raw !== 'string') return [];
    return raw.split(',').map(r => r.trim()).filter(Boolean);
}

/**
 * Résout les rôles de session d'un compte.
 *
 * **Une seule implémentation, appelée par les deux callbacks d'`auth.ts`** (`jwt` et
 * `session`). Ils en portaient chacun une copie, déjà désynchronisées.
 *
 * Deux règles distinctes, à ne pas confondre :
 *
 * 1. **Quels rôles le compte exerce** — cascade `UserUL` de l'UL active → rôles
 *    globaux (`UserRole`). **La cascade s'arrête là.** Elle ne consulte PAS
 *    `token.roles` : ce repli serait auto-référentiel dans `jwt` (le token y est la
 *    valeur en cours de recalcul) et un compte dont un administrateur retire tous
 *    les rôles garderait les siens indéfiniment — la révocation n'arriverait jamais.
 *    D'où l'absence de tout paramètre `tokenRoles` dans cette signature : il n'y a
 *    plus rien à passer pour réintroduire ce repli. `token.roles` reste légitime
 *    sur le seul chemin `catch` d'`auth.ts` — repli de PANNE, pas de cascade.
 *
 * 2. **Si le compte est INACTIF** — propriété du COMPTE, pas de l'UL active : vraie
 *    dès qu'INACTIF (ou sa valeur héritée GUEST) figure sur l'UL de rattachement
 *    (`is_home = 1`) **ou** dans les rôles globaux, quelle que soit l'UL active.
 *    Sans cela, un INACTIF posé sur la home ne bloquerait un compte multi-UL que
 *    pendant qu'il a cette UL active — un blocage intermittent.
 *
 * `INACTIF` est **ajouté**, jamais substitué : les prédicats étant absorbants
 * (`some`), l'ajout suffit. Retirer les rôles actifs rendrait l'interface incohérente
 * (un administrateur bloqué n'aurait plus l'air d'un administrateur) et détruirait
 * l'information qu'un déblocage doit restituer.
 *
 * Coût : **exactement 2 requêtes**, quel que soit le nombre d'UL du compte.
 *
 * @param activeUlId UL active ; `null` ou `'default'` ⇒ pas de ligne active, repli sur
 *                   les rôles globaux. La ligne home est lue dans tous les cas — c'est
 *                   précisément là qu'un compte sans UL active doit pouvoir être bloqué.
 */
export async function resolveSessionRoles(
    exec: SessionRolesExecutor,
    userId: string,
    activeUlId: string | null,
): Promise<string[]> {
    const [globalRes, ulRes] = await Promise.all([
        exec.execute({
            sql: `SELECT r.name
                  FROM "UserRole" ur
                  JOIN "Role" r ON ur.roleId = r.id
                  WHERE ur.userId = ?`,
            args: [userId],
        }),
        exec.execute({
            sql: 'SELECT ulId, is_home, roles FROM "UserUL" WHERE userId = ?',
            args: [userId],
        }),
    ]);

    const globalRoles = (globalRes?.rows || []).map(row => row.name as string);
    const ulRows = ulRes?.rows || [];

    const hasActiveUl = !!activeUlId && activeUlId !== 'default';
    const activeRow = hasActiveUl ? ulRows.find(row => row.ulId === activeUlId) : undefined;
    const homeRow = ulRows.find(row => !!row.is_home);

    const activeUlRoles = parseRolesCsv(activeRow?.roles);
    // Copie : `globalRoles` est relu plus bas pour SUPER_ADMIN et pour INACTIF.
    const roles = activeUlRoles.length > 0 ? activeUlRoles : [...globalRoles];

    // Remontée SUPER_ADMIN : un super admin le reste sur toutes les UL.
    if (globalRoles.includes(ROLES.SUPER_ADMIN) && !roles.includes(ROLES.SUPER_ADMIN)) {
        roles.unshift(ROLES.SUPER_ADMIN);
    }

    // INACTIF, propriété du compte : home ∪ global, jamais l'UL secondaire.
    const accountScope = [...parseRolesCsv(homeRow?.roles), ...globalRoles];
    const isAccountInactive = accountScope.some(r => r === ROLES.INACTIF || r === 'GUEST');
    if (isAccountInactive && !roles.includes(ROLES.INACTIF)) {
        roles.push(ROLES.INACTIF);
    }

    return roles;
}
