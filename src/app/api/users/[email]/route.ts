import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { isAdminOrAbove, canAssignRole, resolveRoles, isSuperAdmin, ROLES } from '@/lib/roles';
import { forbiddenResponse } from '@/lib/apiAuth';

const updateRolesSchema = z.object({
    roles: z.array(z.string()),
});

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ email: string }> }
) {
    try {
        const session = await auth();
        const actorRoles = session?.user?.roles || [];
        if (!isAdminOrAbove(actorRoles)) {
            return forbiddenResponse();
        }

        const body = await request.json();
        let parsed: z.infer<typeof updateRolesSchema>;
        try {
            parsed = updateRolesSchema.parse(body);
        } catch (zodErr) {
            if (zodErr instanceof z.ZodError) {
                return NextResponse.json({ error: 'Format invalide', details: zodErr.issues }, { status: 400 });
            }
            throw zodErr;
        }
        const { roles } = parsed;

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

            const isSuper = isSuperAdmin(actorRoles);
            if (!isSuper) {
                const actorUlId = session?.user?.ulId;
                const userHomeUlRes = await tx.execute({
                    sql: 'SELECT ulId FROM "UserUL" WHERE userId = ? AND is_home = 1',
                    args: [userId],
                });
                const userHomeUlId = userHomeUlRes.rows[0]?.ulId as string | undefined;
                if (userHomeUlId && userHomeUlId !== actorUlId) {
                    await tx.rollback();
                    return forbiddenResponse("Un administrateur local ne peut modifier les rôles globaux d'un utilisateur appartenant à une autre Unité Locale.");
                }
            }

            // Delete current roles
            await tx.execute({
                sql: 'DELETE FROM "UserRole" WHERE userId = ?',
                args: [userId]
            });

            // Insert new roles (vérifier les droits d'attribution)
            const resolvedRoles = resolveRoles(roles);
            for (const roleName of resolvedRoles) {
                if (!canAssignRole(actorRoles, roleName)) {
                    await tx.rollback();
                    return forbiddenResponse(`Seul un Super Administrateur peut attribuer le rôle "${roleName}"`);
                }
            }
            if (resolvedRoles.length > 0) {
                const placeholders = resolvedRoles.map(() => '?').join(', ');
                const rolesRes = await tx.execute({
                    sql: `SELECT id, name FROM "Role" WHERE name IN (${placeholders})`,
                    args: resolvedRoles,
                });
                const roleIdByName = new Map(rolesRes.rows.map(r => [r.name as string, r.id]));

                for (const roleName of resolvedRoles) {
                    const roleId = roleIdByName.get(roleName);
                    if (roleId) {
                        await tx.execute({
                            sql: 'INSERT INTO "UserRole" (userId, roleId) VALUES (?, ?)',
                            args: [userId, roleId]
                        });
                    }
                }
            }

            // Répercuter sur la ligne UserUL de rattachement le SEUL delta sur INACTIF.
            //
            // Motif : décocher INACTIF dans l'éditeur global le retire de "UserRole",
            // mais pas d'une CSV home qui le porterait déjà — le compte resterait
            // bloqué et la procédure de déblocage enseignée aux administrateurs
            // échouerait.
            //
            // DELTA, et non écrasement par l'ensemble global : la granularité par UL
            // est délibérée (CHVL sur la home, CADRE ailleurs). Écrire `resolvedRoles`
            // en bloc ferait disparaître sans avertissement les rôles propres de la
            // home, et promouvrait en rôles EFFECTIFS des rôles globaux qui n'étaient
            // qu'un repli — `resolveSessionRoles` ne lit les globaux que si la CSV de
            // l'UL active est vide. C'est le même argument qui protège les UL
            // secondaires, et il vaut tout autant ici.
            //
            // CSV vide laissée vide : la session se replie alors sur les rôles globaux,
            // qui portent déjà le bon INACTIF. Y écrire quoi que ce soit couperait ce
            // repli et changerait les rôles exercés.
            const homeRes = await tx.execute({
                sql: 'SELECT roles FROM "UserUL" WHERE userId = ? AND is_home = 1',
                args: [userId],
            });
            const homeRolesCsv = homeRes.rows[0]?.roles;
            const homeRoles = typeof homeRolesCsv === 'string'
                ? homeRolesCsv.split(',').map(r => r.trim()).filter(Boolean)
                : [];
            if (homeRoles.length > 0) {
                const preserved = homeRoles.filter(r => r !== ROLES.INACTIF && r !== 'GUEST');
                // Ce n'est PAS une décision d'autorisation mais une manipulation de la
                // DONNÉE de rôles : on décide d'écrire ou non INACTIF dans la CSV de
                // l'UL de rattachement. Passer par un prédicat durci serait circulaire —
                // il faut pouvoir constater qu'un compte est marqué inactif précisément
                // pour l'enregistrer comme tel.
                // eslint-disable-next-line no-restricted-syntax -- manipulation de donnée, pas d'autorisation
                const nextHomeRoles = resolvedRoles.includes(ROLES.INACTIF)
                    ? [...preserved, ROLES.INACTIF]
                    : preserved;
                await tx.execute({
                    sql: 'UPDATE "UserUL" SET roles = ? WHERE userId = ? AND is_home = 1',
                    args: [nextHomeRoles.join(',') || null, userId],
                });
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
        const actorRoles = session?.user?.roles || [];
        if (!isAdminOrAbove(actorRoles)) {
            return forbiddenResponse();
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

            const isSuper = isSuperAdmin(actorRoles);
            if (!isSuper) {
                const actorUlId = session?.user?.ulId;
                const userHomeUlRes = await tx.execute({
                    sql: 'SELECT ulId FROM "UserUL" WHERE userId = ? AND is_home = 1',
                    args: [userId],
                });
                const userHomeUlId = userHomeUlRes.rows[0]?.ulId as string | undefined;
                if (userHomeUlId && userHomeUlId !== actorUlId) {
                    await tx.rollback();
                    return forbiddenResponse("Un administrateur local ne peut supprimer qu'un utilisateur appartenant à sa propre Unité Locale.");
                }
            }

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
