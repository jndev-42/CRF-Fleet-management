/**
 * Définitions centralisées des rôles utilisateurs.
 *
 * Tous les noms de rôles, labels et helpers doivent être importés depuis ce fichier
 * pour éviter les typos et assurer la cohérence.
 */

// ── Constantes de rôles ───────────────────────────────────────────────────────

export const ROLES = {
    SUPER_ADMIN: 'SUPER_ADMIN',
    ADMIN:       'ADMIN',
    PRESIDENT:   'PRESIDENT',
    TRESORIER:   'TRESORIER',
    CADRE:       'CADRE',
    DT:          'DT',
    CHVPSP:      'CHVPSP',
    CHVL:        'CHVL',
    CI_RPAPS:    'CI/RPAPS',
    INACTIF:     'INACTIF',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

/** Rôles disponibles dans l'interface de gestion (dans l'ordre d'affichage) */
export const MANAGEABLE_ROLES: Role[] = [
    ROLES.SUPER_ADMIN,
    ROLES.ADMIN,
    ROLES.PRESIDENT,
    ROLES.TRESORIER,
    ROLES.CADRE,
    ROLES.DT,
    ROLES.CHVPSP,
    ROLES.CHVL,
    ROLES.CI_RPAPS,
    ROLES.INACTIF,
];

export const ROLE_LABELS: Record<Role, string> = {
    [ROLES.SUPER_ADMIN]: 'Super Administrateur',
    [ROLES.ADMIN]:       'Administrateur',
    [ROLES.PRESIDENT]:   'Président',
    [ROLES.TRESORIER]:   'Trésorier',
    [ROLES.CADRE]:       'Cadre',
    [ROLES.DT]:          'Direction Territoriale (DT)',
    [ROLES.CHVPSP]:      'Chauffeur VPSP',
    [ROLES.CHVL]:        'Chauffeur VL',
    [ROLES.CI_RPAPS]:    'CI / RPAPS',
    [ROLES.INACTIF]:     'Inactif',
};

// ── Blocage d'un compte inactif ───────────────────────────────────────────────

/**
 * Cœur de la dominance d'INACTIF : un compte qui porte INACTIF (ou sa valeur
 * héritée GUEST) n'exerce AUCUNE autorisation, quels que soient ses autres rôles.
 *
 * `'GUEST'` est traité bien qu'absent de `ROLES` : `resolveRoles` le normalise à
 * l'écriture, mais la construction de session ne normalise pas — elle découpe la
 * CSV brute de `UserUL.roles`, donc un `'GUEST'` hérité arrive littéralement
 * jusqu'à l'API.
 */
function carriesInactive(roles: string[]): boolean {
    return roles.some(r => r === ROLES.INACTIF || r === 'GUEST');
}

/**
 * Enveloppe un prédicat d'autorisation d'un refus inconditionnel pour tout compte
 * portant INACTIF.
 *
 * **Pourquoi une enveloppe, et pas une condition recopiée dans chaque prédicat.**
 * Le blocage doit tenir à un seul endroit : la porte est `carriesInactive`, et
 * `denyWhenInactive` est la seule façon de la franchir. Une condition
 * `!carriesInactive(roles) && …` répétée dix fois se serait dégradée au onzième
 * prédicat — c'est exactement ce qui a produit la faille que ce correctif ferme :
 * le blocage n'était tiré que par `isInactive`/`isQrBlocked`, que les gardes d'API
 * n'appellent pas, et les autorisations passaient à côté.
 *
 * **Le filet qui rend la règle structurelle** : `src/__tests__/unit/roles.test.ts`
 * énumère les exports de CE fichier et exige de chaque prédicat booléen qu'il
 * refuse `['<RÔLE>','INACTIF']`. Un prédicat ajouté ici sans enveloppe fait échouer
 * la suite — la protection ne repose donc pas sur la vigilance du prochain
 * contributeur. Les deux seules exemptions (`isInactive`, `isQrBlocked`, qui
 * DÉTECTENT l'inactivité au lieu de l'autoriser) y sont nommées explicitement.
 */
function denyWhenInactive(predicate: (roles: string[]) => boolean): (roles: string[]) => boolean {
    return (roles: string[]) => !carriesInactive(roles) && predicate(roles);
}

// ── Helpers de vérification ───────────────────────────────────────────────────
//
// Tous refusent un compte portant INACTIF. Les prédicats composés
// (`isAdminOrAbove`, `canAccessAdminPanel`, `canAssignRole`) en héritent par
// composition et n'ont pas besoin de leur propre enveloppe — mais le test
// d'énumération les couvre quand même.

/** Super Admin : accès complet à toutes les ULs, peut gérer les modules et attribuer SUPER_ADMIN */
export const isSuperAdmin = denyWhenInactive(roles => roles.includes(ROLES.SUPER_ADMIN));

/** Admin : accès complet dans son UL seulement */
export const isAdmin = denyWhenInactive(roles => roles.includes(ROLES.ADMIN));

/** Super Admin ou Admin : peut tout faire dans son périmètre */
export function isAdminOrAbove(roles: string[]): boolean {
    return isSuperAdmin(roles) || isAdmin(roles);
}

/** Trésorier : accès aux notes de frais en attente de paiement */
export const isTresorier = denyWhenInactive(roles => roles.includes(ROLES.TRESORIER));

/**
 * Peut créer, renommer et archiver les budgets analytiques de son UL.
 *
 * Composé explicitement sur ses rôles, et NON sur `isReadOnlyManager` : dériver
 * une autorisation d'écriture d'un helper « read only » serait un contresens, et
 * sa clause `&& !isAdminOrAbove` exclurait à tort les administrateurs.
 * `canAccessAdminPanel` n'est pas réutilisable non plus : il omet TRESORIER, et
 * l'étendre élargirait silencieusement l'accès au panneau d'administration.
 */
export const canManageExpenseBudgets = denyWhenInactive(roles =>
    isAdminOrAbove(roles)
    || isTresorier(roles)
    || roles.includes(ROLES.PRESIDENT)
    || roles.includes(ROLES.CADRE));

/** Rôle DT : accès à la vision DT des véhicules */
export const hasDTRole = denyWhenInactive(roles => roles.includes(ROLES.DT) || isSuperAdmin(roles));

/**
 * Président ou Cadre : accès en lecture seule dans leur UL (sans rôle d'administration supérieur).
 *
 * L'enveloppe est INDISPENSABLE ici et ne peut pas être héritée : la clause
 * `&& !isAdminOrAbove(roles)` s'inverse sous blocage — un `['ADMIN','INACTIF']`
 * verrait `isAdminOrAbove` rendre `false` et serait promu « lecteur », donc
 * `canAccessAdminPanel`. Le durcissement d'un prédicat en relâchait un autre.
 */
export const isReadOnlyManager = denyWhenInactive(roles =>
    (roles.includes(ROLES.PRESIDENT) || roles.includes(ROLES.CADRE)) && !isAdminOrAbove(roles));

/** Super Admin, Admin, Président ou Cadre : peut accéder au panneau d'administration */
export function canAccessAdminPanel(roles: string[]): boolean {
    return isAdminOrAbove(roles) || isReadOnlyManager(roles);
}

/** Vérifie si l'utilisateur est un rôle chauffeur */
export const isDriverRole = denyWhenInactive(roles =>
    roles.includes(ROLES.CHVL) || roles.includes(ROLES.CHVPSP));

/**
 * Vérifie si l'utilisateur est inactif.
 *
 * INACTIF est DOMINANT : il suffit de le porter pour être inactif, même en cumul
 * avec des rôles actifs (`['INACTIF','CHVL']` → `true`). La branche `length === 0`
 * est conservée : le deny-by-default du reste de l'application ne change pas.
 *
 * `'GUEST'` est traité bien qu'absent de `ROLES` : c'est une valeur héritée que
 * `resolveRoles` normalise à l'écriture, mais que la construction de session ne
 * normalise pas — elle découpe la CSV brute de `UserUL.roles`.
 */
export function isInactive(roles: string[]): boolean {
    return roles.length === 0 || carriesInactive(roles);
}

/**
 * Accès QR : tout compte connecté, avec ou sans rôle attribué, SAUF un compte
 * portant INACTIF (ou GUEST, valeur héritée équivalente).
 *
 * INACTIF est DOMINANT : un compte qui le porte est refusé même s'il cumule des
 * rôles actifs (`['INACTIF','CHVL']` → refusé).
 *
 * Diffère d'`isInactive()` sur un seul point, délibérément : une liste de rôles
 * VIDE est autorisée ici. Un bénévole pas encore qualifié doit pouvoir déclarer un
 * mouvement ou rendre un véhicule. C'est la seule divergence entre les deux
 * prédicats, et elle est voulue — ne pas les fusionner.
 */
export function isQrBlocked(roles: string[]): boolean {
    return carriesInactive(roles);
}

/**
 * Empêche un non-SUPER_ADMIN d'attribuer le rôle SUPER_ADMIN.
 * Retourne true si l'attribution est autorisée.
 */
export function canAssignRole(actorRoles: string[], targetRole: string): boolean {
    if (targetRole === ROLES.SUPER_ADMIN) {
        return isSuperAdmin(actorRoles);
    }
    return isAdminOrAbove(actorRoles);
}

/**
 * Normalise la liste de rôles destinée au STOCKAGE.
 *
 * Séparation des responsabilités : le stockage enregistre ce que l'administrateur a
 * coché, le runtime en tire la décision d'accès. Bloquer un compte et détruire ses
 * attributions sont deux choses distinctes — décocher INACTIF doit restituer le CHVL
 * sans avoir à le re-saisir. INACTIF est donc CONSERVÉ aux côtés des rôles actifs ;
 * c'est `isInactive()` / `isQrBlocked()` qui en tirent le blocage.
 *
 * - Normalise GUEST → INACTIF (valeur héritée).
 * - Si uniquement INACTIF/GUEST, retourne ['INACTIF'].
 * - Sinon, retourne l'ensemble normalisé dédupliqué, dans l'ordre reçu.
 */
export function resolveRoles(roles: string[]): string[] {
    // Normalize GUEST → INACTIF
    const normalized = roles.map(r => r === 'GUEST' ? ROLES.INACTIF : r);

    const isInactiveRole = (r: string) => r === ROLES.INACTIF;
    // Ne sert plus à construire la valeur de retour : c'est le test « existe-t-il au
    // moins un rôle actif ? » qui gouverne la branche ci-dessous.
    const activeRoles = normalized.filter(r => !isInactiveRole(r));

    if (activeRoles.length === 0) {
        return normalized.some(isInactiveRole) ? [ROLES.INACTIF] : [];
    }
    // Dédupliqué : un payload ['GUEST','INACTIF',…] normalise en deux 'INACTIF'.
    return [...new Set(normalized)];
}
