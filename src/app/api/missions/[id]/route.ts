import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { EXTERNAL_VEHICLES } from '@/lib/mission-supplies';
import { isAdminOrAbove } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { withAudit } from '@/lib/audit/log';
import { canEditMissionReport, canReadMissionReport, resolveSessionUserId, withAuthorHomeUl } from '@/lib/missions/access';
import { updateMissionReportSchema, type UpdateMissionReportInput } from '@/lib/missions/create-mission-report';
import { updateMissionReport, type MissionReportChange } from '@/lib/missions/update-mission-report';
import { newlyRaisedFlags, notifyMissionIncident } from '@/lib/missions/incident-alert';

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/missions/[id] — Détail d'un compte rendu.
 *  Lecture : `canReadMissionReport`. Renvoie aussi `can_edit` (`canEditMissionReport`)
 *  et `edits` — l'historique des modifications, du plus récent au plus ancien. */
export async function GET(_request: Request, { params }: RouteContext) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        const { id } = await params;

        const reportResult = await db.execute({
            sql: `
                SELECT
                    mr.*,
                    u.name   AS submitter_name,
                    u.email  AS submitter_email,
                    v.name   AS vehicle_name,
                    v.type   AS vehicle_type,
                    d.name   AS driver_name,
                    d.email  AS driver_email,
                    ul.name  AS ul_name
                FROM "mission_reports" mr
                LEFT JOIN "User"    u ON u.id = mr.submitted_by
                LEFT JOIN "Vehicle" v ON v.id = mr.vehicle_id
                LEFT JOIN "User"    d ON d.id = mr.driver_id
                LEFT JOIN "UniteLocale" ul ON ul.id = mr.ulId
                WHERE mr.id = ?
            `,
            args: [id],
        });

        if (reportResult.rows.length === 0) {
            return NextResponse.json({ error: 'Compte rendu non trouvé' }, { status: 404 });
        }

        const row = reportResult.rows[0];

        const userId = await resolveSessionUserId(session);
        const accessInfo = await withAuthorHomeUl({ ulId: (row.ulId as string | null) ?? null, submittedBy: (row.submitted_by as string | null) ?? null });
        const canRead = canReadMissionReport(session, accessInfo, userId);
        if (!canRead) {
            return forbiddenResponse();
        }

        // Fetch supplies
        const suppliesResult = await db.execute({
            sql: `SELECT id, category, item_name, quantity_used FROM "mission_report_supplies" WHERE report_id = ? ORDER BY category, item_name`,
            args: [id],
        });

        // Group supplies by category
        const suppliesByCategory: Record<string, Array<{ id: string; item_name: string; quantity_used: number }>> = {};
        for (const s of suppliesResult.rows) {
            const cat = s.category as string;
            if (!suppliesByCategory[cat]) suppliesByCategory[cat] = [];
            suppliesByCategory[cat].push({
                id: s.id as string,
                item_name: s.item_name as string,
                quantity_used: Number(s.quantity_used),
            });
        }

        // Fetch the intervention breakdown (may be empty for pre-migration reports)
        const interventionsResult = await db.execute({
            sql: `SELECT breakdown, category, quantity FROM "mission_report_interventions" WHERE report_id = ? ORDER BY breakdown, category`,
            args: [id],
        });

        // Group by breakdown — only categories actually stored (sparse) appear.
        const interventions: { mode: Record<string, number>; nature: Record<string, number> } = { mode: {}, nature: {} };
        for (const i of interventionsResult.rows) {
            const bucket = (i.breakdown as string) === 'NATURE' ? interventions.nature : interventions.mode;
            bucket[i.category as string] = Number(i.quantity);
        }

        // Historique des modifications — figé à l'écriture, jamais recalculé.
        const editsResult = await db.execute({
            // Le nom figé à l'écriture prime : l'entrée reste lisible si le compte
            // de l'éditeur est supprimé ou renommé.
            sql: `SELECT e.id, e.edited_at, e.changes,
                         COALESCE(e.edited_by_name, u.name, u.email) AS editor_name
                  FROM "mission_report_edits" e
                  LEFT JOIN "User" u ON u.id = e.edited_by
                  WHERE e.report_id = ?
                  ORDER BY e.edited_at DESC, e.rowid DESC`,
            args: [id],
        });
        const edits = editsResult.rows.map(e => {
            let changes: MissionReportChange[] = [];
            try {
                const parsed: unknown = JSON.parse(e.changes as string);
                if (Array.isArray(parsed)) changes = parsed as MissionReportChange[];
            } catch {
                // Entrée illisible : affichée sans détail plutôt que de casser la fiche.
            }
            return {
                id: e.id as string,
                edited_at: e.edited_at as string,
                editor_name: (e.editor_name as string | null) || 'Utilisateur supprimé',
                changes,
            };
        });

        const vehicleId = row.vehicle_id as string | null;
        const vehicleName = (row.vehicle_name as string | null) || (vehicleId ? EXTERNAL_VEHICLES[vehicleId]?.name : null);
        const vehicleType = (row.vehicle_type as string | null) || (vehicleId ? EXTERNAL_VEHICLES[vehicleId]?.type : null);

        const report = {
            id: row.id,
            submitted_by: row.submitted_by,
            submitted_at: row.submitted_at,
            submitter_name: row.submitter_name,
            submitter_email: row.submitter_email,
            mission_type: row.mission_type,
            mission_name: row.mission_name,
            mission_date: row.mission_date,
            location: row.location,
            volunteers: row.volunteers,
            pegass_ok: Boolean(Number(row.pegass_ok)),
            vehicle_id: row.vehicle_id,
            vehicle_name: vehicleName,
            vehicle_type: vehicleType,
            driver_id: row.driver_id,
            driver_name: row.driver_name,
            driver_email: row.driver_email,
            victim_count: Number(row.victim_count),
            presence_ul: row.presence_ul !== null ? Boolean(Number(row.presence_ul)) : null,
            ulName: (row.ul_name as string | null) ?? null,
            dtCode: (row.dt_code as string | null) ?? null,
            team_dynamics: row.team_dynamics,
            all_found_place: row.all_found_place !== null ? Boolean(Number(row.all_found_place)) : null,
            member_difficulties: row.member_difficulties !== null ? Boolean(Number(row.member_difficulties)) : null,
            free_comment: row.free_comment,
            mission_comment: row.mission_comment,
            had_acr: Boolean(Number(row.had_acr)),
            had_hemorrhage: Boolean(Number(row.had_hemorrhage)),
            had_complex_care: Boolean(Number(row.had_complex_care)),
            needs_followup: Boolean(Number(row.needs_followup)),
            volunteer_accident: Boolean(Number(row.volunteer_accident ?? 0)),
            volunteer_accident_details: (row.volunteer_accident_details as string | null) ?? null,
            drive_folder_id: (row.drive_folder_id as string | null) ?? null,
            signed_report_drive_id: (row.signed_report_drive_id as string | null) ?? null,
            supplies: suppliesByCategory,
            interventions,
            // Même condition que le PATCH, qui refuse une session sans utilisateur résolu.
            can_edit: userId !== null && canEditMissionReport(session, accessInfo, userId),
            edits,
        };

        return NextResponse.json(report);
    } catch (error) {
        console.error('Error fetching mission report:', error);
        return NextResponse.json({ error: 'Erreur lors de la récupération du compte rendu' }, { status: 500 });
    }
}

