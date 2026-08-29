import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ExpenseStatsBudgetBlock from '@/components/stats/ExpenseStatsBudgetBlock';
import type { ExpenseStatsDataResult } from '@/lib/stats-expenses';

const byBudget: ExpenseStatsDataResult['byBudget'] = [
    { budgetId: 'b-essence', name: 'Essence', amount: 120.5, count: 3, percentOfTotal: 60 },
    { budgetId: 'b-repas', name: 'Repas', amount: 60.25, count: 2, percentOfTotal: 30 },
    { budgetId: null, name: 'N/A', amount: 20, count: 1, percentOfTotal: 10 },
];

describe('ExpenseStatsBudgetBlock', () => {
    it('ExpenseStatsBudgetBlock affiche le tableau et le graphique', () => {
        const { container } = render(<ExpenseStatsBudgetBlock byBudget={byBudget} />);

        expect(screen.getByText('Répartition par budget')).toBeTruthy();
        expect(screen.getByText('Essence')).toBeTruthy();
        expect(screen.getByText('Repas')).toBeTruthy();
        expect(screen.getByText('120.50 €')).toBeTruthy();
        expect(screen.getByText('60 %')).toBeTruthy();
        // Le camembert est monté dans son ResponsiveContainer (recharts ne dessine
        // pas de SVG sous jsdom, faute de dimensions mesurables).
        expect(container.querySelector('.recharts-responsive-container')).toBeTruthy();
    });

    it('intitule la colonne « Lignes » et non « Notes »', () => {
        render(<ExpenseStatsBudgetBlock byBudget={byBudget} />);

        expect(screen.getByText('Lignes')).toBeTruthy();
        expect(screen.queryByText('Notes')).toBeNull();
        expect(screen.getByText('Budget')).toBeTruthy();
        expect(screen.getByText('Part %')).toBeTruthy();
    });

    it('affiche les lignes historiques sous N/A', () => {
        render(<ExpenseStatsBudgetBlock byBudget={byBudget} />);
        expect(screen.getByText('N/A')).toBeTruthy();
    });

    it('affiche un état vide sans ligne de dépense', () => {
        render(<ExpenseStatsBudgetBlock byBudget={[]} />);
        expect(screen.getByText('Aucune ligne de dépense sur cette période')).toBeTruthy();
        expect(screen.queryByText('Lignes')).toBeNull();
    });
});
