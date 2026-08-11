import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { z } from 'zod';
import { isAdminOrAbove, isSuperAdmin } from '@/lib/roles';

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
    driveFolderId: z.string().optional().nullable(),
});

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    try {
        const result = await db.execute({
            sql: `SELECT ir.*, v.name as vehicleName, v.ulId as vehicleUlId, u.name as userName
                  FROM IncidentReport ir
                  JOIN Vehicle v ON v.id = ir.vehicleId
                  JOIN User u ON u.id = ir.userId
                  WHERE ir.id = ?`,
            args: [id],
        });

        if (result.rows.length === 0) {
            return NextResponse.json({ error: 'Rapport introuvable' }, { status: 404 });
        }

        if (!isSuperAdmin(session.user.roles || []) && session.user.ulId !== result.rows[0].vehicleUlId) {
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic DB row
        const report = { ...result.rows[0] } as any;

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

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
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
            sql: `SELECT userId FROM IncidentReport WHERE id = ?`,
            args: [id],
        });

        if (check.rows.length === 0) {
            return NextResponse.json({ error: 'Rapport introuvable' }, { status: 404 });
        }

        const isAdmin = isAdminOrAbove(session.user.roles);
        if (check.rows[0].userId !== session.user.id && !isAdmin) {
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
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

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[PATCH /api/incidents/[id]]', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    try {
        const check = await db.execute({
            sql: `SELECT userId, status FROM IncidentReport WHERE id = ?`,
            args: [id],
        });

        if (check.rows.length === 0) {
            return NextResponse.json({ error: 'Rapport introuvable' }, { status: 404 });
        }

        const isAdmin = isAdminOrAbove(session.user.roles);
        if (check.rows[0].userId !== session.user.id && !isAdmin) {
            return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
        }

        await db.execute({
            sql: `DELETE FROM IncidentReport WHERE id = ?`,
            args: [id],
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[DELETE /api/incidents/[id]]', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
