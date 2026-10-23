import { db } from '@/lib/db';

export interface UlMember {
    id: string;
    name: string | null;
    email: string;
}

/**
 * Comptes actifs rattachés à une unité locale (`UserUL`, rattachement principal ou
 * secondaire) — candidats « Responsable de la désinfection » au retour d'un véhicule
 * (choix produit du 2026-10-23 : la désinfection se fait sur place, on n'expose que
 * les membres de l'UL du véhicule).
 *
 * Exclut les comptes bloqués — INACTIF ou la valeur héritée GUEST — qu'ils le soient
 * globalement (`UserRole`) ou dans cette UL (`UserUL.roles`). Une UL absente ou
 * sentinelle (`'default'`) ne donne aucun membre. N'expose que l'identité.
 */
export async function listActiveUlMembers(ulId: unknown): Promise<UlMember[]> {
    if (!ulId || ulId === 'default') return [];

    const res = await db.execute({
        sql: `SELECT DISTINCT u.id, u.name, u.email
              FROM "User" u
              JOIN "UserUL" uu ON uu.userId = u.id AND uu.ulId = ?
              WHERE ',' || COALESCE(uu.roles, '') || ',' NOT LIKE '%,INACTIF,%'
                AND ',' || COALESCE(uu.roles, '') || ',' NOT LIKE '%,GUEST,%'
                AND u.id NOT IN (
                    SELECT ur.userId FROM "UserRole" ur
                    JOIN "Role" r ON ur.roleId = r.id
                    WHERE r.name IN ('INACTIF', 'GUEST')
                )
              ORDER BY COALESCE(u.name, u.email) COLLATE NOCASE ASC`,
        args: [String(ulId)],
    });

    return res.rows.map(row => ({
        id: row.id as string,
        name: (row.name as string | null) ?? null,
        email: row.email as string,
    }));
}
