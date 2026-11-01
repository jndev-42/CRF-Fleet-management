import type { Session } from 'next-auth';
import { db } from '@/lib/db';
import { canManageMissionReports, isAdminOrAbove, isSuperAdmin, isReadOnlyManager, isMissionContributor } from '@/lib/roles';

export interface MissionReportAccessInfo {
    ulId: string | null;
    submittedBy: string | null;
    /**
     * Rapport rattaché à une DT (`ulId` NULL) : UL de rattachement de son auteur
     * (`resolveAuthorHomeUlId`), à laquelle il est rapproché pour les
     * gestionnaires de comptes rendus (ADMIN, RESP_MISSION). Absent ou NULL :
     * le rapport DT n'est rapproché d'aucune UL.
     */
    authorHomeUlId?: string | null;
}

/**
 * UL de rattachement d'un auteur : `UserUL.is_home`, à défaut sa première UL.
 * Sert à rapprocher un rapport rattaché à une DT d'une UL — pour l'alerte
 * d'incident comme pour la lecture, la modification et la liste.
 */
export async function resolveAuthorHomeUlId(userId: string | null): Promise<string | null> {
    if (!userId) return null;
    const res = await db.execute({
        sql: `SELECT ulId FROM "UserUL" WHERE userId = ? ORDER BY is_home DESC, ulId LIMIT 1`,
        args: [userId],
    });
    return res.rows.length > 0 ? (res.rows[0].ulId as string) : null;
}

/**
 * UL réelle du rapport : `'default'` (valeur historique « sans UL ») vaut NULL,
 * comme pour l'alerte d'incident (`resolveAlertUlId`).
 */
function reportUlOf(report: MissionReportAccessInfo): string | null {
    return report.ulId && report.ulId !== 'default' ? report.ulId : null;
}

/** Complète `authorHomeUlId` pour un rapport sans UL réelle — rattaché à une DT (inchangé sinon). */
export async function withAuthorHomeUl(report: MissionReportAccessInfo): Promise<MissionReportAccessInfo> {
    if (reportUlOf(report) !== null || report.authorHomeUlId !== undefined) return report;
    return { ...report, authorHomeUlId: await resolveAuthorHomeUlId(report.submittedBy) };
}

/**
 * UL à laquelle un gestionnaire de comptes rendus (ADMIN, RESP_MISSION) rapproche
 * le rapport : son UL, ou pour un rapport DT l'UL de rattachement de l'auteur.
 */
function managerUlOf(report: MissionReportAccessInfo): string | null {
    return reportUlOf(report) ?? report.authorHomeUlId ?? null;
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
 * SUPER_ADMIN : tous. ADMIN / responsable mission : ceux de l'UL active, y compris
 * les rapports DT dont l'auteur est rattaché à cette UL. Responsable lecture seule :
 * ceux de l'UL active, jamais un rapport DT. Auteur : toujours le sien.
 */
export function canReadMissionReport(
    session: Session,
    report: MissionReportAccessInfo,
    userId: string | null,
): boolean {
    const roles = (session.user.roles || ['INACTIF']) as string[];
    if (isSuperAdmin(roles)) return true;
    // Un rapport rattaché à une DT porte `ulId = NULL` : le cadre / président
    // de l'UL active ne le lit pas ; l'ADMIN et le RESP_MISSION, eux, le
    // rapprochent de l'UL de rattachement de l'auteur (`managerUlOf`).
    const reportUl = reportUlOf(report);
    const sameUl = reportUl !== null && reportUl === session.user.ulId;
    if (sameUl && isReadOnlyManager(roles)) return true;
    const managerUl = managerUlOf(report);
    if (managerUl !== null && managerUl === session.user.ulId && canManageMissionReports(roles)) return true;
    // `isMissionContributor`/`isAdminOrAbove` portent le blocage INACTIF.
    return (isMissionContributor(roles) || isAdminOrAbove(roles))
        && userId !== null
        && report.submittedBy === userId;
}

/**
 * Règle de modification d'un compte rendu après envoi — partagée par
 * PATCH /api/missions/[id] et le `can_edit` renvoyé par le GET.
 * SUPER_ADMIN : tous. ADMIN / responsable mission : ceux de l'UL active (rapport
 * DT : UL de rattachement de l'auteur). Auteur : le sien, tant qu'il est encore contributeur ou admin.
 * Le cadre / président (lecture seule) ne modifie rien. INACTIF : jamais
 * (porté par les prédicats de `roles.ts`).
 */
export function canEditMissionReport(
    session: Session,
    report: MissionReportAccessInfo,
    userId: string | null,
): boolean {
    const roles = (session.user.roles || ['INACTIF']) as string[];
    if (isSuperAdmin(roles)) return true;
    // Même rapprochement que la lecture : un rapport DT compte pour l'UL de
    // rattachement de son auteur.
    const managerUl = managerUlOf(report);
    if (managerUl !== null && managerUl === session.user.ulId && canManageMissionReports(roles)) return true;
    return (isMissionContributor(roles) || isAdminOrAbove(roles))
        && userId !== null
        && report.submittedBy === userId;
}
