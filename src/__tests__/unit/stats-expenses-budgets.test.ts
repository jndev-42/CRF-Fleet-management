import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Le module est unitaire : `@/lib/db` est remplacé par un exécuteur en mémoire
// qui rejoue des lignes canoniques. Aucune base, aucun réseau.
const executeMock = vi.fn();
vi.mock('@/lib/db', () => ({ db: { execute: (...args: unknown[]) => executeMock(...args) } }));

import {
    aggregateByBudget,
    parseExpenseItemsForBudget,
    fetchExpenseStatsData,
    BUDGET_LABEL_NA,
    BUDGET_LABEL_UNKNOWN,
    type ExpenseItemForBudget,
} from '@/lib/stats-expenses';

type SqlStatement = { sql: string; args: unknown[] };

/**
 * Branche l'exécuteur mocké : la première requête (notes) renvoie `reportRows`,
 * la seconde (budgets) renvoie `budgetRows`. Les deux sont émises en parallèle,
 * la discrimination se fait donc sur le SQL, pas sur l'ordre d'appel.
 */
function mockDb(reportRows: Record<string, unknown>[], budgetRows: Record<string, unknown>[]) {
    const statements: SqlStatement[] = [];
    executeMock.mockImplementation((stmt: SqlStatement) => {
        statements.push(stmt);
        if (stmt.sql.includes('"ExpenseBudget"')) {
            return Promise.resolve({ rows: budgetRows });
        }
        return Promise.resolve({ rows: reportRows });
    });
    return statements;
}

function report(overrides: Record<string, unknown> = {}) {
    return {
        id: 'exp-1',
        userId: 'user-1',
        userName: 'Jean Dupont',
        userEmail: 'jean@test.com',
        status: 'traité',
        submittedAt: '2026-07-15T10:00:00Z',
        createdAt: '2026-07-15T10:00:00Z',
        total: 100,
        imputation: 'DLUS',
        customImputation: null,
        items: '[]',
        ...overrides,
    };
}

