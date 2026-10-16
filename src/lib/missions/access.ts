import type { Session } from 'next-auth';
import { db } from '@/lib/db';
import { isAdminOrAbove, isSuperAdmin, isReadOnlyManager, isMissionContributor } from '@/lib/roles';

export interface MissionReportAccessInfo {
    ulId: string | null;
    submittedBy: string | null;
}

/**
 * Résout le `User.id` de la session. Les rapports stockent l'id résolu depuis
 * l'email (cf. POST /api/missions) ; en dev `session.user.id` peut être un email
 * de repli — sans résolution, l'auteur se verrait refuser son propre rapport.
 */
export async function resolveSessionUserId(session: Session): Promise<string | null> {
    let userId = (session.user.id as string | undefined) ?? null;
    if (session.user.email) {
        const userRes = await db.execute({
            sql: `SELECT id FROM "User" WHERE email = ?`,
            args: [session.user.email],
        });
        if (userRes.rows.length > 0) userId = userRes.rows[0].id as string;
    }
    return userId;
}

/**
 * Règle de lecture d'un compte rendu de mission — partagée par
 * GET /api/missions/[id] et le proxy Drive (photos, rapport signé).
 * SUPER_ADMIN : tous. ADMIN / responsable lecture seule : ceux de l'UL active.
 * Auteur : toujours le sien.
 */
export function canReadMissionReport(
    session: Session,
    report: MissionReportAccessInfo,
    userId: string | null,
): boolean {
    const roles = (session.user.roles || ['INACTIF']) as string[];
    if (isSuperAdmin(roles)) return true;
    // Un rapport rattaché à une DT porte `ulId = NULL` : il n'est rapproché
    // d'AUCUNE UL, donc ni l'admin ni le cadre de l'UL active ne le lisent —
    // seul son auteur (ou un SUPER_ADMIN) y accède, comme dans la liste.
    const sameUl = report.ulId !== null && report.ulId === session.user.ulId;
    if (sameUl && (isAdminOrAbove(roles) || isReadOnlyManager(roles))) return true;
    // `isMissionContributor`/`isAdminOrAbove` portent le blocage INACTIF.
    return (isMissionContributor(roles) || isAdminOrAbove(roles))
        && userId !== null
        && report.submittedBy === userId;
}
