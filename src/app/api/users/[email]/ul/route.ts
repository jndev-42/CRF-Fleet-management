import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';

const ulAssignSchema = z.object({
    ulId: z.string().nullable(),        // null = retirer l'UL d'appartenance
    isHome: z.boolean().default(false), // true = UL d'appartenance
    action: z.enum(['add', 'remove']).default('add'),
});

/** GET /api/users/[email]/ul — Récupère les UL d'un utilisateur */
export async function GET(_request: Request, { params }: { params: Promise<{ email: string }> }) {
    try {
        const session = await auth();
        if (!session?.user?.roles?.includes('ADMIN') && !session?.user?.roles?.includes('RESPO')) {
            return NextResponse.json({ error: 'Interdit' }, { status: 403 });
        }

        const { email } = await params;
        const decodedEmail = decodeURIComponent(email);

        const userRes = await db.execute({ sql: `SELECT id FROM "User" WHERE email = ?`, args: [decodedEmail] });
        if (userRes.rows.length === 0) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });

        const userId = userRes.rows[0].id as string;
        const ulRes = await db.execute({
            sql: `SELECT ul.id, ul.name, ul.slug, uu.is_home
                  FROM "UserUL" uu JOIN "UniteLocale" ul ON ul.id = uu.ulId
                  WHERE uu.userId = ? ORDER BY uu.is_home DESC, ul.name ASC`,
            args: [userId],
        });

        return NextResponse.json({ uls: ulRes.rows.map(r => ({ id: r.id, name: r.name, slug: r.slug, isHome: !!r.is_home })) });
    } catch (error) {
        console.error('Error fetching user ULs:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

/** PATCH /api/users/[email]/ul — Ajouter ou retirer une UL pour un utilisateur */
export async function PATCH(request: Request, { params }: { params: Promise<{ email: string }> }) {
    try {
        const session = await auth();
        if (!session?.user?.roles?.includes('ADMIN')) {
            return NextResponse.json({ error: 'Interdit' }, { status: 403 });
        }

        const { email } = await params;
        const decodedEmail = decodeURIComponent(email);
        const body = await request.json();
        const data = ulAssignSchema.parse(body);

        const userRes = await db.execute({ sql: `SELECT id FROM "User" WHERE email = ?`, args: [decodedEmail] });
        if (userRes.rows.length === 0) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });

        const userId = userRes.rows[0].id as string;

        if (data.action === 'remove' && data.ulId) {
            await db.execute({
                sql: `DELETE FROM "UserUL" WHERE userId = ? AND ulId = ?`,
                args: [userId, data.ulId],
            });
        } else if (data.action === 'add' && data.ulId) {
            // Vérifier que l'UL existe
            const ulCheck = await db.execute({ sql: `SELECT id FROM "UniteLocale" WHERE id = ?`, args: [data.ulId] });
            if (ulCheck.rows.length === 0) return NextResponse.json({ error: 'UL introuvable' }, { status: 404 });

            // Si c'est une UL d'appartenance, retirer l'ancienne
            if (data.isHome) {
                await db.execute({
                    sql: `UPDATE "UserUL" SET is_home = 0 WHERE userId = ? AND is_home = 1`,
                    args: [userId],
                });
            }

            await db.execute({
                sql: `INSERT INTO "UserUL" (userId, ulId, is_home) VALUES (?, ?, ?)
                      ON CONFLICT (userId, ulId) DO UPDATE SET is_home = excluded.is_home`,
                args: [userId, data.ulId, data.isHome ? 1 : 0],
            });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Données invalides', details: error.issues }, { status: 400 });
        }
        console.error('Error updating user UL:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