beforeEach(() => {
    executeMock.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => { });
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('aggregateByBudget', () => {
    it('byBudget agrège la somme des montants de lignes', () => {
        const items: ExpenseItemForBudget[] = [
            { budgetId: 'b-repas', amount: 10 },
            { budgetId: 'b-repas', amount: 15.5 },
            { budgetId: 'b-essence', amount: 40 },
        ];
        const result = aggregateByBudget(items, new Map([['b-repas', 'Repas'], ['b-essence', 'Essence']]));

        expect(result).toHaveLength(2);
        // Tri décroissant sur le montant, comme byImputation.
        expect(result[0]).toMatchObject({ budgetId: 'b-essence', name: 'Essence', amount: 40 });
        expect(result[1]).toMatchObject({ budgetId: 'b-repas', name: 'Repas', amount: 25.5 });
    });

    it('byBudget.count compte des lignes et non des notes', () => {
        const items: ExpenseItemForBudget[] = [
            { budgetId: 'b-repas', amount: 5 },
            { budgetId: 'b-repas', amount: 5 },
            { budgetId: 'b-repas', amount: 5 },
        ];
        const result = aggregateByBudget(items, new Map([['b-repas', 'Repas']]));

        expect(result).toHaveLength(1);
        expect(result[0].count).toBe(3);
    });

    it('les lignes sans budgetId sont agrégées sous N/A', () => {
        const items: ExpenseItemForBudget[] = [
            { budgetId: null, amount: 30 },
            { budgetId: null, amount: 20 },
            { budgetId: 'b-repas', amount: 50 },
        ];
        const result = aggregateByBudget(items, new Map([['b-repas', 'Repas']]));

        const na = result.find((r) => r.name === BUDGET_LABEL_NA);
        expect(na).toBeDefined();
        expect(na?.budgetId).toBeNull();
        expect(na?.amount).toBe(50);
        expect(na?.count).toBe(2);
    });

    it('un budget archivé conserve son nom exact dans byBudget', () => {
        // « Essence » a été archivé : la résolution des noms le renvoie quand même,
        // sans suffixe ni mention d'archivage.
        const result = aggregateByBudget(
            [{ budgetId: 'b-essence', amount: 12 }],
            new Map([['b-essence', 'Essence']]),
        );

        expect(result[0].name).toBe('Essence');
        expect(result[0].name).not.toContain('archiv');
    });

    it('un budgetId non résolu sort sous Budget inconnu et non sous N/A', () => {
        const items: ExpenseItemForBudget[] = [
            { budgetId: null, amount: 10 },
            { budgetId: 'b-fantome', amount: 90 },
        ];
        const result = aggregateByBudget(items, new Map([['b-repas', 'Repas']]));

        const unknown = result.find((r) => r.name === BUDGET_LABEL_UNKNOWN);
        const na = result.find((r) => r.name === BUDGET_LABEL_NA);

        expect(unknown).toBeDefined();
        // L'id fautif est conservé : c'est le seul moyen de tracer l'anomalie.
        expect(unknown?.budgetId).toBe('b-fantome');
        expect(unknown?.amount).toBe(90);
        // Jamais fondue dans l'historique légitime.
        expect(na).toBeDefined();
        expect(na?.amount).toBe(10);
        expect(console.warn).toHaveBeenCalled();
    });

    it('deux références non résolues restent deux entrées distinctes', () => {
        const result = aggregateByBudget(
            [{ budgetId: 'b-x', amount: 1 }, { budgetId: 'b-y', amount: 2 }],
            new Map(),
        );

        expect(result).toHaveLength(2);
        expect(result.every((r) => r.name === BUDGET_LABEL_UNKNOWN)).toBe(true);
        expect(result.map((r) => r.budgetId).sort()).toEqual(['b-x', 'b-y']);
    });

    it('retourne un tableau vide sans lignes et ne divise jamais par zéro', () => {
        expect(aggregateByBudget([], new Map())).toEqual([]);
    });
});

describe('parseExpenseItemsForBudget', () => {
    it('une ligne au montant non numérique est ignorée', () => {
        const items = parseExpenseItemsForBudget(
            JSON.stringify([
                { label: 'Repas', amount: 10, budgetId: 'b-repas' },
                { label: 'Cassé', amount: 'abc', budgetId: 'b-repas' },
                { label: 'Vide', budgetId: 'b-repas' },
            ]),
            'exp-1',
        );

        expect(items).toEqual([{ budgetId: 'b-repas', amount: 10 }]);
        expect(console.warn).toHaveBeenCalled();
    });

    it('un items illisible est ignoré sans faire échouer l’agrégation', () => {
        expect(parseExpenseItemsForBudget('{pas du json', 'exp-1')).toEqual([]);
        expect(parseExpenseItemsForBudget('{"a":1}', 'exp-1')).toEqual([]);
        expect(parseExpenseItemsForBudget(null, 'exp-1')).toEqual([]);
        expect(aggregateByBudget(parseExpenseItemsForBudget('{pas du json'), new Map())).toEqual([]);
    });

    it('normalise un budgetId absent ou vide en null', () => {
        const items = parseExpenseItemsForBudget(
            JSON.stringify([{ amount: 1 }, { amount: 2, budgetId: '' }, { amount: 3, budgetId: null }]),
        );
        expect(items).toEqual([
            { budgetId: null, amount: 1 },
            { budgetId: null, amount: 2 },
            { budgetId: null, amount: 3 },
        ]);
    });
});

describe('fetchExpenseStatsData — byBudget', () => {
    it('les pourcentages somment à 100 sur une base divergente du total de note', async () => {
        // exp-1 porte total = 150 SANS aucune ligne (cas réel du jeu d'intégration) :
        // la base des pourcentages doit être la somme des lignes (75), pas 225.
        mockDb(
            [
                report({ id: 'exp-1', total: 150, items: '[]' }),
                report({
                    id: 'exp-2',
                    total: 75,
                    items: JSON.stringify([
                        { label: 'Repas', amount: 25, budgetId: 'b-repas' },
                        { label: 'Essence', amount: 50, budgetId: 'b-essence' },
                    ]),
                }),
            ],
            [{ id: 'b-repas', name: 'Repas' }, { id: 'b-essence', name: 'Essence' }],
        );

        const data = await fetchExpenseStatsData('2026-07-01', '2026-07-31', { ulId: 'ul-paris-18' });

        expect(data.global.totalExpensesAmount).toBe(225);
        const sum = data.byBudget.reduce((acc, b) => acc + b.percentOfTotal, 0);
        expect(sum).toBe(100);
        expect(data.byBudget.find((b) => b.name === 'Essence')?.percentOfTotal).toBe(67);
        expect(data.byBudget.find((b) => b.name === 'Repas')?.percentOfTotal).toBe(33);
    });

    it('l’objet global conserve exactement ses clés d’origine', async () => {
        mockDb([report()], []);

        const data = await fetchExpenseStatsData('2026-07-01', '2026-07-31', { ulId: 'ul-paris-18' });

        expect(Object.keys(data.global).sort()).toEqual([
            'avgReportAmount',
            'reportsCount',
            'totalExpensesAmount',
            'totalPendingAmount',
            'totalRefundedAmount',
        ]);
    });

    it('la requête de résolution des noms ne filtre jamais sur archived', async () => {
        const statements = mockDb([report()], [{ id: 'b-repas', name: 'Repas' }]);

        await fetchExpenseStatsData('2026-07-01', '2026-07-31', { ulId: 'ul-paris-18' });

        const budgetStmt = statements.find((s) => s.sql.includes('"ExpenseBudget"'));
        expect(budgetStmt).toBeDefined();
        expect(budgetStmt?.sql).not.toContain('archived');
        // Scopée sur l'UL demandée : aucune fuite inter-UL.
        expect(budgetStmt?.args).toEqual(['ul-paris-18']);
    });

    it('charge tous les budgets quand aucune UL n’est filtrée', async () => {
        const statements = mockDb([report()], []);

        await fetchExpenseStatsData('2026-07-01', '2026-07-31');

        const budgetStmt = statements.find((s) => s.sql.includes('"ExpenseBudget"'));
        expect(budgetStmt?.sql).not.toContain('WHERE');
        expect(budgetStmt?.args).toEqual([]);
    });

    it('une note au JSON items illisible n’interrompt pas l’agrégation', async () => {
        mockDb(
            [
                report({ id: 'exp-cassee', items: 'ceci nest pas du json' }),
                report({ id: 'exp-ok', items: JSON.stringify([{ label: 'Repas', amount: 20, budgetId: 'b-repas' }]) }),
            ],
            [{ id: 'b-repas', name: 'Repas' }],
        );

        const data = await fetchExpenseStatsData('2026-07-01', '2026-07-31', { ulId: 'ul-paris-18' });

        expect(data.byBudget).toHaveLength(1);
        expect(data.byBudget[0]).toMatchObject({ name: 'Repas', amount: 20, count: 1, percentOfTotal: 100 });
    });
});
