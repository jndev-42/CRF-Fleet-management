import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { isAdminOrAbove, isSuperAdmin } from '@/lib/roles';

const patchItemSchema = z.object({
    label: z.string().min(1).max(200).optional(),
    required: z.boolean().optional(),
    order: z.number().int().min(0).optional(),
});

/**
 * PATCH /api/checklist/[itemId]
 * Admin only — updates label, required, or order of a checklist item.
 */
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ itemId: string }> }
) {
    try {
        const session = await auth();
        if (!isAdminOrAbove(session?.user?.roles || [])) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
        }

        const { itemId } = await params;

        const ownerRes = await db.execute({
            sql: `SELECT v.ulId as ulId FROM "VehicleChecklistItem" vc JOIN Vehicle v ON v.id = vc.vehicleId WHERE vc.id = ?`,
            args: [itemId],
        });
        if (ownerRes.rows.length === 0) {
            return NextResponse.json({ error: 'Élément non trouvé' }, { status: 404 });
        }
        if (!isSuperAdmin(session?.user?.roles || []) && session?.user?.ulId !== ownerRes.rows[0].ulId) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
        }

        const body = await request.json();

        let data: z.infer<typeof patchItemSchema>;
        try {
            data = patchItemSchema.parse(body);
        } catch (zodErr) {
            if (zodErr instanceof z.ZodError) {
                return NextResponse.json({ error: 'Données invalides', details: zodErr.issues }, { status: 400 });
            }
            throw zodErr;
        }

        const setClauses: string[] = [];
        const args: (string | number)[] = [];

        if (data.label !== undefined) {
            if (itemId.startsWith('dsa-')) {
                return NextResponse.json({ error: 'Le libellé du DSA ne peut pas être modifié' }, { status: 400 });
            }
            setClauses.push('label = ?');
            args.push(data.label);
        }
        if (data.required !== undefined) {
            if (itemId.startsWith('dsa-') && !data.required) {
                return NextResponse.json({ error: 'Le DSA doit rester obligatoire' }, { status: 400 });
            }
            setClauses.push('"required" = ?');
            args.push(data.required ? 1 : 0);
        }
        if (data.order !== undefined) { setClauses.push('"order" = ?'); args.push(data.order); }

        if (setClauses.length === 0) {
            return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 });
        }

        args.push(itemId);
        await db.execute({
            sql: `UPDATE "VehicleChecklistItem" SET ${setClauses.join(', ')} WHERE id = ?`,
            args,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating checklist item:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

/**
 * DELETE /api/checklist/[itemId]
 * Admin only — removes a checklist item.
 */
export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ itemId: string }> }
) {
    try {
        const session = await auth();
        if (!isAdminOrAbove(session?.user?.roles || [])) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
        }

        const { itemId } = await params;

        if (itemId.startsWith('dsa-')) {
            return NextResponse.json({ error: 'Le DSA ne peut pas être supprimé. Désactivez-le dans les paramètres du véhicule.' }, { status: 400 });
        }

        const ownerRes = await db.execute({
            sql: `SELECT v.ulId as ulId FROM "VehicleChecklistItem" vc JOIN Vehicle v ON v.id = vc.vehicleId WHERE vc.id = ?`,
            args: [itemId],
        });
        if (ownerRes.rows.length === 0) {
            return NextResponse.json({ error: 'Élément non trouvé' }, { status: 404 });
        }
        if (!isSuperAdmin(session?.user?.roles || []) && session?.user?.ulId !== ownerRes.rows[0].ulId) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
        }

        await db.execute({
            sql: `DELETE FROM "VehicleChecklistItem" WHERE id = ?`,
            args: [itemId],
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting checklist item:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
