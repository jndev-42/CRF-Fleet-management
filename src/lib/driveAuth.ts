import type { Session } from 'next-auth';
import { db } from '@/lib/db';
import { isSuperAdmin, isExpenseManager, isTresorier } from '@/lib/roles';
import { canReadMissionReport, resolveSessionUserId, type MissionReportAccessInfo } from '@/lib/missions/access';

type DriveFolderOwner =
    | { kind: 'trip' | 'incident'; ulId: string }
    | { kind: 'expense'; ulId: string; userId: string; status: string }
    // Plusieurs rapports peuvent partager un dossier : l'upload réutilise le
    // dossier « <nom de mission>-<date> » s'il existe déjà.
    | { kind: 'mission'; reports: MissionReportAccessInfo[] };

/**
 * Retrouve à quel Trip/IncidentReport/ExpenseReport/compte rendu de mission appartient un driveFolderId.
 * Retourne null si le dossier n'est référencé par aucun enregistrement connu
 * (ex: brouillon en cours de création, pas encore rattaché à un enregistrement).
 */
export async function resolveDriveFolderOwner(folderId: string): Promise<DriveFolderOwner | null> {
    const tripRes = await db.execute({
        sql: `SELECT v.ulId as ulId FROM Trip t JOIN Vehicle v ON v.id = t.vehicleId WHERE t.driveFolderId = ?`,
        args: [folderId],
    });
    if (tripRes.rows[0]?.ulId) {
        return { kind: 'trip', ulId: tripRes.rows[0].ulId as string };
    }

    const incidentRes = await db.execute({
        sql: `SELECT v.ulId as ulId FROM "IncidentReport" ir JOIN Vehicle v ON v.id = ir.vehicleId WHERE ir.driveFolderId = ?`,
        args: [folderId],
    });
    if (incidentRes.rows[0]?.ulId) {
        return { kind: 'incident', ulId: incidentRes.rows[0].ulId as string };
    }

    const expenseRes = await db.execute({
        sql: `SELECT ulId, userId, status FROM "ExpenseReport" WHERE driveFolderId = ?`,
        args: [folderId],
    });
    const expenseRow = expenseRes.rows[0];
    if (expenseRow) {
        return {
            kind: 'expense',
            ulId: expenseRow.ulId as string,
            userId: expenseRow.userId as string,
            status: expenseRow.status as string,
        };
    }

    const missionRes = await db.execute({
        sql: `SELECT ulId, submitted_by FROM "mission_reports" WHERE drive_folder_id = ?`,
        args: [folderId],
    });
    if (missionRes.rows.length > 0) {
        return { kind: 'mission', reports: missionRes.rows.map(toMissionAccessInfo) };
    }

    return null;
}

function toMissionAccessInfo(row: Record<string, unknown>): MissionReportAccessInfo {
    return {
        ulId: (row.ulId as string | null) ?? null,
        submittedBy: (row.submitted_by as string | null) ?? null,
    };
}

async function canReadAnyMissionReport(session: Session, reports: MissionReportAccessInfo[]): Promise<boolean> {
    const userId = await resolveSessionUserId(session);
    return reports.some(report => canReadMissionReport(session, report, userId));
}

/**
 * Vérifie que l'utilisateur courant a le droit d'accéder (lecture ou écriture)
 * à un driveFolderId donné. Refuse par défaut si le dossier n'est rattaché à
 * aucun enregistrement connu (les appelants doivent gérer séparément le cas
 * "création d'un nouveau brouillon", où aucune vérification n'est possible).
 */
export async function canAccessDriveFolder(session: Session, folderId: string): Promise<boolean> {
    const roles = session.user.roles || [];
    if (isSuperAdmin(roles)) return true;

    const owner = await resolveDriveFolderOwner(folderId);
    if (!owner) return false;

    if (owner.kind === 'mission') {
        // Même règle que GET /api/missions/[id] : qui lit le rapport voit ses photos.
        return canReadAnyMissionReport(session, owner.reports);
    }

    if (owner.kind === 'expense') {
        // Note de frais : même règle que expenses/[id]/route.ts (propriétaire, manager, ou trésorier en attente de paiement)
        const isManager = isExpenseManager(roles);
        const isOwner = session.user.id === owner.userId;
        const isTresorierPending = isTresorier(roles) && owner.status === 'en_attente_paiement';
        return isManager || isOwner || isTresorierPending;
    }

    return session.user.ulId === owner.ulId;
}

/**
 * Vérifie l'accès à un fichier Drive référencé directement par son id (et non
 * via son dossier). Cas du rapport de mission signé : seul son `fileId` est
 * stocké (`signed_report_drive_id`), son dossier parent ne l'est pas.
 */
export async function canAccessDriveFile(session: Session, fileId: string): Promise<boolean> {
    const roles = session.user.roles || [];
    if (isSuperAdmin(roles)) return true;

    const missionRes = await db.execute({
        sql: `SELECT ulId, submitted_by FROM "mission_reports" WHERE signed_report_drive_id = ?`,
        args: [fileId],
    });
    if (missionRes.rows.length === 0) return false;
    return canReadAnyMissionReport(session, missionRes.rows.map(toMissionAccessInfo));
}
