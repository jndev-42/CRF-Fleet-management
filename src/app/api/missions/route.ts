import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { EXTERNAL_VEHICLES } from '@/lib/mission-supplies';
import { isAdminOrAbove, isReadOnlyManager } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import {
    createMissionReportSchema,
    insertMissionReport,
    type CreateMissionReportInput,
} from '@/lib/missions/create-mission-report';

const ALLOWED_ROLES = ['ADMIN', 'CI/RPAPS'];

/** GET /api/missions — Liste paginée des comptes rendus.
 *  `scope=mine` (défaut) : tous les rapports du soumetteur, toutes UL/DT confondues.
 *  `scope=all` : les rapports de l'UL ACTIVE, réservé aux cadres/présidents/admins.
 *  Query params: page, limit, type, scope */
export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        const roles = (session.user.roles || ['INACTIF']) as string[];
        const canView = ALLOWED_ROLES.some(r => roles.includes(r)) || isAdminOrAbove(roles) || isReadOnlyManager(roles);
        if (!canView) {
            return forbiddenResponse();
        }

        const { searchParams } = new URL(request.url);
        const scope = searchParams.get('scope') === 'all' ? 'all' : 'mine';

        const isManager = isAdminOrAbove(roles) || isReadOnlyManager(roles);
        if (scope === 'all' && !isManager) {
            return forbiddenResponse();
        }

        const ulId = session.user.ulId as string | undefined;
        // « Tous les rapports » est cadré par l'UL active : sans UL active, il n'y a
        // aucun périmètre à afficher. « Mes rapports » n'en dépend pas.
        if (scope === 'all' && (!ulId || ulId === 'default')) {
            return NextResponse.json({ reports: [], total: 0, page: 1, limit: 20, totalPages: 0 });
        }

        // Le rapport stocke le `User.id` résolu depuis l'email (cf. POST) ; en dev
        // `session.user.id` peut être un email de repli — sans résolution,
        // « Mes rapports » reviendrait vide.
        let userId = (session.user.id as string | undefined) ?? null;
        if (session.user.email) {
            const userRes = await db.execute({
                sql: `SELECT id FROM "User" WHERE email = ?`,
                args: [session.user.email],
            });
            if (userRes.rows.length > 0) userId = userRes.rows[0].id as string;
        }

        const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
        const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
        const typeFilter = searchParams.get('type');
        const offset = (page - 1) * limit;

        const conditions: string[] = [];
        const args: (string | number | null)[] = [];

        if (scope === 'all') {
            // Un rapport rattaché à une DT (ulId NULL) n'est jamais rapproché d'une
            // UL : il reste visible uniquement via « Mes rapports » de son auteur.
            conditions.push('mr.ulId = ?');
            args.push(ulId ?? null);
        } else {
            conditions.push('mr.submitted_by = ?');
            args.push(userId);
        }

        if (typeFilter) {
            conditions.push('mr.mission_type = ?');
            args.push(typeFilter);
        }

        const where = `WHERE ${conditions.join(' AND ')}`;

        const countResult = await db.execute({
            sql: `SELECT COUNT(*) as total FROM "mission_reports" mr LEFT JOIN "Vehicle" v ON v.id = mr.vehicle_id ${where}`,
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
                    mr.presence_ul,
                    mr.had_acr,
                    mr.had_hemorrhage,
                    mr.had_complex_care,
                    mr.needs_followup,
                    mr.submitted_at,
                    mr.dt_code,
                    u.name   AS submitter_name,
                    u.email  AS submitter_email,
                    mr.vehicle_id,
                    v.name   AS vehicle_name,
                    ul.name  AS ul_name
                FROM "mission_reports" mr
                LEFT JOIN "User"    u ON u.id = mr.submitted_by
                LEFT JOIN "Vehicle" v ON v.id = mr.vehicle_id
                LEFT JOIN "UniteLocale" ul ON ul.id = mr.ulId
                ${where}
                ORDER BY mr.mission_date DESC, mr.submitted_at DESC
                LIMIT ? OFFSET ?
            `,
            args: [...args, limit, offset],
        });

        const reports = listResult.rows.map(row => {
            const vehicleId = row.vehicle_id as string | null;
            const vehicleName = (row.vehicle_name as string | null) || (vehicleId ? EXTERNAL_VEHICLES[vehicleId]?.name : null);

            return {
                id: row.id,
                mission_type: row.mission_type,
                mission_name: row.mission_name,
                mission_date: row.mission_date,
                location: row.location,
                victim_count: Number(row.victim_count),
                presence_ul: row.presence_ul !== null ? Boolean(Number(row.presence_ul)) : null,
                had_acr: Boolean(Number(row.had_acr)),
                had_hemorrhage: Boolean(Number(row.had_hemorrhage)),
                had_complex_care: Boolean(Number(row.had_complex_care)),
                needs_followup: Boolean(Number(row.needs_followup)),
                submitted_at: row.submitted_at,
                submitter_name: row.submitter_name,
                submitter_email: row.submitter_email,
                vehicle_name: vehicleName,
                ul_name: (row.ul_name as string | null) ?? null,
                dt_code: (row.dt_code as string | null) ?? null,
            };
        });

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
            return unauthorizedResponse();
        }

        const roles = (session.user.roles || ['INACTIF']) as string[];
        const canSubmit = ALLOWED_ROLES.some(r => roles.includes(r)) || isAdminOrAbove(roles);
        if (!canSubmit) {
            return forbiddenResponse();
        }

        const body = await request.json();

        let data: CreateMissionReportInput;
        try {
            data = createMissionReportSchema.parse(body);
        } catch (zodErr) {
            if (zodErr instanceof z.ZodError) {
                return NextResponse.json({ error: 'Données invalides', details: zodErr.issues }, { status: 400 });
            }
            throw zodErr;
        }

        const result = await insertMissionReport(data, session.user.email, session.user.id);
        if (!result.ok) {
            return result.status === 401
                ? unauthorizedResponse(result.error)
                : NextResponse.json({ error: result.error }, { status: result.status });
        }

        return NextResponse.json({ success: true, id: result.id }, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Données invalides', details: error.issues }, { status: 400 });
        }
        console.error('Error creating mission report:', error);
        return NextResponse.json({ error: 'Erreur lors de la création du compte rendu' }, { status: 500 });
    }
}
