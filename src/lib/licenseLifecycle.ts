/**
 * Cycle de vie de l'état des papiers selon le rôle chauffeur.
 *
 * Seuls CHVL et CHVPSP sont soumis à la validation des papiers. Cette règle est portée
 * ici, en un seul endroit, par les routes qui modifient les rôles d'un compte :
 * - non-chauffeur → chauffeur : validation effacée, délai de grâce démarré à `today` ;
 * - chauffeur → non-chauffeur : tout état de validation effacé ;
 * - chauffeur → chauffeur (ex. CHVPSP ajouté à un CHVL) : rien ne change.
 *
 * Ce sont des manipulations de DONNÉE de rôles, pas des décisions d'accès : la présence
 * du rôle est lue brute (INACTIF n'efface pas CHVL/CHVPSP).
 */

/** Exécuteur SQL : la transaction en cours (`db.transaction('write')`) ou le client. */
export interface SqlExecutor {
    execute(stmt: { sql: string; args: (string | number | null)[] }): Promise<{ rows: unknown[] }>;
}

/**
 * `true` si le compte porte CHVL ou CHVPSP dans `UserRole` ou dans une ligne
 * `UserUL.roles` (CSV). Présence brute, INACTIF compris.
 */
export async function holdsDriverRole(exec: SqlExecutor, userId: string): Promise<boolean> {
    const global = await exec.execute({
        sql: `SELECT 1 FROM "UserRole" ur
              JOIN "Role" r ON ur.roleId = r.id
              WHERE ur.userId = ? AND r.name IN ('CHVL', 'CHVPSP')
              LIMIT 1`,
        args: [userId],
    });
    if (global.rows.length > 0) return true;

    const perUl = await exec.execute({
        sql: `SELECT 1 FROM "UserUL"
              WHERE userId = ?
                AND (instr(',' || REPLACE(COALESCE(roles, ''), ' ', '') || ',', ',CHVL,') > 0
                  OR instr(',' || REPLACE(COALESCE(roles, ''), ' ', '') || ',', ',CHVPSP,') > 0)
              LIMIT 1`,
        args: [userId],
    });
    return perUl.rows.length > 0;
}

/**
 * Applique la transition d'état des papiers. `wasDriver` est mesuré AVANT les écritures
 * de rôles, `isDriver` APRÈS, dans la même transaction.
 *
 * @param today  date du jour au format `YYYY-MM-DD`
 */
export async function applyDriverRoleTransition(
    exec: SqlExecutor,
    userId: string,
    wasDriver: boolean,
    isDriver: boolean,
    today: string,
): Promise<void> {
    if (wasDriver === isDriver) return;
    await exec.execute({
        sql: `UPDATE "User"
              SET papiers_valides = 0,
                  last_validation = NULL,
                  start_date_invalidation_process = ?
              WHERE id = ?`,
        args: [isDriver ? today : null, userId],
    });
}
