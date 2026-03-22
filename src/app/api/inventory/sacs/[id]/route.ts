import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { getErrorMessage } from '@/lib/utils/error';

const ALLOWED_ROLES = ['SECOURISTE', 'CHVL', 'CHVPSP', 'RESPO', 'ADMIN'];

const patchSacSchema = z.object({
    name: z.string().min(1).optional(),
    isSealed: z.boolean().optional(),
    templateId: z.string().nullable().optional(),
});

// ── PATCH /api/inventory/sacs/[id] — mise à jour d'un sac ────────────────────

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
        const data = patchSacSchema.parse(body);

        const existing = await db.execute({
            sql: `SELECT id FROM "InvLocation" WHERE id = ? AND type = 'SAC'`,
            args: [id],
        });
        if (existing.rows.length === 0) {
            return NextResponse.json({ error: 'Sac non trouvé' }, { status: 404 });
        }

        // templateId require le rôle ADMIN
        if (data.templateId !== undefined) {
            if (!roles.includes('ADMIN')) {
                return NextResponse.json({ error: 'Non autorisé — ADMIN requis pour modifier le modèle' }, { status: 403 });
            }
            // Vérifie que le template existe si non null
            if (data.templateId !== null) {
                const tplRes = await db.execute({
                    sql: `SELECT id FROM "InvBagTemplate" WHERE id = ?`,
                    args: [data.templateId],
                });
                if (tplRes.rows.length === 0) {
                    return NextResponse.json({ error: 'Modèle de sac non trouvé' }, { status: 404 });
                }
            }
        }

        const setClauses: string[] = [];
        const args: (string | number | null)[] = [];

        if (data.name !== undefined) { setClauses.push('name = ?'); args.push(data.name); }
        if (data.isSealed !== undefined) { setClauses.push('isSealed = ?'); args.push(data.isSealed ? 1 : 0); }
        if (data.templateId !== undefined) { setClauses.push('templateId = ?'); args.push(data.templateId); }

        if (setClauses.length === 0) {
            return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 });
        }

        const now = new Date().toISOString();
        setClauses.push('updatedAt = ?');
        args.push(now, id);

        await db.execute({
            sql: `UPDATE "InvLocation" SET ${setClauses.join(', ')} WHERE id = ?`,
            args,
        });

        const updatedRes = await db.execute({
            sql: `SELECT * FROM "InvLocation" WHERE id = ?`,
            args: [id],
        });

        const r = updatedRes.rows[0];
        return NextResponse.json({
            id: r.id as string,
            type: r.type as string,
            name: r.name as string,
            vehicleId: (r.vehicleId as string | null) ?? null,
            parentId: (r.parentId as string | null) ?? null,
            isSealed: r.isSealed === 1,
            templateId: (r.templateId as string | null) ?? null,
            createdAt: r.createdAt as string,
            updatedAt: r.updatedAt as string,
        });
    } catch (e) {
        if (e instanceof z.ZodError) {
            return NextResponse.json({ error: 'Données invalides', details: e.issues }, { status: 400 });
        }
        console.error('PATCH /api/inventory/sacs/[id] error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors de la mise à jour du sac' }, { status: 500 });
    }
}

// ── DELETE /api/inventory/sacs/[id] — suppression d'un sac ───────────────────

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
            sql: `SELECT id FROM "InvLocation" WHERE id = ? AND type = 'SAC'`,
            args: [id],
        });
        if (existing.rows.length === 0) {
            return NextResponse.json({ error: 'Sac non trouvé' }, { status: 404 });
        }

        // Les cascades ON DELETE CASCADE gèrent InvStock, InvGroupeMember, InvTemplate
        await db.execute({ sql: `DELETE FROM "InvLocation" WHERE id = ?`, args: [id] });

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error('DELETE /api/inventory/sacs/[id] error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors de la suppression du sac' }, { status: 500 });
    }
}
