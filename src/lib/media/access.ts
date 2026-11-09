import type { Session } from 'next-auth';
import { db } from '@/lib/db';
import { isQrBlocked, isSuperAdmin } from '@/lib/roles';
import { validateMediaKey } from '@/lib/media/refs';
import { canReadMissionReport, resolveSessionUserId, withAuthorHomeUl, type MissionReportAccessInfo } from '@/lib/missions/access';

type FolderOwner =
    | { kind: 'trip' | 'incident'; ulId: string }
    // Plusieurs rapports peuvent partager un dossier : l'upload réutilise le
    // dossier « <nom de mission>-<date> » s'il existe déjà.
    | { kind: 'mission'; reports: MissionReportAccessInfo[] };

/**
 * Retrouve à quel Trip/IncidentReport/compte rendu de mission appartient
 * une référence de dossier, préfixe R2 (`{type}/{UL}/{dossier}`, voir
 * `src/lib/media/refs.ts`).
 * Retourne null si le dossier n'est référencé par aucun enregistrement connu
 * (ex: brouillon en cours de création, pas encore rattaché à un enregistrement).
 */
export async function resolveFolderOwner(folderId: string): Promise<FolderOwner | null> {
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
    // Rapport DT : rapproché de l'UL de rattachement de l'auteur, comme sur la fiche.
    const enriched = await Promise.all(reports.map(withAuthorHomeUl));
    return enriched.some(report => canReadMissionReport(session, report, userId));
}

/**
 * Vérifie que l'utilisateur courant a le droit d'accéder (lecture ou écriture)
 * à un dossier média (préfixe R2) donné. Refuse par défaut si le dossier n'est rattaché à
 * aucun enregistrement connu (les appelants doivent gérer séparément le cas
 * "création d'un nouveau brouillon", où aucune vérification n'est possible).
 */
export async function canAccessFolder(session: Session, folderId: string): Promise<boolean> {
    const roles = session.user.roles || [];
    // INACTIF bloque toute autorisation, y compris la lecture des photos de son UL.
    if (isQrBlocked(roles)) return false;
    if (isSuperAdmin(roles)) return true;

    const owner = await resolveFolderOwner(folderId);
    if (!owner) return false;

    if (owner.kind === 'mission') {
        // Même règle que GET /api/missions/[id] : qui lit le rapport voit ses photos.
        return canReadAnyMissionReport(session, owner.reports);
    }

    return session.user.ulId === owner.ulId;
}

/**
 * Vérifie l'accès au rapport de mission signé, référencé directement par sa clé
 * (et non via son dossier) : seule sa clé est stockée (`signed_report_drive_id`).
 */
export async function canAccessSignedReport(session: Session, fileId: string): Promise<boolean> {
    const roles = session.user.roles || [];
    if (isQrBlocked(roles)) return false;
    if (isSuperAdmin(roles)) return true;

    const missionRes = await db.execute({
        sql: `SELECT ulId, submitted_by FROM "mission_reports" WHERE signed_report_drive_id = ?`,
        args: [fileId],
    });
    if (missionRes.rows.length === 0) return false;
    return canReadAnyMissionReport(session, missionRes.rows.map(toMissionAccessInfo));
}

/**
 * Accès à un fichier média R2 par sa clé. La clé est d'abord validée (pas de
 * `..`, type connu, forme attendue) ; puis :
 * - rapport de mission signé (`mission-report-photo/…`) : appariement EXACT sur
 *   `mission_reports.signed_report_drive_id` ;
 * - autres types : appariement de la colonne sur les 3 premiers segments de la clé.
 */
export async function canAccessMediaKey(session: Session, key: string): Promise<boolean> {
    const parsed = validateMediaKey(key);
    if (!parsed) return false;
    if (parsed.type === 'mission-report-photo') return canAccessSignedReport(session, key);
    return canAccessFolder(session, parsed.folderRef);
}
