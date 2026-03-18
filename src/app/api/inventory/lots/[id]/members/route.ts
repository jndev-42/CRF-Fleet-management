import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { getErrorMessage } from '@/lib/utils/error';

const ALLOWED_ROLES = ['SECOURISTE', 'CHVL', 'CHVPSP', 'RESPO', 'ADMIN'];

const addMemberSchema = z.object({
    locationId: z.string().min(1),
});

// ── POST /api/inventory/lots/[id]/members — ajoute un sac à un groupe ─────────

export async function POST(
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
        const data = addMemberSchema.parse(body);

        // Vérifie que le groupe existe
        const groupeRes = await db.execute({
            sql: `SELECT id FROM "InvGroupe" WHERE id = ?`,
            args: [id],
        });
        if (groupeRes.rows.length === 0) {
            return NextResponse.json({ error: 'Groupe non trouvé' }, { status: 404 });
        }

        // Vérifie que le lieu est de type SAC
        const locRes = await db.execute({
            sql: `SELECT id, type FROM "InvLocation" WHERE id = ?`,
            args: [data.locationId],
        });
        if (locRes.rows.length === 0) {
            return NextResponse.json({ error: 'Emplacement non trouvé' }, { status: 404 });
        }
        if ((locRes.rows[0].type as string) !== 'SAC') {
            return NextResponse.json({ error: 'Seuls les sacs peuvent être ajoutés à un groupe' }, { status: 400 });
        }

        await db.execute({
            sql: `INSERT OR IGNORE INTO "InvGroupeMember" (groupeId, locationId) VALUES (?, ?)`,
            args: [id, data.locationId],
        });

        return NextResponse.json({ success: true, groupeId: id, locationId: data.locationId }, { status: 201 });
    } catch (e) {
        if (e instanceof z.ZodError) {
            return NextResponse.json({ error: 'Données invalides', details: e.issues }, { status: 400 });
        }
        console.error('POST /api/inventory/lots/[id]/members error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors de l\'ajout du membre' }, { status: 500 });
    }
}
