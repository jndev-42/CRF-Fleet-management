import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';

const supplySchema = z.object({
    category: z.enum(['SAC_PRIMAIRE', 'BRULURE', 'HEMORRHAGIE', 'KIT_DSA', 'HYGIENE', 'OXYGENE']),
    item_name: z.string().min(1),
    quantity_used: z.number().int().min(0),
});

const createMissionReportSchema = z.object({
    mission_type: z.enum(['RESEAU', 'DPS', 'PAPS']),
    mission_name: z.string().min(1, 'Le nom de la mission est requis'),
    mission_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Format de date invalide (YYYY-MM-DD)' }),
    location: z.string().min(1, 'Le lieu est requis'),
    volunteers: z.string(),
    pegass_ok: z.boolean(),
    vehicle_id: z.string().nullable().optional(),
    driver_id: z.string().nullable().optional(),
    victim_count: z.number().int().min(0),
    ul18_present: z.boolean().nullable().optional(),
    team_dynamics: z.enum(['BIEN', 'PLUTOT_BIEN', 'PEUT_MIEUX', 'SUJET']).nullable().optional(),
    all_found_place: z.boolean().nullable().optional(),
    member_difficulties: z.boolean().nullable().optional(),
    free_comment: z.string().nullable().optional(),
    had_acr: z.boolean(),
    had_hemorrhage: z.boolean(),
    had_complex_care: z.boolean(),
    needs_followup: z.boolean(),
    supplies: z.array(supplySchema),
    drive_folder_id: z.string().nullable().optional(),
}).superRefine((data, ctx) => {
    if (!data.pegass_ok && !data.volunteers.trim()) {
        ctx.addIssue({
            code: 'custom',
            path: ['volunteers'],
            message: 'Requis si inscriptions Pegass non à jour',
        });
    }
});

const ALLOWED_ROLES = ['ADMIN', 'CI/RPAPS'];

/** GET /api/missions — Liste paginée des comptes rendus.
 *  RESPO/ADMIN : tous. CHVL/CHVPSP : les siens uniquement.
 *  Query params: page, limit, type */
export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const roles = (session.user.roles || ['INACTIF']) as string[];
        const canView = ALLOWED_ROLES.some(r => roles.includes(r));
        if (!canView) {
            return NextResponse.json({ error: 'Interdit' }, { status: 403 });
        }

        const isAdmin = roles.includes('ADMIN');
        const userId = session.user.id;

        const { searchParams } = new URL(request.url);
        const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
        const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
        const typeFilter = searchParams.get('type');
        const offset = (page - 1) * limit;

        const conditions: string[] = [];
        const args: (string | number | null)[] = [];

        if (!isAdmin) {
            conditions.push('mr.submitted_by = ?');
            args.push(userId ?? null);
        }
        if (typeFilter) {
            conditions.push('mr.mission_type = ?');
            args.push(typeFilter);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const countResult = await db.execute({
            sql: `SELECT COUNT(*) as total FROM "mission_reports" mr ${where}`,
            args,
        });
        const total = Number(countResult.rows[0].total);

        const listResult = await db.execute({
            sql: `
                SELECT
                    mr.id,
                    mr.mission_type,
                    mr.mission_name,
                    mr.mission_date,
                    mr.location,
                    mr.victim_count,
                    mr.ul18_present,
                    mr.had_acr,
                    mr.had_hemorrhage,
                    mr.had_complex_care,
                    mr.needs_followup,
                    mr.submitted_at,
                    u.name   AS submitter_name,
                    u.email  AS submitter_email,
                    v.name   AS vehicle_name
                FROM "mission_reports" mr
                LEFT JOIN "User"    u ON u.id = mr.submitted_by
                LEFT JOIN "Vehicle" v ON v.id = mr.vehicle_id
                ${where}
                ORDER BY mr.mission_date DESC, mr.submitted_at DESC
                LIMIT ? OFFSET ?
            `,
            args: [...args, limit, offset],
        });

        const reports = listResult.rows.map(row => ({
            id: row.id,
            mission_type: row.mission_type,
            mission_name: row.mission_name,
            mission_date: row.mission_date,
            location: row.location,
            victim_count: Number(row.victim_count),
            ul18_present: row.ul18_present !== null ? Boolean(Number(row.ul18_present)) : null,
            had_acr: Boolean(Number(row.had_acr)),
            had_hemorrhage: Boolean(Number(row.had_hemorrhage)),
            had_complex_care: Boolean(Number(row.had_complex_care)),
            needs_followup: Boolean(Number(row.needs_followup)),
            submitted_at: row.submitted_at,
            submitter_name: row.submitter_name,
            submitter_email: row.submitter_email,
            vehicle_name: row.vehicle_name,
        }));

        return NextResponse.json({ reports, total, page, limit });
    } catch (error) {
        console.error('Error fetching mission reports:', error);
        return NextResponse.json({ error: 'Erreur lors de la récupération des comptes rendus' }, { status: 500 });
    }
}

