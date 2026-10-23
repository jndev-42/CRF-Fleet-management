import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { canManageVehicles } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse, isOutsideUl } from '@/lib/apiAuth';
import { withAudit } from '@/lib/audit/log';

const createItemSchema = z.object({
    label: z.string().min(1, 'Le libellé est requis').max(200),
    type: z.enum(['checkout', 'checkin']),
    required: z.boolean().optional().default(false),
});

/**
 * GET /api/vehicles/[id]/checklist?type=checkout|checkin
 * Returns the ordered list of checklist items for this vehicle.
 * Accessible to any authenticated user of the vehicle's UL (needed by CheckOutModal &
 * CheckInModal). Les formulaires QR, ouverts entre ULs, passent par
 * `GET /api/qr/[token]/checklist`.
 */

/** Cloisonnement UL : véhicule inconnu ou d'une autre UL → même 404. */
async function isVehicleHidden(roles: string[], sessionUlId: string | undefined, vehicleId: string): Promise<boolean> {
    const res = await db.execute({ sql: `SELECT ulId FROM Vehicle WHERE id = ?`, args: [vehicleId] });
    return res.rows.length === 0 || isOutsideUl(roles, sessionUlId, res.rows[0].ulId);
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        const { id: vehicleId } = await params;
        if (await isVehicleHidden(session.user.roles || [], session.user.ulId, vehicleId)) {
            return NextResponse.json({ error: 'Véhicule non trouvé' }, { status: 404 });
        }
        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type'); // 'checkout' | 'checkin' | null (all)

        const rows = await db.execute({
            sql: `
                SELECT id, vehicleId, label, type, required, "order", createdAt
                FROM "VehicleChecklistItem"
                WHERE vehicleId = ?
                ${type ? 'AND type = ?' : ''}
                ORDER BY "order" ASC, createdAt ASC
            `,
            args: type ? [vehicleId, type] : [vehicleId],
        });

        const items = rows.rows.map(r => ({
            id: r.id as string,
            vehicleId: r.vehicleId as string,
            label: r.label as string,
            type: r.type as 'checkout' | 'checkin',
            required: !!r.required,
            order: r.order as number,
            createdAt: r.createdAt as string,
        }));

        return NextResponse.json(items);
    } catch (error) {
        console.error('Error fetching checklist items:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

/**
 * POST /api/vehicles/[id]/checklist
 * Admin only — creates a new checklist item for this vehicle.
 */
async function postHandler(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        const roles = session?.user?.roles || [];
        if (!canManageVehicles(roles)) {
            return forbiddenResponse();
        }

        const { id: vehicleId } = await params;
        if (await isVehicleHidden(roles, session?.user?.ulId, vehicleId)) {
            return NextResponse.json({ error: 'Véhicule non trouvé' }, { status: 404 });
        }
        const body = await request.json();

        let data: z.infer<typeof createItemSchema>;
        try {
            data = createItemSchema.parse(body);
        } catch (zodErr) {
            if (zodErr instanceof z.ZodError) {
                return NextResponse.json({ error: 'Données invalides', details: zodErr.issues }, { status: 400 });
            }
            throw zodErr;
        }

        // Compute next order value for this vehicle + type
        const countRes = await db.execute({
            sql: `SELECT COUNT(*) as cnt FROM "VehicleChecklistItem" WHERE vehicleId = ? AND type = ?`,
            args: [vehicleId, data.type],
        });
        const nextOrder = (countRes.rows[0].cnt as number) || 0;

        const id = crypto.randomUUID();
        const now = new Date().toISOString();

        await db.execute({
            sql: `INSERT INTO "VehicleChecklistItem" (id, vehicleId, label, type, required, "order", createdAt)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`,
            args: [id, vehicleId, data.label, data.type, data.required ? 1 : 0, nextOrder, now],
        });

        return NextResponse.json({
            id, vehicleId, label: data.label, type: data.type,
            required: data.required, order: nextOrder, createdAt: now
        }, { status: 201 });
    } catch (error) {
        console.error('Error creating checklist item:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

export const POST = withAudit(postHandler, { action: "Ajout d'un élément de checklist", entityType: 'vehicle' });
