import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';

function resolveRoles(roles: string[]): string[] {
    // 'INACTIF' is the current inactive role; 'GUEST' is the legacy alias (DB backfill pending)
    const isInactiveRole = (r: string) => r === 'INACTIF' || r === 'GUEST';
    const activeRoles = roles.filter(r => !isInactiveRole(r));
    if (activeRoles.length === 0) {
        // Preserve whatever inactive role was passed (GUEST or INACTIF) — DB backfill handles normalization
        const inactiveRole = roles.find(isInactiveRole);
        return inactiveRole ? [inactiveRole] : [];
    }
    return activeRoles;
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

            // Si le nouvel ensemble de rôles contient CHVL ou CHVPSP,
            // invalider les papiers s'ils n'ont jamais été validés (last_validation NULL).
            const isNowDriver = resolvedRoles.some(r => r === 'CHVL' || r === 'CHVPSP');
            if (isNowDriver) {
                const today = new Date().toISOString().slice(0, 10);
                await tx.execute({
                    sql: `UPDATE "User"
                          SET papiers_valides = 0,
                              start_date_invalidation_process = COALESCE(start_date_invalidation_process, ?)
                          WHERE id = ? AND last_validation IS NULL`,
                    args: [today, userId],
                });
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

export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ email: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.roles?.includes('ADMIN')) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
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

            // Check if user has submitted any mission reports (history must be preserved)
            const reportsRes = await tx.execute({
                sql: 'SELECT id FROM "mission_reports" WHERE submitted_by = ? LIMIT 1',
                args: [userId]
            });

            if (reportsRes.rows.length > 0) {
                await tx.rollback();
                return NextResponse.json({
                    error: "Cet utilisateur a soumis des comptes rendus de mission et ne peut pas être supprimé pour préserver l'historique. Veuillez plutôt lui retirer tous ses rôles (le passer en INACTIF)."
                }, { status: 409 });
            }

            // Nullify references in Trip
            await tx.execute({
                sql: 'UPDATE "Trip" SET driverId = NULL WHERE driverId = ?',
                args: [userId]
            });
            await tx.execute({
                sql: 'UPDATE "Trip" SET secondDriverId = NULL WHERE secondDriverId = ?',
                args: [userId]
            });

            // Nullify references in mission_reports (driver_id)
            await tx.execute({
                sql: 'UPDATE "mission_reports" SET driver_id = NULL WHERE driver_id = ?',
                args: [userId]
            });

            // Delete user (cascades to UserRole and Notification)
            await tx.execute({
                sql: 'DELETE FROM "User" WHERE id = ?',
                args: [userId]
            });

            await tx.commit();
            return NextResponse.json({ success: true });
        } catch (e) {
            await tx.rollback();
            throw e;
        }
    } catch (error) {
        console.error('Error deleting user:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
