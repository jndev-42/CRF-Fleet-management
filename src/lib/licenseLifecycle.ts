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
 * `true` si le compte porte CHVL ou CHVPSP dans `UserRole`. Présence brute, INACTIF compris.
 *
 * Invariant : `UserRole` porte les rôles de l'UL de rattachement (synchronisés par les
 * routes users) et un chauffeur d'une UL secondaire l'est aussi dans son UL de
 * rattachement — la CSV `UserUL.roles` n'est donc pas lue. Même population que
 * `UsersTable` (`user.roles`) et `ELIGIBLE_DRIVER_PREDICATE`.
 */
export async function holdsDriverRole(exec: SqlExecutor, userId: string): Promise<boolean> {
    const res = await exec.execute({
        sql: `SELECT 1 FROM "UserRole" ur
              JOIN "Role" r ON ur.roleId = r.id
              WHERE ur.userId = ? AND r.name IN ('CHVL', 'CHVPSP')
              LIMIT 1`,
        args: [userId],
    });
    return res.rows.length > 0;
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
