export const ROLES = {
    ADMIN: 'ADMIN',
    RESPO: 'RESPO',
    CHVL: 'CHVL',
    CHVPSP: 'CHVPSP',
    INACTIF: 'INACTIF',
    GUEST: 'GUEST', // Legacy
    SECOURISTE: 'SECOURISTE',
    CI_RPAPS: 'CI/RPAPS',
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

export const DRIVER_ROLES = [ROLES.CHVL, ROLES.CHVPSP];
export const ADMIN_OR_RESPO_ROLES = [ROLES.ADMIN, ROLES.RESPO];
