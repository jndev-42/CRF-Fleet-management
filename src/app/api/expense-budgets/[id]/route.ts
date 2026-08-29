import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { isSuperAdmin, canManageExpenseBudgets } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';

const renameBudgetSchema = z.object({
    name: z.string().trim().min(1, 'Le nom du budget est requis'),
});

/**
 * Charge un budget et vérifie qu'il relève du périmètre de l'appelant.
 *
 * Un budget d'une autre UL est traité comme inexistant (404) plutôt que comme
 * interdit (403) : la seule existence d'un budget d'une UL tierce n'a pas à
 * fuiter. Un SUPER_ADMIN n'est pas restreint à son UL.
 */
async function loadScopedBudget(id: string, roles: string[], sessionUlId: string) {
    const result = await db.execute({
        sql: `SELECT id, ulId, name, archived FROM "ExpenseBudget" WHERE id = ?`,
        args: [id],
    });
    const row = result.rows[0];
    if (!row) return null;
    if (!isSuperAdmin(roles) && String(row.ulId) !== sessionUlId) return null;
    return { id: String(row.id), ulId: String(row.ulId), name: String(row.name), archived: Number(row.archived) === 1 };
}

/** PATCH /api/expense-budgets/[id] — Renommer un budget analytique */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        const roles = session.user.roles || [];
        if (!canManageExpenseBudgets(roles)) {
            return forbiddenResponse();
        }

        let data: z.infer<typeof renameBudgetSchema>;
        try {
            data = renameBudgetSchema.parse(await request.json());
        } catch (e) {
            if (e instanceof z.ZodError) {
                return NextResponse.json({ error: 'Données invalides', details: e.issues }, { status: 400 });
            }
            return NextResponse.json({ error: 'Corps invalide' }, { status: 400 });
        }

        const { id } = await params;
        const budget = await loadScopedBudget(id, roles, session.user.ulId || 'ul-paris-18');
        if (!budget) {
            return NextResponse.json({ error: 'Budget non trouvé.' }, { status: 404 });
        }

        // Le renommage est le cas de collision le plus fréquent en usage réel :
        // même garde qu'à la création, sur l'UL du budget et hors lui-même.
        const duplicate = await db.execute({
            sql: `SELECT id FROM "ExpenseBudget" WHERE ulId = ? AND archived = 0 AND id != ? AND name = ? COLLATE NOCASE`,
            args: [budget.ulId, budget.id, data.name],
        });
        if (duplicate.rows.length > 0) {
            return NextResponse.json({ error: 'Un budget porte déjà ce nom.' }, { status: 400 });
        }

        const now = new Date().toISOString();
        await db.execute({
            sql: `UPDATE "ExpenseBudget" SET name = ?, updatedAt = ? WHERE id = ?`,
            args: [data.name, now, budget.id],
        });

        return NextResponse.json({ id: budget.id, ulId: budget.ulId, name: data.name, archived: budget.archived, updatedAt: now });
    } catch (error) {
        console.error('[PATCH /api/expense-budgets/:id]', error);
        return NextResponse.json({ error: 'Erreur serveur lors du renommage du budget.' }, { status: 500 });
    }
}

/**
 * DELETE /api/expense-budgets/[id] — Archiver un budget analytique.
 *
 * Archivage, jamais suppression : un budget supprimé en 2027 réécrirait le bilan
 * 2025, les statistiques résolvant les noms y compris pour les budgets archivés.
 * Cette route ne touche à aucun `ExpenseReport.items`.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        const roles = session.user.roles || [];
        if (!canManageExpenseBudgets(roles)) {
            return forbiddenResponse();
        }

        const { id } = await params;
        const budget = await loadScopedBudget(id, roles, session.user.ulId || 'ul-paris-18');
        if (!budget) {
            return NextResponse.json({ error: 'Budget non trouvé.' }, { status: 404 });
        }

        // Une UL sans budget actif ne peut plus produire AUCUNE note de frais :
        // l'archivage du dernier budget verrouillerait l'UL entière.
        const active = await db.execute({
            sql: `SELECT COUNT(*) AS n FROM "ExpenseBudget" WHERE ulId = ? AND archived = 0`,
            args: [budget.ulId],
        });
        if (Number(active.rows[0]?.n ?? 0) <= 1) {
            return NextResponse.json({
                error: "Impossible d'archiver le dernier budget actif de l'UL : au moins un budget est requis pour saisir une note de frais.",
            }, { status: 400 });
        }

        await db.execute({
            sql: `UPDATE "ExpenseBudget" SET archived = 1, updatedAt = ? WHERE id = ?`,
            args: [new Date().toISOString(), budget.id],
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[DELETE /api/expense-budgets/:id]', error);
        return NextResponse.json({ error: "Erreur serveur lors de l'archivage du budget." }, { status: 500 });
    }
}
