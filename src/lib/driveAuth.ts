import type { Session } from 'next-auth';
import { db } from '@/lib/db';
import { isSuperAdmin, ROLES } from '@/lib/roles';

type DriveFolderOwner =
    | { kind: 'trip' | 'incident'; ulId: string }
    | { kind: 'expense'; ulId: string; userId: string; status: string };

/**
 * Retrouve à quel Trip/IncidentReport/ExpenseReport appartient un driveFolderId.
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

    return null;
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

    if (owner.kind === 'expense') {
        // Note de frais : même règle que expenses/[id]/route.ts (propriétaire, manager, ou trésorier en attente de paiement)
        const isManager = roles.includes(ROLES.SUPER_ADMIN) || roles.includes(ROLES.PRESIDENT);
        const isOwner = session.user.id === owner.userId;
        const isTresorierPending = roles.includes(ROLES.TRESORIER) && owner.status === 'en_attente_paiement';
        return isManager || isOwner || isTresorierPending;
    }

    return session.user.ulId === owner.ulId;
}
