import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { isAdminOrAbove, canAccessAdminPanel, isSuperAdmin } from '@/lib/roles';
import { forbiddenResponse } from '@/lib/apiAuth';

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
        if (!canAccessAdminPanel(session?.user?.roles || [])) {
            return forbiddenResponse();
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
        const actorRoles = session?.user?.roles || [];
        if (!isAdminOrAbove(actorRoles)) {
            return forbiddenResponse();
        }

        const { email } = await params;
        const decodedEmail = decodeURIComponent(email);
        const body = await request.json();
        const data = ulAssignSchema.parse(body);

        const userRes = await db.execute({ sql: `SELECT id FROM "User" WHERE email = ?`, args: [decodedEmail] });
        if (userRes.rows.length === 0) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });

        const userId = userRes.rows[0].id as string;

        const isSuper = isSuperAdmin(actorRoles);
        const actorUlId = session?.user?.ulId;

        if (!isSuper) {
            if (data.ulId !== actorUlId) {
                return forbiddenResponse("Un administrateur local ne peut gérer les rattachements que pour sa propre Unité Locale.");
            }
            if (data.isHome) {
                const userHomeUlRes = await db.execute({
                    sql: 'SELECT ulId FROM "UserUL" WHERE userId = ? AND is_home = 1',
                    args: [userId],
                });
                const userHomeUlId = userHomeUlRes.rows[0]?.ulId as string | undefined;
                if (userHomeUlId && userHomeUlId !== actorUlId) {
                    return forbiddenResponse("L'utilisateur appartient déjà à une autre Unité Locale.");
                }
            }
        }

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
        const actorRoles = session?.user?.roles || [];
        if (!isAdminOrAbove(actorRoles)) {
            return forbiddenResponse();
        }

        const { email } = await params;
        const decodedEmail = decodeURIComponent(email);
        const body = await request.json();
        const data = bulkULSchema.parse(body);

        const userRes = await db.execute({ sql: `SELECT id FROM "User" WHERE email = ?`, args: [decodedEmail] });
        if (userRes.rows.length === 0) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });

        const userId = userRes.rows[0].id as string;

        const isSuper = isSuperAdmin(actorRoles);
        const actorUlId = session?.user?.ulId;

        // Fetch existing UserUL entries from database
        const existingRes = await db.execute({
            sql: `SELECT ulId, is_home, roles FROM "UserUL" WHERE userId = ?`,
            args: [userId],
        });
        const existingMap = new Map<string, { isHome: boolean; roles: string[] }>();
        let existingHomeUlId: string | null = null;
        for (const row of existingRes.rows) {
            const uId = row.ulId as string;
            const isHome = !!row.is_home;
            const rList = row.roles ? (row.roles as string).split(',').map(r => r.trim()).filter(Boolean) : [];
            existingMap.set(uId, { isHome, roles: rList });
            if (isHome) {
                existingHomeUlId = uId;
            }
        }

        let mergedUls: { ulId: string; isHome: boolean; roles: string[] }[] = [];

        if (isSuper) {
            mergedUls = data.uls;
        } else {
            if (!actorUlId) {
                return forbiddenResponse();
            }
            // Keep all existing entries for other ULs exactly as-is
            for (const [uId, entry] of existingMap.entries()) {
                if (uId !== actorUlId) {
                    mergedUls.push({ ulId: uId, isHome: entry.isHome, roles: entry.roles });
                }
            }
            // Add/modify entry for actorUlId if present in payload
            const payloadEntry = data.uls.find(item => item.ulId === actorUlId);
            if (payloadEntry) {
                let isHomeVal = payloadEntry.isHome;
                if (existingHomeUlId && existingHomeUlId !== actorUlId) {
                    isHomeVal = false; // Force false because the user belongs to another UL
                }
                mergedUls.push({ ulId: actorUlId, isHome: isHomeVal, roles: payloadEntry.roles });
            }
        }

        const tx = await db.transaction('write');
        try {
            // Supprimer tous les droits actuels
            await tx.execute({
                sql: `DELETE FROM "UserUL" WHERE userId = ?`,
                args: [userId],
            });

            // Insérer les nouveaux droits fusionnés
            for (const item of mergedUls) {
                const rolesStr = item.roles.join(',');
                await tx.execute({
                    sql: `INSERT INTO "UserUL" (userId, ulId, is_home, roles) VALUES (?, ?, ?, ?)`,
                    args: [userId, item.ulId, item.isHome ? 1 : 0, rolesStr || null],
                });

                // Si c'est l'UL d'appartenance (home), synchroniser avec les rôles globaux (UserRole)
                // Seulement si c'est le super admin OR si c'est la sienne (actorUlId)
                if (item.isHome && (isSuper || item.ulId === actorUlId)) {
                    // Supprimer les rôles globaux existants
                    await tx.execute({
                        sql: `DELETE FROM "UserRole" WHERE userId = ?`,
                        args: [userId],
                    });

                    // Insérer les nouveaux rôles globaux — un seul lookup batché au lieu d'un par rôle
                    if (item.roles.length > 0) {
                        const placeholders = item.roles.map(() => '?').join(', ');
                        const roleRes = await tx.execute({
                            sql: `SELECT id, name FROM "Role" WHERE name IN (${placeholders}) OR id IN (${placeholders})`,
                            args: [...item.roles, ...item.roles],
                        });
                        const roleIdByNameOrId = new Map<string, string>();
                        for (const r of roleRes.rows) {
                            roleIdByNameOrId.set(r.name as string, r.id as string);
                            roleIdByNameOrId.set(r.id as string, r.id as string);
                        }
                        for (const roleName of item.roles) {
                            const roleId = roleIdByNameOrId.get(roleName);
                            if (roleId) {
                                await tx.execute({
                                    sql: 'INSERT INTO "UserRole" (userId, roleId) VALUES (?, ?)',
                                    args: [userId, roleId]
                                });
                            }
                        }
                    }
                }
            }

            // Si un rôle chauffeur (CHVL / CHVPSP) est présent et les papiers n'ont jamais été validés,
            // s'assurer que papiers_valides = 0 et start_date_invalidation_process est initialisé.
            const allAssignedRoles = mergedUls.flatMap(u => u.roles);
            const isDriverNow = allAssignedRoles.some(r => r === 'CHVL' || r === 'CHVPSP');
            if (isDriverNow) {
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
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Données invalides', details: error.issues }, { status: 400 });
        }
        console.error('Error batch updating user ULs:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
