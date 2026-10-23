import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { canAccessAdminPanel, isSuperAdmin } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { withAudit } from '@/lib/audit/log';

/** PATCH /api/users/[email]/validate-papers
 *
 * Marque les papiers d'un utilisateur comme validés (tout compte qui emprunte, pas seulement les chauffeurs).
 * Accessible via `canAccessAdminPanel` uniquement (SUPER_ADMIN, ADMIN, PRESIDENT, CADRE).
 * Jamais sur soi-même, quel que soit le rôle : aucun rôle n'est dispensé du contrôle
 * des papiers, s'auto-valider le contournerait.
 *
 * Cloisonnement UL (hors SUPER_ADMIN) : la cible doit être membre de l'UL active de
 * l'acteur (ligne `UserUL`, de rattachement ou secondaire), ou n'avoir aucune UL. Sinon
 * 404 avec un message explicite : la page Utilisateurs affiche la cible, un « introuvable »
 * passerait pour un bug. Une session sans UL (absente ou `'default'`) ne valide donc que
 * les comptes sans UL. Un ADMIN peut d'abord rattacher la cible à son UL en membre
 * secondaire (PATCH /api/users/[email]/ul), puis la valider : c'est voulu.
 *
 * Effets :
 * - papiers_valides = 1
 * - last_validation = aujourd'hui (YYYY-MM-DD)
 * - start_date_invalidation_process = NULL
 */
async function patchHandler(
    _request: Request,
    { params }: { params: Promise<{ email: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        const roles = session.user.roles || [];
        const canValidate = canAccessAdminPanel(roles);
        if (!canValidate) {
            return forbiddenResponse();
        }

        const { email: userId } = await params;

        if (session.user.id && session.user.id === userId) {
            return forbiddenResponse('Vous ne pouvez pas valider vos propres papiers');
        }

        const userRes = await db.execute({
            sql: `SELECT id FROM "User" WHERE id = ?`,
            args: [userId],
        });

        if (userRes.rows.length === 0) {
            return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });
        }

        if (!isSuperAdmin(roles)) {
            // `'default'` est un placeholder, pas une UL : il ne doit matcher aucune ligne.
            const sessionUlId = session.user.ulId && session.user.ulId !== 'default' ? session.user.ulId : null;
            const membership = await db.execute({
                sql: `SELECT EXISTS(SELECT 1 FROM "UserUL" WHERE userId = ?) AS hasUl,
                             EXISTS(SELECT 1 FROM "UserUL" WHERE userId = ? AND ulId = ?) AS inUl`,
                args: [userId, userId, sessionUlId],
            });
            const { hasUl, inUl } = membership.rows[0];
            if (Number(hasUl) === 1 && Number(inUl) !== 1) {
                return NextResponse.json({ error: "Ce membre n'appartient pas à votre unité locale" }, { status: 404 });
            }
        }

        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const validatedBy = session.user.name ?? session.user.email ?? null;

        await db.execute({
            sql: `UPDATE "User"
                  SET papiers_valides = 1,
                      last_validation = ?,
                      start_date_invalidation_process = NULL,
                      validated_by = ?
                  WHERE id = ?`,
            args: [today, validatedBy, userId],
        });

        return NextResponse.json({ success: true, last_validation: today, validated_by: validatedBy });
    } catch (error) {
        console.error('Error validating papers:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la validation des papiers' },
            { status: 500 }
        );
    }
}

export const PATCH = withAudit(patchHandler, { action: "Validation des papiers d'un utilisateur", entityType: 'user' });
