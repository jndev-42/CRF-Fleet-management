import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';

const ulAssignSchema = z.object({
    ulId: z.string().nullable(),        // null = retirer l'UL d'appartenance
    isHome: z.boolean().default(false), // true = UL d'appartenance
    action: z.enum(['add', 'remove']).default('add'),
});

const bulkULSchema = z.object({
    uls: z.array(z.object({
        ulId: z.string(),
        isHome: z.boolean(),
        roles: z.array(z.string()),
    })),
});

/** GET /api/users/[email]/ul — Récupère les UL d'un utilisateur avec ses rôles spécifiques par UL */
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
            sql: `SELECT ul.id, ul.name, ul.slug, uu.is_home, uu.roles
                  FROM "UserUL" uu JOIN "UniteLocale" ul ON ul.id = uu.ulId
                  WHERE uu.userId = ? ORDER BY uu.is_home DESC, ul.name ASC`,
            args: [userId],
        });

        return NextResponse.json({
            uls: ulRes.rows.map(r => ({
                id: r.id,
                name: r.name,
                slug: r.slug,
                isHome: !!r.is_home,
                roles: r.roles ? (r.roles as string).split(',').map(x => x.trim()).filter(Boolean) : []
            }))
        });
    } catch (error) {
        console.error('Error fetching user ULs:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

/** PATCH /api/users/[email]/ul — Ajouter ou retirer une UL pour un utilisateur (pour la colonne simple de la table) */
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

/** PUT /api/users/[email]/ul — Synchronise en masse tous les droits UL (home + externes) pour un utilisateur */
export async function PUT(request: Request, { params }: { params: Promise<{ email: string }> }) {
    try {
        const session = await auth();
        if (!session?.user?.roles?.includes('ADMIN')) {
            return NextResponse.json({ error: 'Interdit' }, { status: 403 });
        }

        const { email } = await params;
        const decodedEmail = decodeURIComponent(email);
        const body = await request.json();
        const data = bulkULSchema.parse(body);

        const userRes = await db.execute({ sql: `SELECT id FROM "User" WHERE email = ?`, args: [decodedEmail] });
        if (userRes.rows.length === 0) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });

        const userId = userRes.rows[0].id as string;

        const tx = await db.transaction('write');
        try {
            // Supprimer tous les droits actuels
            await tx.execute({
                sql: `DELETE FROM "UserUL" WHERE userId = ?`,
                args: [userId],
            });

            // Insérer les nouveaux droits
            for (const item of data.uls) {
                const rolesStr = item.roles.join(',');
                await tx.execute({
                    sql: `INSERT INTO "UserUL" (userId, ulId, is_home, roles) VALUES (?, ?, ?, ?)`,
                    args: [userId, item.ulId, item.isHome ? 1 : 0, rolesStr || null],
                });

                // Si c'est l'UL d'appartenance (home), synchroniser avec les rôles globaux (UserRole)
                if (item.isHome) {
                    // Supprimer les rôles globaux existants
                    await tx.execute({
                        sql: `DELETE FROM "UserRole" WHERE userId = ?`,
                        args: [userId],
                    });

                    // Insérer les nouveaux rôles globaux
                    for (const roleName of item.roles) {
                        const roleRes = await tx.execute({
                            sql: 'SELECT id FROM "Role" WHERE name = ?',
                            args: [roleName]
                        });
                        if (roleRes.rows.length > 0) {
                            await tx.execute({
                                sql: 'INSERT INTO "UserRole" (userId, roleId) VALUES (?, ?)',
                                args: [userId, roleRes.rows[0].id]
                            });
                        }
                    }
                }
            }

            await tx.commit();
            return NextResponse.json({ success: true });
        } catch (e) {
            await tx.rollback();
            throw e;
        }
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Données invalides', details: error.issues }, { status: 400 });
        }
        console.error('Error batch updating user ULs:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
