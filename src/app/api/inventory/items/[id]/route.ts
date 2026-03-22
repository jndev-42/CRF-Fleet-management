import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { getErrorMessage } from '@/lib/utils/error';

const ALLOWED_ROLES = ['SECOURISTE', 'CHVL', 'CHVPSP', 'RESPO', 'ADMIN'];

const patchStockSchema = z.object({
    // Champs InvStock
    quantity: z.number().int().min(0).optional(),
    status: z.enum(['OK', 'HORS_SERVICE', 'MANQUANT']).optional(),
    expiryDate: z.string().nullable().optional(),
    criticalThreshold: z.number().int().min(0).nullable().optional(),
    // Champs InvItem (catalogue partagé — mise à jour globale)
    itemName: z.string().min(1).optional(),
    category: z.string().nullable().optional(),
    unit: z.string().optional(),
});

// ── PATCH /api/inventory/items/[id] — met à jour un InvStock ─────────────────

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const roles = (session.user.roles ?? []) as string[];
        if (!roles.some(r => ALLOWED_ROLES.includes(r))) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
        }

        const { id } = await params;
        const body = await request.json() as Record<string, unknown>;
        const data = patchStockSchema.parse(body);

        const existing = await db.execute({
            sql: `SELECT s.id, s.itemId FROM "InvStock" s WHERE s.id = ?`,
            args: [id],
        });
        if (existing.rows.length === 0) {
            return NextResponse.json({ error: 'Stock non trouvé' }, { status: 404 });
        }

        const itemId = existing.rows[0].itemId as string;
        const now = new Date().toISOString();

        // Mise à jour InvStock
        const stockClauses: string[] = [];
        const stockArgs: (string | number | null)[] = [];

        if (data.quantity !== undefined) { stockClauses.push('quantity = ?'); stockArgs.push(data.quantity); }
        if (data.status !== undefined) { stockClauses.push('status = ?'); stockArgs.push(data.status); }
        if (data.expiryDate !== undefined) { stockClauses.push('expiryDate = ?'); stockArgs.push(data.expiryDate); }
        if (data.criticalThreshold !== undefined) { stockClauses.push('criticalThreshold = ?'); stockArgs.push(data.criticalThreshold); }

        if (stockClauses.length > 0) {
            stockClauses.push('updatedAt = ?');
            stockArgs.push(now, id);
            await db.execute({
                sql: `UPDATE "InvStock" SET ${stockClauses.join(', ')} WHERE id = ?`,
                args: stockArgs,
            });
        }

        // Mise à jour InvItem (catalogue partagé)
        const itemClauses: string[] = [];
        const itemArgs: (string | number | null)[] = [];

        if (data.itemName !== undefined) { itemClauses.push('name = ?'); itemArgs.push(data.itemName); }
        if (data.category !== undefined) { itemClauses.push('category = ?'); itemArgs.push(data.category); }
        if (data.unit !== undefined) { itemClauses.push('unit = ?'); itemArgs.push(data.unit); }

        if (itemClauses.length > 0) {
            itemClauses.push('updatedAt = ?');
            itemArgs.push(now, itemId);
            await db.execute({
                sql: `UPDATE "InvItem" SET ${itemClauses.join(', ')} WHERE id = ?`,
                args: itemArgs,
            });
        }

        if (stockClauses.length === 0 && itemClauses.length === 0) {
            return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 });
        }

        const updatedRes = await db.execute({
            sql: `SELECT s.*,
                         loc.name AS locationName, loc.type AS locationType,
                         loc.vehicleId, loc.parentId,
                         v.name AS vehicleName,
                         i.name AS itemName, i.sku, i.category, i.unit
                  FROM "InvStock" s
                  JOIN "InvLocation" loc ON loc.id = s.locationId
                  LEFT JOIN "Vehicle" v ON v.id = loc.vehicleId
                  JOIN "InvItem" i ON i.id = s.itemId
                  WHERE s.id = ?`,
            args: [id],
        });

        const r = updatedRes.rows[0];
        return NextResponse.json({
            id: r.id as string,
            locationId: r.locationId as string,
            locationName: r.locationName as string,
            locationType: r.locationType as string,
            vehicleId: (r.vehicleId as string | null) ?? null,
            vehicleName: (r.vehicleName as string | null) ?? null,
            parentId: (r.parentId as string | null) ?? null,
            itemId: r.itemId as string,
            itemName: r.itemName as string,
            sku: (r.sku as string | null) ?? null,
            category: (r.category as string | null) ?? null,
            unit: r.unit as string,
            quantity: Number(r.quantity),
            expiryDate: (r.expiryDate as string | null) ?? null,
            status: r.status as string,
            criticalThreshold: r.criticalThreshold != null ? Number(r.criticalThreshold) : null,
            createdAt: r.createdAt as string,
            updatedAt: r.updatedAt as string,
        });
    } catch (e) {
        if (e instanceof z.ZodError) {
            return NextResponse.json({ error: 'Données invalides', details: e.issues }, { status: 400 });
        }
        console.error('PATCH /api/inventory/items/[id] error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors de la mise à jour du stock' }, { status: 500 });
    }
}

// ── DELETE /api/inventory/items/[id] — supprime InvStock + orphan InvItem ────

export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const roles = (session.user.roles ?? []) as string[];
        if (!roles.includes('ADMIN')) {
            return NextResponse.json({ error: 'Non autorisé — ADMIN requis' }, { status: 403 });
        }

        const { id } = await params;

        const existing = await db.execute({
            sql: `SELECT id, itemId FROM "InvStock" WHERE id = ?`,
            args: [id],
        });
        if (existing.rows.length === 0) {
            return NextResponse.json({ error: 'Stock non trouvé' }, { status: 404 });
        }

        const itemId = existing.rows[0].itemId as string;

        await db.execute({ sql: `DELETE FROM "InvStock" WHERE id = ?`, args: [id] });

        // Supprime l'article catalogue s'il n'est plus référencé
        const remaining = await db.execute({
            sql: `SELECT COUNT(*) as n FROM "InvStock" WHERE itemId = ?`,
            args: [itemId],
        });
        if ((remaining.rows[0].n as number) === 0) {
            await db.execute({ sql: `DELETE FROM "InvTemplate" WHERE itemId = ?`, args: [itemId] });
            await db.execute({ sql: `DELETE FROM "InvItem" WHERE id = ?`, args: [itemId] });
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error('DELETE /api/inventory/items/[id] error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors de la suppression du stock' }, { status: 500 });
    }
}
