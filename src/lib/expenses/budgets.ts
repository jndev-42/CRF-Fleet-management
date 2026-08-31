/**
 * Budgets analytiques des notes de frais — définitions partagées.
 *
 * ⚠️ Contrainte dure : ce module n'importe AUCUN alias `@/…`.
 * Il est consommé à la fois par l'application (`@/lib/expenses/budgets`) et par
 * des scripts exécutés hors du bundler Next (`scripts/add-expense-budgets.ts`,
 * `scripts/setup-dev.ts`) qui l'importent par chemin relatif. Un import `@/`
 * casserait ces scripts.
 */
import type { InStatement, ResultSet } from '@libsql/client';

/** Budgets semés à la création d'une UL, et par la migration de rattrapage. */
export const DEFAULT_EXPENSE_BUDGETS = [
    'Repas',
    'Matériel',
    'Entretien véhicule',
    'Entretien local',
    'Essence',
] as const;

/** Ligne de la table `ExpenseBudget`. */
export interface ExpenseBudget {
    id: string;
    ulId: string;
    name: string;
    archived: boolean;
    createdAt: string;
    updatedAt: string;
}

/**
 * Exécuteur SQL minimal.
 *
 * Type structurel volontairement réduit à `execute` : il accepte le client `db`
 * de `@/lib/db`, une transaction libsql (`db.transaction('write')`) et le
 * `createClient` d'un script, sans recourir à `any`.
 */
export interface BudgetExecutor {
    execute(stmt: InStatement): Promise<unknown>;
}

/**
 * Sème les budgets par défaut d'une UL.
 *
 * N'effectue AUCUN contrôle d'existence : l'appelant décide s'il faut semer
 * (création d'UL, ou rattrapage sur une UL sans aucun budget).
 *
 * @returns le nombre de budgets créés.
 */
export async function seedDefaultBudgets(
    exec: BudgetExecutor,
    ulId: string,
    now: string,
): Promise<number> {
    for (const name of DEFAULT_EXPENSE_BUDGETS) {
        await exec.execute({
            sql: `INSERT INTO "ExpenseBudget" (id, ulId, name, archived, createdAt, updatedAt)
                  VALUES (?, ?, ?, 0, ?, ?)`,
            args: [crypto.randomUUID(), ulId, name, now, now],
        });
    }
    return DEFAULT_EXPENSE_BUDGETS.length;
}

/**
 * Exécuteur SQL de lecture.
 *
 * Distinct de `BudgetExecutor` : la validation référentielle a besoin des lignes
 * retournées, là où le seed se contente d'écrire.
 */
export interface BudgetReader {
    execute(stmt: InStatement): Promise<ResultSet>;
}

/**
 * Valide que chaque ligne soumise référence un budget existant de l'UL DE LA NOTE.
 *
 * Sans ce contrôle, un `budgetId` arbitraire entrerait en base et ressortirait
 * nommé dans les statistiques d'une UL tierce : le JSON `items` n'offre aucune
 * intégrité référentielle (les FK ne sont pas appliquées dans ce repo).
 *
 * Tolérance sur l'archivé : un budget archivé est refusé s'il est NOUVEAU, mais
 * accepté s'il figure déjà dans les `items` stockés de la note. Cela traite le
 * cas d'un budget archivé pendant qu'un bénévole avait son brouillon ouvert.
 *
 * @param ulId          UL de la note, jamais celle de la session.
 * @param storedBudgetIds budgetIds déjà présents dans les `items` stockés.
 * @returns un message d'erreur français nommant la ligne fautive, ou `null`.
 */
export async function validateItemBudgets(
    exec: BudgetReader,
    ulId: string,
    items: { budgetId: string }[],
    storedBudgetIds: ReadonlySet<string> = new Set(),
): Promise<string | null> {
    const distinctIds = [...new Set(items.map(item => item.budgetId))];
    if (distinctIds.length === 0) return null;

    // Autant de « ? » que d'ids : l'interpolation ne porte que sur des placeholders.
    const placeholders = distinctIds.map(() => '?').join(', ');
    const result = await exec.execute({
        sql: `SELECT id, name, archived FROM "ExpenseBudget" WHERE ulId = ? AND id IN (${placeholders})`,
        args: [ulId, ...distinctIds],
    });

    const known = new Map<string, { name: string; archived: boolean }>();
    for (const row of result.rows) {
        known.set(String(row.id), { name: String(row.name), archived: Number(row.archived) === 1 });
    }

    for (let i = 0; i < items.length; i++) {
        const budget = known.get(items[i].budgetId);
        // Indice 1-based : le message doit être actionnable par l'utilisateur.
        if (!budget) {
            return `Ligne ${i + 1} : budget inconnu.`;
        }
        if (budget.archived && !storedBudgetIds.has(items[i].budgetId)) {
            return `Ligne ${i + 1} : le budget « ${budget.name} » est archivé et ne peut plus être utilisé.`;
        }
    }

    return null;
}
