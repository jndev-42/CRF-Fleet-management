import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { getErrorMessage } from '@/lib/utils/error';

const ALLOWED_ROLES = ['SECOURISTE', 'CHVL', 'CHVPSP', 'RESPO', 'ADMIN'];

// ── DELETE /api/inventory/lots/[id]/members/[locationId] ─────────────────────

export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string; locationId: string }> }
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

        const { id, locationId } = await params;

        const existing = await db.execute({
            sql: `SELECT groupeId FROM "InvGroupeMember" WHERE groupeId = ? AND locationId = ?`,
            args: [id, locationId],
        });
        if (existing.rows.length === 0) {
            return NextResponse.json({ error: 'Membre non trouvé dans ce groupe' }, { status: 404 });
        }

        await db.execute({
            sql: `DELETE FROM "InvGroupeMember" WHERE groupeId = ? AND locationId = ?`,
            args: [id, locationId],
        });

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error('DELETE /api/inventory/lots/[id]/members/[locationId] error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors de la suppression du membre' }, { status: 500 });
    }
}
