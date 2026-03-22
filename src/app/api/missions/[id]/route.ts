import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/missions/[id] — Détail d'un compte rendu.
 *  CHVL/CHVPSP : uniquement le leur. RESPO/ADMIN : tous. */
export async function GET(_request: Request, { params }: RouteContext) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
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
                    d.email  AS driver_email
                FROM "mission_reports" mr
                LEFT JOIN "User"    u ON u.id = mr.submitted_by
                LEFT JOIN "Vehicle" v ON v.id = mr.vehicle_id
                LEFT JOIN "User"    d ON d.id = mr.driver_id
                WHERE mr.id = ?
            `,
            args: [id],
        });

        if (reportResult.rows.length === 0) {
            return NextResponse.json({ error: 'Compte rendu non trouvé' }, { status: 404 });
        }

        const row = reportResult.rows[0];

        // Access control: only ADMIN and CI/RPAPS can access missions
        const roles = (session.user.roles || ['INACTIF']) as string[];
        const isAllowed = roles.includes('ADMIN') || roles.includes('CI/RPAPS');
        if (!isAllowed) {
            return NextResponse.json({ error: 'Interdit' }, { status: 403 });
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
            vehicle_name: row.vehicle_name,
            vehicle_type: row.vehicle_type,
            driver_id: row.driver_id,
            driver_name: row.driver_name,
            driver_email: row.driver_email,
            victim_count: Number(row.victim_count),
            ul18_present: row.ul18_present !== null ? Boolean(Number(row.ul18_present)) : null,
            team_dynamics: row.team_dynamics,
            all_found_place: row.all_found_place !== null ? Boolean(Number(row.all_found_place)) : null,
            member_difficulties: row.member_difficulties !== null ? Boolean(Number(row.member_difficulties)) : null,
            free_comment: row.free_comment,
            had_acr: Boolean(Number(row.had_acr)),
            had_hemorrhage: Boolean(Number(row.had_hemorrhage)),
            had_complex_care: Boolean(Number(row.had_complex_care)),
            needs_followup: Boolean(Number(row.needs_followup)),
            drive_folder_id: (row.drive_folder_id as string | null) ?? null,
            supplies: suppliesByCategory,
        };

        return NextResponse.json(report);
    } catch (error) {
        console.error('Error fetching mission report:', error);
        return NextResponse.json({ error: 'Erreur lors de la récupération du compte rendu' }, { status: 500 });
    }
}

/** DELETE /api/missions/[id] — Suppression (ADMIN seulement).
 *  La suppression en cascade sur mission_report_supplies est gérée par la DB. */
export async function DELETE(_request: Request, { params }: RouteContext) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const roles = (session.user.roles || ['INACTIF']) as string[];
        if (!roles.includes('ADMIN')) {
            return NextResponse.json({ error: 'Interdit' }, { status: 403 });
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
