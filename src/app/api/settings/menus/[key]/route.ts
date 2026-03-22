import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';

const VALID_KEYS = ['stats', 'inventory', 'missions'] as const;

const patchSchema = z.object({
    visibility: z.enum(['available', 'admin_only', 'disabled']),
});

type RouteContext = { params: Promise<{ key: string }> };

/** PATCH /api/settings/menus/[key] — Modifie la visibilité d'un menu.
 *  ADMIN uniquement. */
export async function PATCH(request: Request, { params }: RouteContext) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const roles = (session.user.roles || ['INACTIF']) as string[];
        if (!roles.includes('ADMIN')) {
            return NextResponse.json({ error: 'Interdit' }, { status: 403 });
        }

        const { key } = await params;

        if (!(VALID_KEYS as readonly string[]).includes(key)) {
            return NextResponse.json({ error: `Clé de menu invalide. Valeurs acceptées : ${VALID_KEYS.join(', ')}` }, { status: 400 });
        }

        const body = await request.json();

        let data: z.infer<typeof patchSchema>;
        try {
            data = patchSchema.parse(body);
        } catch (zodErr) {
            if (zodErr instanceof z.ZodError) {
                return NextResponse.json({ error: 'Données invalides', details: zodErr.issues }, { status: 400 });
            }
            throw zodErr;
        }

        const now = new Date().toISOString();
        await db.execute({
            sql: `UPDATE "MenuSetting" SET visibility = ?, updatedAt = ? WHERE menu_key = ?`,
            args: [data.visibility, now, key],
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating menu setting:', error);
        return NextResponse.json({ error: 'Erreur lors de la mise à jour du paramètre' }, { status: 500 });
    }
}
