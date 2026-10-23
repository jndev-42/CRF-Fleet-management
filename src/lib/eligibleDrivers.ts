import { db } from '@/lib/db';

export interface EligibleDriver {
    id: string;
    name: string | null;
    email: string;
}

/** Rôle de conduite requis pour un type de véhicule : CHVPSP pour un VPSP, CHVL sinon. */
export function driverRoleForVehicleType(vehicleType: unknown): 'CHVL' | 'CHVPSP' {
    return String(vehicleType || '').toUpperCase().includes('VPSP') ? 'CHVPSP' : 'CHVL';
}

/**
 * 2èmes conducteurs proposables à l'emprunt d'un véhicule : chauffeurs habilités au type
 * du véhicule, toutes unités locales confondues, hors comptes INACTIF et hors
 * `excludeUserId` (l'emprunteur). N'expose que l'identité nécessaire au choix.
 */
export async function listEligibleDrivers(vehicleType: unknown, excludeUserId: string): Promise<EligibleDriver[]> {
    const res = await db.execute({
        sql: `SELECT u.id, u.name, u.email
              FROM "User" u
              WHERE u.id IN (
                  SELECT ur.userId FROM "UserRole" ur
                  JOIN "Role" r ON ur.roleId = r.id
                  WHERE r.name = ?
              )
              AND u.id NOT IN (
                  SELECT ur.userId FROM "UserRole" ur
                  JOIN "Role" r ON ur.roleId = r.id
                  WHERE r.name = 'INACTIF'
              )
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