/** PATCH /api/missions/[id] — Modification d'un compte rendu après envoi.
 *  Autorisé par `canEditMissionReport` (SUPER_ADMIN ; ADMIN / RESP_MISSION de l'UL
 *  active ; auteur encore contributeur/admin). Mêmes règles Zod qu'à la création,
 *  sans rattachement, photos ni rapport signé (ignorés s'ils sont envoyés).
 *  Chaque enregistrement qui change au moins un champ est journalisé dans
 *  `mission_report_edits` ; une case d'incident qui passe de faux à vrai alerte
 *  les responsables mission. */
async function patchHandler(request: Request, { params }: RouteContext) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        const { id } = await params;

        const existing = await db.execute({
            sql: `SELECT id, ulId, dt_code, submitted_by, mission_name, mission_type, signed_report_drive_id FROM "mission_reports" WHERE id = ?`,
            args: [id],
        });
        if (existing.rows.length === 0) {
            return NextResponse.json({ error: 'Compte rendu non trouvé' }, { status: 404 });
        }
        const row = existing.rows[0];
        const accessInfo = await withAuthorHomeUl({ ulId: (row.ulId as string | null) ?? null, submittedBy: (row.submitted_by as string | null) ?? null });

        const userId = await resolveSessionUserId(session);
        if (!userId || !canEditMissionReport(session, accessInfo, userId)) {
            return forbiddenResponse();
        }

        let data: UpdateMissionReportInput;
        try {
            data = updateMissionReportSchema.parse(await request.json());
        } catch (parseErr) {
            if (parseErr instanceof z.ZodError) {
                return NextResponse.json({ error: 'Données invalides', details: parseErr.issues }, { status: 400 });
            }
            if (parseErr instanceof SyntaxError) {
                return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
            }
            throw parseErr;
        }

        // DPS et PAPS exigent un rapport signé, qui ne se dépose pas en modification :
        // un rapport sans rapport signé ne peut pas PASSER en DPS/PAPS. Un rapport déjà
        // DPS/PAPS sans rapport signé (antérieur à l'obligation) reste modifiable.
        const needsSignedReport = (t: unknown) => t === 'DPS' || t === 'PAPS';
        if (needsSignedReport(data.mission_type) && !needsSignedReport(row.mission_type) && !row.signed_report_drive_id) {
            return NextResponse.json({
                error: 'Ce compte rendu n\'a pas de rapport signé : il ne peut pas passer en DPS ou PAPS, qui en exigent un.',
            }, { status: 400 });
        }

        const result = await updateMissionReport(id, data, userId, session.user.id);
        if (!result.ok) {
            return NextResponse.json({ error: result.error }, { status: result.status });
        }

        if (result.changed) {
            // Seules les cases qui PASSENT à vrai déclenchent une alerte ; un échec
            // d'envoi ne fait jamais échouer l'enregistrement.
            await notifyMissionIncident({
                id,
                missionName: result.after.mission_name,
                ulId: accessInfo.ulId,
                dtCode: (row.dt_code as string | null) ?? null,
                submittedBy: accessInfo.submittedBy,
            }, newlyRaisedFlags(result.before, result.after), userId);
        }

        return NextResponse.json({ success: true, changed: result.changed, changes: result.changes });
    } catch (error) {
        console.error('Error updating mission report:', error);
        return NextResponse.json({ error: 'Erreur lors de la modification du compte rendu' }, { status: 500 });
    }
}

