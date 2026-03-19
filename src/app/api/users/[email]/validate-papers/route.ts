import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';

/** PATCH /api/users/[email]/validate-papers
 *
 * Marque les papiers d'un conducteur comme validés.
 * Accessible aux rôles ADMIN et RESPO uniquement.
 *
 * Effets :
 * - papiers_valides = 1
 * - last_validation = aujourd'hui (YYYY-MM-DD)
 * - start_date_invalidation_process = NULL
 */
export async function PATCH(
    _request: Request,
    { params }: { params: Promise<{ email: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const roles = session.user.roles || [];
        const canValidate = roles.includes('ADMIN') || roles.includes('RESPO');
        if (!canValidate) {
            return NextResponse.json({ error: 'Interdit' }, { status: 403 });
        }

        const { email: userId } = await params;

        const userRes = await db.execute({
            sql: `SELECT id FROM "User" WHERE id = ?`,
            args: [userId],
        });

        if (userRes.rows.length === 0) {
            return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });
        }

        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

        await db.execute({
            sql: `UPDATE "User"
                  SET papiers_valides = 1,
                      last_validation = ?,
                      start_date_invalidation_process = NULL
                  WHERE id = ?`,
            args: [today, userId],
        });

        return NextResponse.json({ success: true, last_validation: today });
    } catch (error) {
        console.error('Error validating papers:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la validation des papiers' },
            { status: 500 }
        );
    }
}
