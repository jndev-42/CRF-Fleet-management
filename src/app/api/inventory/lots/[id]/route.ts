import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { getErrorMessage } from '@/lib/utils/error';

const ALLOWED_ROLES = ['SECOURISTE', 'CHVL', 'CHVPSP', 'RESPO', 'ADMIN'];

const patchGroupeSchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
});

// ── PATCH /api/inventory/lots/[id] — mise à jour d'un groupe ─────────────────

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
        const data = patchGroupeSchema.parse(body);

        const existing = await db.execute({
            sql: `SELECT id FROM "InvGroupe" WHERE id = ?`,
            args: [id],
        });
        if (existing.rows.length === 0) {
            return NextResponse.json({ error: 'Groupe non trouvé' }, { status: 404 });
        }

        const setClauses: string[] = [];
        const args: (string | number | null)[] = [];

        if (data.name !== undefined) { setClauses.push('name = ?'); args.push(data.name); }
        if (data.description !== undefined) { setClauses.push('description = ?'); args.push(data.description); }

        if (setClauses.length === 0) {
            return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 });
        }

        const now = new Date().toISOString();
        setClauses.push('updatedAt = ?');
        args.push(now, id);

        await db.execute({
            sql: `UPDATE "InvGroupe" SET ${setClauses.join(', ')} WHERE id = ?`,
            args,
        });

        const updatedRes = await db.execute({
            sql: `SELECT * FROM "InvGroupe" WHERE id = ?`,
            args: [id],
        });

        const r = updatedRes.rows[0];
        return NextResponse.json({
            id: r.id as string,
            name: r.name as string,
            description: (r.description as string | null) ?? null,
            createdAt: r.createdAt as string,
            updatedAt: r.updatedAt as string,
        });
    } catch (e) {
        if (e instanceof z.ZodError) {
            return NextResponse.json({ error: 'Données invalides', details: e.issues }, { status: 400 });
        }
        console.error('PATCH /api/inventory/lots/[id] error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors de la mise à jour du groupe' }, { status: 500 });
    }
}

// ── DELETE /api/inventory/lots/[id] — suppression d'un groupe ────────────────

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
            sql: `SELECT id FROM "InvGroupe" WHERE id = ?`,
            args: [id],
        });
        if (existing.rows.length === 0) {
            return NextResponse.json({ error: 'Groupe non trouvé' }, { status: 404 });
        }

        // InvGroupeMember cascade ON DELETE CASCADE
        await db.execute({ sql: `DELETE FROM "InvGroupe" WHERE id = ?`, args: [id] });

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error('DELETE /api/inventory/lots/[id] error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors de la suppression du groupe' }, { status: 500 });
    }
}
