import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { unauthorizedResponse } from '@/lib/apiAuth';

const DRIVER_ROLES = ['CHVL', 'CHVPSP'];
const INVALIDATION_GRACE_DAYS = 14;
const VALIDATION_VALIDITY_DAYS = 182; // 2 fois par an (~6 mois)

/** GET /api/me/license-check
 *
 * Vérifie la validité des papiers du conducteur connecté.
 * Applicable uniquement aux rôles CHVL et CHVPSP.
 *
 * Logique :
 * 1. Si last_validation est NULL ou date d'il y a plus de 6 mois :
 *    - papiers_valides = 0
 *    - start_date_invalidation_process = aujourd'hui (seulement si pas déjà défini)
 * 2. Si papiers_valides = 0 et que today > start_date_invalidation_process + 14 jours :
 *    - L'utilisateur est BLOQUÉ
 *
 * Retourne : { validated: boolean, daysLeft: number | null, blocked: boolean }
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        const roles = session.user.roles || [];
        const isDriver = roles.some(r => DRIVER_ROLES.includes(r));

        if (!isDriver) {
            // Non-drivers are always considered valid
            return NextResponse.json({ validated: true, daysLeft: null, blocked: false });
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

        const row = userRes.rows[0];
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

        let papiersValides = Number(row.papiers_valides ?? 1);
        const lastValidation = (row.last_validation as string | null | undefined) ?? null;
        let startDateInvalidation = (row.start_date_invalidation_process as string | null | undefined) ?? null;

        // Check if validation has expired (null or older than 1 year)
        const validationExpired =
            lastValidation === null ||
            new Date(lastValidation).getTime() + VALIDATION_VALIDITY_DAYS * 24 * 60 * 60 * 1000 <
                new Date(today).getTime();

        if (validationExpired && papiersValides === 1) {
            // Transition: previously valid → now invalidated
            papiersValides = 0;
            startDateInvalidation = today;

            await db.execute({
                sql: `UPDATE "User"
                      SET papiers_valides = 0,
                          start_date_invalidation_process = ?
                      WHERE id = ?`,
                args: [today, userId],
            });
        } else if (validationExpired && papiersValides === 0 && startDateInvalidation === null) {
            // Already invalid but no start date recorded — set it now
            startDateInvalidation = today;
            await db.execute({
                sql: `UPDATE "User" SET start_date_invalidation_process = ? WHERE id = ?`,
                args: [today, userId],
            });
        }

        const validated = papiersValides === 1;

        if (validated) {
            return NextResponse.json({ validated: true, daysLeft: null, blocked: false });
        }

        // Calculate days left before blocking
        let daysLeft: number | null = null;
        let blocked = false;

        if (startDateInvalidation) {
            const blockDate = new Date(startDateInvalidation);
            blockDate.setDate(blockDate.getDate() + INVALIDATION_GRACE_DAYS);
            const todayDate = new Date(today);
            const msLeft = blockDate.getTime() - todayDate.getTime();
            const rawDaysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
            daysLeft = Math.max(0, rawDaysLeft);
            blocked = daysLeft === 0;
        }

        return NextResponse.json({ validated: false, daysLeft, blocked });
    } catch (error) {
        console.error('Error checking license:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la vérification des papiers' },
            { status: 500 }
        );
    }
}
