/**
 * Tests RTL — `UniformLoansTable` (onglet « Emprunts »).
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import UniformLoansTable from '@/components/uniforms/UniformLoansTable';
import { UL_LOANS_LIMIT } from '@/lib/uniforms/constants';

const BASE = {
    batchId: 'b1', borrowerEmail: null, itemName: 'Polo', sizeLabel: 'M',
    borrowedAt: '2026-09-20T08:00:00.000Z', returnComment: null, washedAt: null, washedByName: null,
};
const OPEN = { ...BASE, loanId: 'l1', borrowerName: 'Sam', returnedAt: null, returnedClean: null };
const DIRTY = { ...BASE, loanId: 'l2', borrowerName: 'Camille', returnedAt: '2026-09-21T08:00:00.000Z', returnedClean: false, returnComment: 'Boue' };

let truncated: boolean;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
    truncated = false;
    fetchMock = vi.fn(async (url: string) => {
        const loans = url.includes('status=open') ? [OPEN] : [OPEN, DIRTY];
        return new Response(JSON.stringify({ loans, truncated }), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('UniformLoansTable', () => {
    it('affiche par défaut les emprunts en cours', async () => {
        render(<UniformLoansTable />);
        expect(await screen.findByText('Sam')).toBeTruthy();
        expect(screen.getByText('En cours', { selector: 'span' })).toBeTruthy();
        expect(screen.queryByText('Camille')).toBeNull();
        expect(fetchMock).toHaveBeenCalledWith('/api/uniforms/loans/ul?status=open');
    });

    it('bascule sur tout l\'historique, avec état et commentaire du rendu', async () => {
        render(<UniformLoansTable />);
        await screen.findByText('Sam');
        fireEvent.click(screen.getByRole('tab', { name: 'Tout l\'historique' }));

        expect(await screen.findByText('Camille')).toBeTruthy();
        expect(screen.getByText('Rendue sale — à laver')).toBeTruthy();
        expect(screen.getByText('Boue')).toBeTruthy();
        expect(fetchMock).toHaveBeenCalledWith('/api/uniforms/loans/ul?status=all');
        expect(screen.getByRole('tab', { name: 'Tout l\'historique' }).getAttribute('aria-selected')).toBe('true');
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
        expect(await screen.findByText('Aucun emprunt.')).toBeTruthy();
        unmount();

        fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: 'Interdit' }), { status: 403 }));
        render(<UniformLoansTable />);
        await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Interdit'));
    });
});
