import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { getErrorMessage } from '@/lib/utils/error';

const ALLOWED_ROLES = ['SECOURISTE', 'CHVL', 'CHVPSP', 'RESPO', 'ADMIN'];

const createGroupeSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
});

// ── POST /api/inventory/lots — créer un groupe (InvGroupe) ────────────────────

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const roles = (session.user.roles ?? []) as string[];
        if (!roles.some(r => ALLOWED_ROLES.includes(r))) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
        }

        const body = await request.json() as Record<string, unknown>;
        const data = createGroupeSchema.parse(body);

        const id = crypto.randomUUID();
        const now = new Date().toISOString();

        await db.execute({
            sql: `INSERT INTO "InvGroupe" (id, name, description, createdAt, updatedAt)
                  VALUES (?, ?, ?, ?, ?)`,
            args: [id, data.name, data.description ?? null, now, now],
        });

        return NextResponse.json({
            id,
            name: data.name,
            description: data.description ?? null,
            sacs: [],
            createdAt: now,
            updatedAt: now,
        }, { status: 201 });
    } catch (e) {
        if (e instanceof z.ZodError) {
            return NextResponse.json({ error: 'Données invalides', details: e.issues }, { status: 400 });
        }
        console.error('POST /api/inventory/lots error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors de la création du groupe' }, { status: 500 });
    }
}
