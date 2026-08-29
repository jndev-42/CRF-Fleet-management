import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ExpenseStatsSection from '@/components/stats/ExpenseStatsSection';
import type { ExpenseStatsDataResult } from '@/lib/stats-expenses';

const mockData: ExpenseStatsDataResult = {
    period: { from: '2026-01-01', to: '2026-01-31' },
    global: { totalExpensesAmount: 1000, totalRefundedAmount: 600, totalPendingAmount: 400, reportsCount: 5, avgReportAmount: 200 },
    byMonth: [{ month: '2026-01', label: 'Janvier', amount: 1000, count: 5 }],
    byUser: [{ userId: 'u1', userName: 'Jean Dupont', userEmail: 'jean@test.com', totalAmount: 500, paidAmount: 300, reportCount: 2 }],
    byImputation: [{ imputation: 'DLUS', amount: 700, count: 3, percentOfTotal: 70 }],
    byStatus: [{ status: 'valide', label: 'Validé', amount: 600, count: 3 }],
    byBudget: [
        { budgetId: 'b-essence', name: 'Essence', amount: 400, count: 4, percentOfTotal: 57 },
        { budgetId: null, name: 'N/A', amount: 300, count: 2, percentOfTotal: 43 },
    ],
};

function mockFetch(handler: () => Response) {
    const mock = vi.fn().mockImplementation(() => Promise.resolve(handler()));
    vi.spyOn(global, 'fetch').mockImplementation(mock as typeof fetch);
    return mock;
}

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('ExpenseStatsSection', () => {
    it('affiche un état de chargement puis les KPI (happy path)', async () => {
        mockFetch(() => new Response(JSON.stringify({ data: mockData }), { status: 200 }));
        render(<ExpenseStatsSection dateFrom="2026-01-01" dateTo="2026-01-31" onDateFromChange={vi.fn()} onDateToChange={vi.fn()} />);

        expect(await screen.findByText('1000.00 €')).toBeTruthy();
        expect(screen.getByText('600.00 €')).toBeTruthy();
        expect(screen.getByText('5')).toBeTruthy();
    });

    it('affiche le tableau par demandeur', async () => {
        mockFetch(() => new Response(JSON.stringify({ data: mockData }), { status: 200 }));
        render(<ExpenseStatsSection dateFrom="2026-01-01" dateTo="2026-01-31" onDateFromChange={vi.fn()} onDateToChange={vi.fn()} />);

        expect(await screen.findByText('Jean Dupont')).toBeTruthy();
        expect(screen.getByText('jean@test.com')).toBeTruthy();
    });

    it('affiche le bloc de répartition par budget', async () => {
        mockFetch(() => new Response(JSON.stringify({ data: mockData }), { status: 200 }));
        render(<ExpenseStatsSection dateFrom="2026-01-01" dateTo="2026-01-31" onDateFromChange={vi.fn()} onDateToChange={vi.fn()} />);

        expect(await screen.findByText('Répartition par budget')).toBeTruthy();
        expect(screen.getByText('Essence')).toBeTruthy();
        expect(screen.getByText('Lignes')).toBeTruthy();
    });

    it('affiche un état vide sans note de frais', async () => {
        mockFetch(() => new Response(JSON.stringify({ data: { ...mockData, global: { ...mockData.global, reportsCount: 0 } } }), { status: 200 }));
        render(<ExpenseStatsSection dateFrom="2026-01-01" dateTo="2026-01-31" onDateFromChange={vi.fn()} onDateToChange={vi.fn()} />);

        expect(await screen.findByText('Aucune note de frais sur cette période')).toBeTruthy();
    });

    it('affiche une erreur si la requête échoue', async () => {
        mockFetch(() => new Response(JSON.stringify({ error: 'Accès non autorisé' }), { status: 403 }));
        render(<ExpenseStatsSection dateFrom="2026-01-01" dateTo="2026-01-31" onDateFromChange={vi.fn()} onDateToChange={vi.fn()} />);

        expect(await screen.findByText('Accès non autorisé')).toBeTruthy();
    });

    it('relance la requête au changement de filtre imputation', async () => {
        const fetchMock = mockFetch(() => new Response(JSON.stringify({ data: mockData }), { status: 200 }));
        render(<ExpenseStatsSection dateFrom="2026-01-01" dateTo="2026-01-31" onDateFromChange={vi.fn()} onDateToChange={vi.fn()} />);

        await screen.findByText('1000.00 €');
        fireEvent.change(screen.getByLabelText('Filtrer par imputation'), { target: { value: 'DLUS' } });

        await waitFor(() => {
            const lastCall = fetchMock.mock.calls.at(-1)?.[0] as string;
            expect(lastCall).toContain('imputation=DLUS');
        });
    });

    it('propage les changements de dates via les callbacks', () => {
        mockFetch(() => new Response(JSON.stringify({ data: mockData }), { status: 200 }));
        const onDateFromChange = vi.fn();
        render(<ExpenseStatsSection dateFrom="2026-01-01" dateTo="2026-01-31" onDateFromChange={onDateFromChange} onDateToChange={vi.fn()} />);

        const dateInputs = document.querySelectorAll('input[type="date"]');
        fireEvent.change(dateInputs[0], { target: { value: '2026-02-01' } });
        expect(onDateFromChange).toHaveBeenCalledWith('2026-02-01');
    });
});
