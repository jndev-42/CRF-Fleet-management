import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { unauthorizedResponse } from '@/lib/apiAuth';
import { getLicenseStatus, type LicenseRow } from '@/lib/licenseStatus';
import { holdsDriverRole } from '@/lib/licenseLifecycle';

/** GET /api/me/license-check
 *
 * Vérifie la validité des papiers du compte connecté. Seuls les chauffeurs (CHVL /
 * CHVPSP, lus en base) y sont soumis : un autre compte, administrateur compris, reçoit
 * `{ required: false, validated: false, daysLeft: null, blocked: false }` sans écriture.
 *
 * Logique :
 * 1. Si last_validation est NULL ou date d'il y a plus de 6 mois :
 *    - papiers_valides = 0
 *    - start_date_invalidation_process = aujourd'hui (seulement si pas déjà défini)
 * 2. Si papiers_valides = 0 et que today > start_date_invalidation_process + 14 jours :
 *    - L'utilisateur est BLOQUÉ
 *
 * Retourne : { required: boolean (true pour un chauffeur, false pour un non-chauffeur), validated, daysLeft, blocked }
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        const userId = session.user.id;
        if (!userId) {
            return NextResponse.json({ error: 'Identifiant utilisateur manquant' }, { status: 400 });
        }

        const userRes = await db.execute({
            sql: `SELECT papiers_valides, last_validation, start_date_invalidation_process FROM "User" WHERE id = ?`,
            args: [userId],
        });

        if (userRes.rows.length === 0) {
            return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });
        }

        if (!(await holdsDriverRole(db, userId))) {
            return NextResponse.json({ required: false, validated: false, daysLeft: null, blocked: false });
        }

        const row = userRes.rows[0] as unknown as LicenseRow;
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

        const status = getLicenseStatus(row, today);

        // Matérialise l'invalidation en base. La décision elle-même est pure
        // (`@/lib/licenseStatus`) pour que la garde de `POST /api/trips` puisse la
        // rejouer sans écrire.
        if (status.startDateToPersist) {
            if (status.justInvalidated) {
                await db.execute({
                    sql: `UPDATE "User"
                          SET papiers_valides = 0,
                              start_date_invalidation_process = ?
                          WHERE id = ?`,
                    args: [status.startDateToPersist, userId],
                });
            } else {
                await db.execute({
                    sql: `UPDATE "User" SET start_date_invalidation_process = ? WHERE id = ?`,
                    args: [status.startDateToPersist, userId],
                });
            }
        }

        return NextResponse.json({
            required: true,
            validated: status.validated,
            daysLeft: status.daysLeft,
            blocked: status.blocked,
        });
    } catch (error) {
        console.error('Error checking license:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la vérification des papiers' },
            { status: 500 }
        );
    }
}
