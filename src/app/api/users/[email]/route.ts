import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';

function resolveRoles(roles: string[]): string[] {
    const nonGuest = roles.filter(r => r !== 'GUEST');
    return nonGuest.length > 0 ? nonGuest : (roles.includes('GUEST') ? ['GUEST'] : []);
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ email: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.roles?.includes('ADMIN')) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
        }

        const body = await request.json();
        const { roles } = body;

        if (!Array.isArray(roles)) {
            return NextResponse.json({ error: 'Format invalide' }, { status: 400 });
        }

        const { email: emailParam } = await params;
        const email = decodeURIComponent(emailParam);

        const tx = await db.transaction('write');
        try {
            // Find user
            const userRes = await tx.execute({
                sql: 'SELECT id FROM "User" WHERE email = ?',
                args: [email]
            });

            if (userRes.rows.length === 0) {
                await tx.rollback();
                return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
            }

            const userId = userRes.rows[0].id;

            // Delete current roles
            await tx.execute({
                sql: 'DELETE FROM "UserRole" WHERE userId = ?',
                args: [userId]
            });

            // Insert new roles
            const resolvedRoles = resolveRoles(roles);
            for (const roleName of resolvedRoles) {
                const roleRes = await tx.execute({
                    sql: 'SELECT id FROM "Role" WHERE name = ?',
                    args: [roleName]
                });

                if (roleRes.rows.length > 0) {
                    const roleId = roleRes.rows[0].id;
                    await tx.execute({
                        sql: 'INSERT INTO "UserRole" (userId, roleId) VALUES (?, ?)',
                        args: [userId, roleId]
                    });
                }
            }

            await tx.commit();
            return NextResponse.json({ success: true });
        } catch (e) {
            await tx.rollback();
            throw e;
        }

    } catch (error) {
        console.error('Error updating user roles:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