/** POST /api/missions — Créer un compte rendu de mission.
 *  Accessible aux rôles CHVL, CHVPSP, RESPO, ADMIN. */
export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const roles = (session.user.roles || ['INACTIF']) as string[];
        const canSubmit = ALLOWED_ROLES.some(r => roles.includes(r));
        if (!canSubmit) {
            return NextResponse.json({ error: 'Interdit' }, { status: 403 });
        }

        const body = await request.json();

        let data: z.infer<typeof createMissionReportSchema>;
        try {
            data = createMissionReportSchema.parse(body);
        } catch (zodErr) {
            if (zodErr instanceof z.ZodError) {
                return NextResponse.json({ error: 'Données invalides', details: zodErr.issues }, { status: 400 });
            }
            throw zodErr;
        }

        // Resolve the actual DB User.id from email — session.user.id may be an email fallback in dev
        const userEmail = session.user.email;
        if (!userEmail) {
            return NextResponse.json({ error: 'Session invalide — veuillez vous reconnecter.' }, { status: 401 });
        }
        const userRes = await db.execute({
            sql: `SELECT id FROM "User" WHERE email = ?`,
            args: [userEmail],
        });
        if (userRes.rows.length === 0) {
            return NextResponse.json({ error: 'Utilisateur introuvable — veuillez vous reconnecter.' }, { status: 401 });
        }
        const submittedBy = userRes.rows[0].id as string;

        // Normalize driver_id: frontend may pass session.user.id which is email in dev — map to real UUID
        const rawDriverId = data.driver_id ?? null;
        const driverId = rawDriverId === session.user.id ? submittedBy : rawDriverId;

        const reportId = crypto.randomUUID();
        const submittedAt = new Date().toISOString();

        const tx = await db.transaction('write');
        try {
            await tx.execute({
                sql: `INSERT INTO "mission_reports" (
                    id, submitted_by, submitted_at, mission_type, mission_name, mission_date,
                    location, volunteers, pegass_ok, vehicle_id, driver_id, victim_count,
                    ul18_present, team_dynamics, all_found_place, member_difficulties, free_comment,
                    had_acr, had_hemorrhage, had_complex_care, needs_followup, drive_folder_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    reportId,
                    submittedBy ?? null,
                    submittedAt,
                    data.mission_type,
                    data.mission_name,
                    data.mission_date,
                    data.location,
                    data.volunteers,
                    data.pegass_ok ? 1 : 0,
                    data.vehicle_id ?? null,
                    driverId,
                    data.victim_count,
                    data.ul18_present !== undefined && data.ul18_present !== null ? (data.ul18_present ? 1 : 0) : null,
                    data.team_dynamics ?? null,
                    data.all_found_place !== undefined && data.all_found_place !== null ? (data.all_found_place ? 1 : 0) : null,
                    data.member_difficulties !== undefined && data.member_difficulties !== null ? (data.member_difficulties ? 1 : 0) : null,
                    data.free_comment ?? null,
                    data.had_acr ? 1 : 0,
                    data.had_hemorrhage ? 1 : 0,
                    data.had_complex_care ? 1 : 0,
                    data.needs_followup ? 1 : 0,
                    data.drive_folder_id ?? null,
                ],
            });

            // Insert only supplies with quantity_used > 0
            for (const supply of data.supplies) {
                if (supply.quantity_used > 0) {
                    await tx.execute({
                        sql: `INSERT INTO "mission_report_supplies" (id, report_id, category, item_name, quantity_used)
                              VALUES (?, ?, ?, ?, ?)`,
                        args: [crypto.randomUUID(), reportId, supply.category, supply.item_name, supply.quantity_used],
                    });
                }
            }

            await tx.commit();
            return NextResponse.json({ success: true, id: reportId }, { status: 201 });
        } catch (e) {
            await tx.rollback();
            throw e;
        }
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Données invalides', details: error.issues }, { status: 400 });
        }
        console.error('Error creating mission report:', error);
        return NextResponse.json({ error: 'Erreur lors de la création du compte rendu' }, { status: 500 });
    }
}
