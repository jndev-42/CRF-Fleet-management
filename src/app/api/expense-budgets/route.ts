import { NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { isSuperAdmin, isInactive, canManageExpenseBudgets } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';

const createBudgetSchema = z.object({
    name: z.string().trim().min(1, 'Le nom du budget est requis'),
});

/**
 * Résout l'UL à cibler.
 *
 * Le paramètre `?ulId=` est honoré pour un SUPER_ADMIN **et pour tout membre de
 * l'UL demandée** : un bénévole multi-UL peut éditer un brouillon d'une UL qui
 * n'est pas son UL active (le scope « my » de /api/expenses ne filtre pas sur
 * l'UL, et l'édition d'un brouillon n'exige que d'en être propriétaire). Sans ce
 * gate élargi, son formulaire proposerait les budgets de la mauvaise UL et le
 * serveur les refuserait — impasse sans issue sur sa propre note.
 *
 * Un `ulId` dont l'utilisateur n'est pas membre est **silencieusement ignoré**,
 * jamais rejeté : on retombe sur l'UL de session. Aucune fuite inter-UL possible,
 * l'appartenance étant vérifiée contre `availableULs`, construite côté serveur.
 */
function resolveUlId(
    requested: string | null,
    session: { user: { roles?: string[]; ulId?: string | null; availableULs?: { id: string }[] } },
): string {
    const roles = session.user.roles || [];
    const isMember = !!requested && (session.user.availableULs ?? []).some(ul => ul.id === requested);
    if (requested && (isSuperAdmin(roles) || isMember)) return requested;
    return session.user.ulId || 'ul-paris-18';
}

/** GET /api/expense-budgets — Budgets analytiques actifs d'une UL, triés par nom */
export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        const roles = session.user.roles || [];
        if (isInactive(roles)) {
            return forbiddenResponse();
        }

        const { searchParams } = new URL(request.url);
        const ulId = resolveUlId(searchParams.get('ulId'), session);

        const result = await db.execute({
            sql: `SELECT id, ulId, name, archived, createdAt, updatedAt
                  FROM "ExpenseBudget"
                  WHERE ulId = ? AND archived = 0
                  ORDER BY name ASC`,
            args: [ulId],
        });

        const budgets = result.rows.map(row => ({
            id: String(row.id),
            ulId: String(row.ulId),
            name: String(row.name),
            archived: Number(row.archived) === 1,
            createdAt: row.createdAt ? String(row.createdAt) : '',
            updatedAt: row.updatedAt ? String(row.updatedAt) : '',
        }));

        return NextResponse.json(budgets);
    } catch (error) {
        console.error('[GET /api/expense-budgets]', error);
        return NextResponse.json({ error: 'Erreur serveur lors de la récupération des budgets.' }, { status: 500 });
    }
}

/** POST /api/expense-budgets — Créer un budget analytique dans une UL */
export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        const roles = session.user.roles || [];
        if (!canManageExpenseBudgets(roles)) {
            return forbiddenResponse();
        }

        let data: z.infer<typeof createBudgetSchema>;
        try {
            data = createBudgetSchema.parse(await request.json());
        } catch (e) {
            if (e instanceof z.ZodError) {
                return NextResponse.json({ error: 'Données invalides', details: e.issues }, { status: 400 });
            }
            return NextResponse.json({ error: 'Corps invalide' }, { status: 400 });
        }

        const { searchParams } = new URL(request.url);
        const ulId = resolveUlId(searchParams.get('ulId'), session);

        // Garde applicative plus stricte que l'index partiel : elle attrape aussi
        // la différence de casse. L'index reste le filet contre la concurrence.
        const duplicate = await db.execute({
            sql: `SELECT id FROM "ExpenseBudget" WHERE ulId = ? AND archived = 0 AND name = ? COLLATE NOCASE`,
            args: [ulId, data.name],
        });
        if (duplicate.rows.length > 0) {
            return NextResponse.json({ error: 'Un budget porte déjà ce nom.' }, { status: 400 });
        }

        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        await db.execute({
            sql: `INSERT INTO "ExpenseBudget" (id, ulId, name, archived, createdAt, updatedAt) VALUES (?, ?, ?, 0, ?, ?)`,
            args: [id, ulId, data.name, now, now],
        });

        return NextResponse.json({
            id, ulId, name: data.name, archived: false, createdAt: now, updatedAt: now,
        }, { status: 201 });
    } catch (error) {
        console.error('[POST /api/expense-budgets]', error);
        return NextResponse.json({ error: 'Erreur serveur lors de la création du budget.' }, { status: 500 });
    }
}
