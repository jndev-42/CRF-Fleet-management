import { db } from '@/lib/db';

export interface EligibleDriver {
    id: string;
    name: string | null;
    email: string;
}

/** Rôle de conduite requis pour un type de véhicule : CHVPSP pour un VPSP, CHVL sinon
 *  (même règle que `canBorrow` dans `POST /api/trips`). */
export function driverRoleForVehicleType(vehicleType: unknown): 'CHVL' | 'CHVPSP' {
    return String(vehicleType || '').toUpperCase().includes('VPSP') ? 'CHVPSP' : 'CHVL';
}

/**
 * Prédicat SQL « porte le rôle de conduite `?` et aucun rôle bloquant ». INACTIF et la
 * valeur héritée GUEST sont tous deux bloquants (cf. `carriesInactive` dans `@/lib/roles`).
 */
const ELIGIBLE_DRIVER_PREDICATE = `
    u.id IN (
        SELECT ur.userId FROM "UserRole" ur
        JOIN "Role" r ON ur.roleId = r.id
        WHERE r.name = ?
    )
    AND u.id NOT IN (
        SELECT ur.userId FROM "UserRole" ur
        JOIN "Role" r ON ur.roleId = r.id
        WHERE r.name IN ('INACTIF', 'GUEST')
    )`;

/**
 * 2èmes conducteurs proposables à l'emprunt d'un véhicule : chauffeurs habilités au type
 * du véhicule, toutes unités locales confondues, hors comptes bloqués et hors
 * `excludeUserId` (l'emprunteur). N'expose que l'identité nécessaire au choix.
 */
export async function listEligibleDrivers(vehicleType: unknown, excludeUserId: string): Promise<EligibleDriver[]> {
    const res = await db.execute({
        sql: `SELECT u.id, u.name, u.email
              FROM "User" u
              WHERE ${ELIGIBLE_DRIVER_PREDICATE}
              AND u.id != ?
              ORDER BY COALESCE(u.name, u.email) COLLATE NOCASE ASC`,
        args: [driverRoleForVehicleType(vehicleType), excludeUserId],
    });

    return res.rows.map(row => ({
        id: row.id as string,
        name: (row.name as string | null) ?? null,
        email: row.email as string,
    }));
}

/**
 * Valide le 2ème conducteur d'un emprunt, côté serveur — l'interface ne propose que la
 * liste de `listEligibleDrivers`, mais une requête forgée peut envoyer n'importe quel id.
 * Retourne le message d'erreur (400) ou `null` si le choix est valide.
 */
export async function secondDriverError(
    vehicleType: unknown,
    driverId: string | undefined,
    secondDriverId: string,
): Promise<string | null> {
    if (secondDriverId === driverId) {
        return 'Le 2ème conducteur doit être différent de vous';
    }
    const res = await db.execute({
        sql: `SELECT 1 FROM "User" u WHERE u.id = ? AND ${ELIGIBLE_DRIVER_PREDICATE}`,
        args: [secondDriverId, driverRoleForVehicleType(vehicleType)],
    });
    if (res.rows.length === 0) {
        return "Le 2ème conducteur doit être un chauffeur actif habilité à ce type de véhicule";
    }
    return null;
}

export interface MissionDriver extends EligibleDriver {
    /** Rôles de conduite détenus (CHVL, CHVPSP) — l'étape « Équipage » filtre les VPSP dessus. */
    roles: ('CHVL' | 'CHVPSP')[];
}

/**
 * Chauffeurs proposables dans un rapport de mission (étape « Équipage ») : comptes portant
 * CHVL ou CHVPSP, toutes unités locales confondues (population de l'ancien
 * `GET /api/users?drivers=true`), hors comptes bloqués (INACTIF, GUEST). N'expose que
 * l'identité et les rôles de conduite.
 */
export async function listMissionDrivers(): Promise<MissionDriver[]> {
    const res = await db.execute(`
        SELECT u.id, u.name, u.email, GROUP_CONCAT(r.name) AS driving_roles
        FROM "User" u
        JOIN "UserRole" ur ON ur.userId = u.id
        JOIN "Role" r ON ur.roleId = r.id AND r.name IN ('CHVL', 'CHVPSP')
        WHERE u.id NOT IN (
            SELECT ur2.userId FROM "UserRole" ur2
            JOIN "Role" r2 ON ur2.roleId = r2.id
            WHERE r2.name IN ('INACTIF', 'GUEST')
        )
        GROUP BY u.id
        ORDER BY COALESCE(u.name, u.email) COLLATE NOCASE ASC`);

    return res.rows.map(row => ({
        id: row.id as string,
        name: (row.name as string | null) ?? null,
        email: row.email as string,
        roles: String(row.driving_roles ?? '').split(',').filter((r): r is 'CHVL' | 'CHVPSP' => r === 'CHVL' || r === 'CHVPSP'),
    }));
}
