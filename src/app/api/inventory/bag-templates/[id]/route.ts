import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { getErrorMessage } from '@/lib/utils/error';

const putTemplateSchema = z.object({
    name: z.string().min(1).optional(),
    entries: z.array(z.object({
        itemId: z.string().min(1),
        targetQty: z.number().int().min(1),
    })).optional(),
});

// ── GET /api/inventory/bag-templates/[id] — détail d'un modèle ───────────────

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const { id } = await params;

        const templateRes = await db.execute({
            sql: `SELECT id, name, createdAt, updatedAt FROM "InvBagTemplate" WHERE id = ?`,
            args: [id],
        });

        if (templateRes.rows.length === 0) {
            return NextResponse.json({ error: 'Modèle non trouvé' }, { status: 404 });
        }

        const t = templateRes.rows[0];

        const entriesRes = await db.execute({
            sql: `SELECT bti.id, bti.itemId, bti.targetQty, i.name AS itemName, i.unit
                  FROM "InvBagTemplateItem" bti
                  JOIN "InvItem" i ON i.id = bti.itemId
                  WHERE bti.templateId = ?
                  ORDER BY i.name ASC`,
            args: [id],
        });

        const entries = entriesRes.rows.map(r => ({
            id: r.id as string,
            itemId: r.itemId as string,
            itemName: r.itemName as string,
            unit: r.unit as string,
            targetQty: Number(r.targetQty),
        }));

        return NextResponse.json({
            id: t.id as string,
            name: t.name as string,
            itemCount: entries.length,
            createdAt: t.createdAt as string,
            entries,
        });
    } catch (e) {
        console.error('GET /api/inventory/bag-templates/[id] error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors de la récupération du modèle' }, { status: 500 });
    }
}

// ── PUT /api/inventory/bag-templates/[id] — mise à jour d'un modèle ──────────

export async function PUT(
    request: Request,
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
        const body = await request.json() as Record<string, unknown>;
        const data = putTemplateSchema.parse(body);

        const existing = await db.execute({
            sql: `SELECT id FROM "InvBagTemplate" WHERE id = ?`,
            args: [id],
        });
        if (existing.rows.length === 0) {
            return NextResponse.json({ error: 'Modèle non trouvé' }, { status: 404 });
        }

        const now = new Date().toISOString();

        if (data.name !== undefined) {
            await db.execute({
                sql: `UPDATE "InvBagTemplate" SET name = ?, updatedAt = ? WHERE id = ?`,
                args: [data.name, now, id],
            });
        }

        if (data.entries !== undefined) {
            // Full replace des entries
            await db.execute({
                sql: `DELETE FROM "InvBagTemplateItem" WHERE templateId = ?`,
                args: [id],
            });
            for (const entry of data.entries) {
                await db.execute({
                    sql: `INSERT INTO "InvBagTemplateItem" (id, templateId, itemId, targetQty) VALUES (?, ?, ?, ?)`,
                    args: [crypto.randomUUID(), id, entry.itemId, entry.targetQty],
                });
            }
        }

        // Retourne le modèle mis à jour
        const updatedRes = await db.execute({
            sql: `SELECT id, name, createdAt, updatedAt FROM "InvBagTemplate" WHERE id = ?`,
            args: [id],
        });
        const entriesRes = await db.execute({
            sql: `SELECT bti.id, bti.itemId, bti.targetQty, i.name AS itemName, i.unit
                  FROM "InvBagTemplateItem" bti
                  JOIN "InvItem" i ON i.id = bti.itemId
                  WHERE bti.templateId = ?
                  ORDER BY i.name ASC`,
            args: [id],
        });

        const entries = entriesRes.rows.map(r => ({
            id: r.id as string,
            itemId: r.itemId as string,
            itemName: r.itemName as string,
            unit: r.unit as string,
            targetQty: Number(r.targetQty),
        }));

        const u = updatedRes.rows[0];
        return NextResponse.json({
            id: u.id as string,
            name: u.name as string,
            itemCount: entries.length,
            createdAt: u.createdAt as string,
            entries,
        });
    } catch (e) {
        if (e instanceof z.ZodError) {
            return NextResponse.json({ error: 'Données invalides', details: e.issues }, { status: 400 });
        }
        console.error('PUT /api/inventory/bag-templates/[id] error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors de la mise à jour du modèle' }, { status: 500 });
    }
}

// ── DELETE /api/inventory/bag-templates/[id] — suppression d'un modèle ───────

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
            sql: `SELECT id FROM "InvBagTemplate" WHERE id = ?`,
            args: [id],
        });
        if (existing.rows.length === 0) {
            return NextResponse.json({ error: 'Modèle non trouvé' }, { status: 404 });
        }

        // ON DELETE CASCADE gère InvBagTemplateItem
        // ON DELETE SET NULL gère InvLocation.templateId
        await db.execute({
            sql: `DELETE FROM "InvBagTemplate" WHERE id = ?`,
            args: [id],
        });

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error('DELETE /api/inventory/bag-templates/[id] error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors de la suppression du modèle' }, { status: 500 });
    }
}
