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

// ── Helpers de vérification ───────────────────────────────────────────────────

/** Super Admin : accès complet à toutes les ULs, peut gérer les modules et attribuer SUPER_ADMIN */
export function isSuperAdmin(roles: string[]): boolean {
    return roles.includes(ROLES.SUPER_ADMIN);
}

/** Admin : accès complet dans son UL seulement */
export function isAdmin(roles: string[]): boolean {
    return roles.includes(ROLES.ADMIN);
}

/** Super Admin ou Admin : peut tout faire dans son périmètre */
export function isAdminOrAbove(roles: string[]): boolean {
    return isSuperAdmin(roles) || isAdmin(roles);
}

/** Trésorier : accès aux notes de frais en attente de paiement */
export function isTresorier(roles: string[]): boolean {
    return roles.includes(ROLES.TRESORIER);
}

/** Rôle DT : accès à la vision DT des véhicules */
export function hasDTRole(roles: string[]): boolean {
    return roles.includes(ROLES.DT) || isSuperAdmin(roles);
}

/** Président ou Cadre : accès en lecture seule dans leur UL */
export function isReadOnlyManager(roles: string[]): boolean {
    return roles.includes(ROLES.PRESIDENT) || roles.includes(ROLES.CADRE);
}

/** Super Admin, Admin, Président ou Cadre : peut accéder au panneau d'administration */
export function canAccessAdminPanel(roles: string[]): boolean {
    return isAdminOrAbove(roles) || isReadOnlyManager(roles);
}

/** Vérifie si l'utilisateur est un rôle chauffeur */
export function isDriverRole(roles: string[]): boolean {
    return roles.includes(ROLES.CHVL) || roles.includes(ROLES.CHVPSP);
}

/** Vérifie si l'utilisateur est inactif */
export function isInactive(roles: string[]): boolean {
    return roles.length > 0 && roles.every(r => r === ROLES.INACTIF || r === 'GUEST');
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
 * Résout la liste de rôles finale :
 * - Si INACTIF (ou GUEST legacy) est présent avec d'autres rôles actifs, on écarte INACTIF.
 * - Si uniquement INACTIF/GUEST, on retourne ['INACTIF'].
 * - Normalise GUEST → INACTIF.
 */
export function resolveRoles(roles: string[]): string[] {
    // Normalize GUEST → INACTIF
    const normalized = roles.map(r => r === 'GUEST' ? ROLES.INACTIF : r);

    const isInactiveRole = (r: string) => r === ROLES.INACTIF;
    const activeRoles = normalized.filter(r => !isInactiveRole(r));

    if (activeRoles.length === 0) {
        return normalized.some(isInactiveRole) ? [ROLES.INACTIF] : [];
    }
    return activeRoles;
}
