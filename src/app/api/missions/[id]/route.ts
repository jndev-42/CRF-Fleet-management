import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { EXTERNAL_VEHICLES } from '@/lib/mission-supplies';
import { isAdminOrAbove, isSuperAdmin, isReadOnlyManager, isMissionContributor } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/missions/[id] — Détail d'un compte rendu.
 *  ADMIN : tous. CI/RPAPS : uniquement le leur. */
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

        // Le rapport stocke le `User.id` résolu depuis l'email (cf. POST) ; en dev
        // `session.user.id` peut être un email de repli — sans résolution, l'auteur
        // se verrait refuser son propre rapport.
        let userId = (session.user.id as string | undefined) ?? null;
        if (session.user.email) {
            const userRes = await db.execute({
                sql: `SELECT id FROM "User" WHERE email = ?`,
                args: [session.user.email],
            });
            if (userRes.rows.length > 0) userId = userRes.rows[0].id as string;
        }

        // Access control:
        const roles = (session.user.roles || ['INACTIF']) as string[];
        const isSuper = isSuperAdmin(roles);
        // Un rapport rattaché à une DT porte `ulId = NULL` : il n'est rapproché
        // d'AUCUNE UL, donc ni l'admin ni le cadre de l'UL active ne le lisent —
        // seul son auteur (ou un SUPER_ADMIN) y accède, comme dans la liste.
        const reportUlId = (row.ulId as string | null) ?? null;
        const sameUl = reportUlId !== null && reportUlId === session.user.ulId;
        const isLocalAdmin = isAdminOrAbove(roles) && sameUl;
        const isLocalManager = isReadOnlyManager(roles) && sameUl;
        // L'auteur relit toujours son rapport — c'est ce que « Mes rapports »
        // liste. `isMissionContributor`/`isAdminOrAbove` portent le blocage INACTIF.
        const isSubmitter = (isMissionContributor(roles) || isAdminOrAbove(roles))
            && row.submitted_by === userId;

        if (!isSuper && !isLocalAdmin && !isLocalManager && !isSubmitter) {
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
            drive_folder_id: (row.drive_folder_id as string | null) ?? null,
            signed_report_drive_id: (row.signed_report_drive_id as string | null) ?? null,
            supplies: suppliesByCategory,
            interventions,
        };

        return NextResponse.json(report);
    } catch (error) {
        console.error('Error fetching mission report:', error);
        return NextResponse.json({ error: 'Erreur lors de la récupération du compte rendu' }, { status: 500 });
    }
}

/** DELETE /api/missions/[id] — Suppression (ADMIN seulement).
 *  La suppression en cascade sur mission_report_supplies et
 *  mission_report_interventions est gérée par la DB. */
export async function DELETE(_request: Request, { params }: RouteContext) {
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

        await db.execute({
            sql: `DELETE FROM "mission_reports" WHERE id = ?`,
            args: [id],
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting mission report:', error);
        return NextResponse.json({ error: 'Erreur lors de la suppression du compte rendu' }, { status: 500 });
    }
}