export const PATCH = withAudit(patchHandler, { action: "Modification d'un rapport de mission", entityType: 'missionReport' });

/** DELETE /api/missions/[id] — Suppression (ADMIN seulement).
 *  La suppression en cascade sur mission_report_supplies et
 *  mission_report_interventions est gérée par la DB. */
async function deleteHandler(_request: Request, { params }: RouteContext) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        const roles = (session.user.roles || ['INACTIF']) as string[];
        if (!isAdminOrAbove(roles)) {
            return forbiddenResponse();
        }

        const { id } = await params;

        const existing = await db.execute({
            sql: `SELECT id FROM "mission_reports" WHERE id = ?`,
            args: [id],
        });

        if (existing.rows.length === 0) {
            return NextResponse.json({ error: 'Compte rendu non trouvé' }, { status: 404 });
        }

        // Les clés étrangères ne sont pas activées sur la connexion : le
        // `ON DELETE CASCADE` de `mission_report_edits` ne s'exécute jamais.
        // L'historique est donc supprimé explicitement, dans la même transaction.
        await db.batch([
            { sql: `DELETE FROM "mission_report_edits" WHERE report_id = ?`, args: [id] },
            { sql: `DELETE FROM "mission_reports" WHERE id = ?`, args: [id] },
        ], 'write');

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting mission report:', error);
        return NextResponse.json({ error: 'Erreur lors de la suppression du compte rendu' }, { status: 500 });
    }
}

export const DELETE = withAudit(deleteHandler, { action: "Suppression d'un rapport de mission", entityType: 'missionReport' });
