import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { z } from 'zod';
import { isAcceptableMediaRef } from '@/lib/media/refs';
import { canManageVehicles } from '@/lib/roles';
import {
    canRevealIncidentAuthor,
    canViewIncident,
    isWithinUlScope,
    type IncidentViewer,
} from '@/lib/incidentAccess';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { withAudit } from '@/lib/audit/log';
import { notifyIncidentSubmitted } from '@/lib/incidentNotifications';

const updateIncidentSchema = z.object({
    type: z.enum(['ACCIDENT', 'FLASH']).optional().nullable(),
    status: z.enum(['DRAFT', 'SUBMITTED']).optional(),
    occurredAt: z.string().optional().nullable(),
    location: z.string().optional().nullable(),
    flashDetails: z.record(z.string(), z.any()).optional().nullable(),
    accidentDetails: z.record(z.string(), z.any()).optional().nullable(),
    damages: z.record(z.string(), z.any()).optional().nullable(),
    victims: z.record(z.string(), z.any()).optional().nullable(),
    actions: z.record(z.string(), z.any()).optional().nullable(),
    context: z.record(z.string(), z.any()).optional().nullable(),
    description: z.string().optional().nullable(),
    retrospection: z.string().optional().nullable(),
    driveFolderId: z.string().max(512).refine(v => isAcceptableMediaRef(v, 'incident-photos'), 'Dossier de photos invalide').optional().nullable(),
});

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const session = await auth();
    if (!session?.user) {
        return unauthorizedResponse();
    }

    try {
        const result = await db.execute({
            sql: `SELECT ir.*, v.name as vehicleName, v.ulId as vehicleUlId, u.name as userName, u.email as userEmail
                  FROM IncidentReport ir
                  JOIN Vehicle v ON v.id = ir.vehicleId
                  JOIN User u ON u.id = ir.userId
                  WHERE ir.id = ?`,
            args: [id],
        });

        if (result.rows.length === 0) {
            return NextResponse.json({ error: 'Rapport introuvable' }, { status: 404 });
        }

        const viewer: IncidentViewer = {
            userId: session.user.id,
            ulId: session.user.ulId,
            roles: session.user.roles || [],
        };
        const subject = {
            authorId: String(result.rows[0].userId),
            vehicleUlId: (result.rows[0].vehicleUlId as string | null) ?? null,
            status: String(result.rows[0].status),
        };

        // Lecture ouverte à toute l'UL sur les rapports SOUMIS ; le brouillon d'autrui
        // et les rapports hors UL restent refusés.
        if (!canViewIncident(viewer, subject)) {
            return forbiddenResponse();
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic DB row
        const report = { ...result.rows[0] } as any;

        // Anonymisation à la source : l'identité du déclarant ne quitte le serveur que
        // pour lui-même et les administrateurs.
        if (!canRevealIncidentAuthor(viewer, subject)) {
            delete report.userId;
            delete report.userName;
            delete report.userEmail;
        }

        // Parse JSON fields
        const jsonFields = ['flashDetails', 'accidentDetails', 'damages', 'victims', 'actions', 'context'];
        jsonFields.forEach(field => {
            if (report[field] && typeof report[field] === 'string') {
                try {
                    report[field] = JSON.parse(report[field] as string);
                } catch (e) {
                    console.error(`Error parsing field ${field}:`, e);
                }
            }
        });

        return NextResponse.json(report);
    } catch (error) {
        console.error('[GET /api/incidents/[id]]', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

async function patchHandler(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) {
        return unauthorizedResponse();
    }

    try {
        const body = await request.json();
        const parsed = updateIncidentSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Données invalides', details: parsed.error.issues }, { status: 400 });
        }

        const data = parsed.data;
        const now = new Date().toISOString();

        // Check ownership or admin
        const check = await db.execute({
            sql: `SELECT ir.userId, ir.status, ir.driveFolderId, v.ulId AS vehicleUlId
                  FROM IncidentReport ir
                  LEFT JOIN Vehicle v ON v.id = ir.vehicleId
                  WHERE ir.id = ?`,
            args: [id],
        });

        // Cloisonnement UL : l'auteur garde la main sur sa déclaration (incident QR
        // inter-UL compris) ; pour tout autre compte, un rapport hors UL est inconnu.
        const isAuthor = check.rows.length > 0 && check.rows[0].userId === session.user.id;
        if (check.rows.length === 0 || (!isAuthor && !isWithinUlScope(
            { userId: session.user.id, ulId: session.user.ulId, roles: session.user.roles || [] },
            (check.rows[0].vehicleUlId as string | null) ?? null,
        ))) {
            return NextResponse.json({ error: 'Rapport introuvable' }, { status: 404 });
        }

        const isAdmin = canManageVehicles(session.user.roles);
        if (!isAuthor && !isAdmin) {
            return forbiddenResponse();
        }

        // Un incident soumis ne repasse pas en brouillon (sinon une nouvelle soumission re-notifierait les Responsables)
        if (data.status === 'DRAFT' && check.rows[0].status === 'SUBMITTED') {
            return NextResponse.json({ error: 'Un incident déjà soumis ne peut pas repasser en brouillon.' }, { status: 409 });
        }

        // Dossier de photos : de l'UL du véhicule, rattaché à aucun autre enregistrement.
        if (data.driveFolderId) {
            const { assertRefBindable } = await import('@/lib/media/server');
            const bindError = await assertRefBindable(data.driveFolderId, {
                type: 'incident-photos', table: 'IncidentReport', rowId: id,
                ulIds: [(check.rows[0].vehicleUlId as string | null) ?? null],
            });
            if (bindError) {
                return NextResponse.json({ error: bindError }, { status: 400 });
            }
        }

        // Build dynamic update
        const updates: string[] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic SQL args
        const args: any[] = [];

        Object.entries(data).forEach(([key, value]) => {
            updates.push(`"${key}" = ?`);
            if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
                args.push(JSON.stringify(value));
            } else {
                args.push(value);
            }
        });

        if (updates.length === 0) {
             return NextResponse.json({ success: true, message: 'Aucun changement' });
        }

        updates.push('"updatedAt" = ?');
        args.push(now);
        args.push(id);

        await db.execute({
            sql: `UPDATE "IncidentReport" SET ${updates.join(', ')} WHERE id = ?`,
            args,
        });

        // Dossier de photos remplacé : l'ancien est supprimé (best-effort) s'il n'est
        // plus référencé nulle part.
        const previousFolder = (check.rows[0].driveFolderId as string | null) || null;
        if ('driveFolderId' in data && previousFolder && previousFolder !== (data.driveFolderId || null)) {
            const { deleteMediaRefIfUnshared } = await import('@/lib/media/server');
            await deleteMediaRefIfUnshared(previousFolder, 'folder');
        }

        // Passage DRAFT -> SUBMITTED : les Responsables sont prévenus, une seule fois
        if (data.status === 'SUBMITTED' && check.rows[0].status !== 'SUBMITTED') {
            const updated = await db.execute({
                sql: `SELECT vehicleId, type FROM "IncidentReport" WHERE id = ?`,
                args: [id],
            });
            if (updated.rows.length > 0) {
                await notifyIncidentSubmitted({
                    vehicleId: updated.rows[0].vehicleId as string,
                    type: updated.rows[0].type as string | null,
                    authorId: check.rows[0].userId as string,
                    actorId: session.user.id,
                });
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[PATCH /api/incidents/[id]]', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

async function deleteHandler(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) {
        return unauthorizedResponse();
    }

    try {
        const check = await db.execute({
            sql: `SELECT ir.userId, ir.status, v.ulId AS vehicleUlId
                  FROM IncidentReport ir
                  LEFT JOIN Vehicle v ON v.id = ir.vehicleId
                  WHERE ir.id = ?`,
            args: [id],
        });

        // Cloisonnement UL : l'auteur garde la main sur sa déclaration (incident QR
        // inter-UL compris) ; pour tout autre compte, un rapport hors UL est inconnu.
        const isAuthor = check.rows.length > 0 && check.rows[0].userId === session.user.id;
        if (check.rows.length === 0 || (!isAuthor && !isWithinUlScope(
            { userId: session.user.id, ulId: session.user.ulId, roles: session.user.roles || [] },
            (check.rows[0].vehicleUlId as string | null) ?? null,
        ))) {
            return NextResponse.json({ error: 'Rapport introuvable' }, { status: 404 });
        }

        const isAdmin = canManageVehicles(session.user.roles);
        if (!isAuthor && !isAdmin) {
            return forbiddenResponse();
        }

        const folderRes = await db.execute({ sql: `SELECT driveFolderId FROM IncidentReport WHERE id = ?`, args: [id] });

        await db.execute({
            sql: `DELETE FROM IncidentReport WHERE id = ?`,
            args: [id],
        });

        // Photos : supprimées après la déclaration, en best-effort, si non partagées.
        const { deleteMediaRefIfUnshared } = await import('@/lib/media/server');
        await deleteMediaRefIfUnshared(folderRes.rows[0]?.driveFolderId as string | null, 'folder');

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[DELETE /api/incidents/[id]]', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

export const PATCH = withAudit(patchHandler, { action: "Modification d'un incident", entityType: 'incident' });
export const DELETE = withAudit(deleteHandler, { action: "Suppression d'un incident", entityType: 'incident' });
