/**
 * Tests RTL — `UniformLoansTable` (onglet « Emprunts »).
 */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import UniformLoansTable from '@/components/uniforms/UniformLoansTable';
import { UL_LOANS_LIMIT } from '@/lib/uniforms/constants';

const BASE = {
    batchId: 'b1', borrowerEmail: null, itemName: 'Polo', sizeLabel: 'M',
    borrowedAt: '2026-09-20T08:00:00.000Z', returnComment: null, washedAt: null, washedByName: null,
};
const OPEN = { ...BASE, loanId: 'l1', borrowerName: 'Sam', returnedAt: null, returnedClean: null };

let truncated: boolean;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
    truncated = false;
    fetchMock = vi.fn(async () => {
        return new Response(JSON.stringify({ loans: [OPEN], truncated }), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('UniformLoansTable', () => {
    it('affiche les emprunts en cours', async () => {
        render(<UniformLoansTable />);
        expect(await screen.findByText('Sam')).toBeTruthy();
        expect(screen.getByText('En cours', { selector: 'span' })).toBeTruthy();
        expect(fetchMock).toHaveBeenCalledWith('/api/uniforms/loans/ul');
    });

    it('n\'a plus de filtre « Tout l\'historique »', async () => {
        render(<UniformLoansTable />);
        await screen.findByText('Sam');
        expect(screen.queryByRole('tab')).toBeNull();
        expect(screen.queryByText(/Tout l.historique/)).toBeNull();
    });

    it('signale la troncature', async () => {
        truncated = true;
        render(<UniformLoansTable />);
        const note = await screen.findByRole('note');
        expect(note.textContent).toContain(`${UL_LOANS_LIMIT} emprunts les plus récents`);
    });

    it('pas de mention de troncature sous le plafond', async () => {
        render(<UniformLoansTable />);
        await screen.findByText('Sam');
        expect(screen.queryByRole('note')).toBeNull();
    });

    it('état vide et erreur', async () => {
        fetchMock.mockImplementation(async () => new Response(JSON.stringify({ loans: [], truncated: false }), { status: 200 }));
        const { unmount } = render(<UniformLoansTable />);
        expect(await screen.findByText('Aucun emprunt en cours.')).toBeTruthy();
        unmount();

        fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: 'Interdit' }), { status: 403 }));
        render(<UniformLoansTable />);
        await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Interdit'));
    });
});
