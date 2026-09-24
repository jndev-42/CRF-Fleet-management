/**
 * Tests RTL — `UniformMyLoansCard` : card « Mes pièces empruntées » de la page Uniformes.
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockUseSession = vi.fn();
vi.mock('next-auth/react', () => ({ useSession: () => mockUseSession() }));

import UniformMyLoansCard from '@/components/uniforms/UniformMyLoansCard';
import { notifyUniformsChanged } from '@/components/uniforms/events';

const BATCHES = [
    {
        batchId: 'b1',
        ulName: 'Paris 18',
        createdAt: '2026-09-24T08:00:00.000Z',
        pieces: [
            { loanId: 'l1', itemName: 'Polo', sizeLabel: 'M', borrowedAt: '2026-09-24T08:00:00.000Z' },
            { loanId: 'l2', itemName: 'Veste', sizeLabel: 'L', borrowedAt: '2026-09-24T08:00:00.000Z' },
        ],
    },
];

let mineResponse: unknown;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
    mockUseSession.mockReturnValue({ status: 'authenticated', data: { user: { roles: ['CHVL'] } } });
    mineResponse = { batches: BATCHES };
    fetchMock = vi.fn(async (url: string) => {
        if (url === '/api/uniforms/loans/mine') return new Response(JSON.stringify(mineResponse), { status: 200 });
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('UniformMyLoansCard', () => {
    it('ne rend rien sans emprunt en cours', async () => {
        mineResponse = { batches: [] };
        const { container } = render(<UniformMyLoansCard />);
        await act(async () => { await Promise.resolve(); });
        expect(container.firstChild).toBeNull();
    });

    it('ne sollicite pas l\'API pour un compte INACTIF', async () => {
        mockUseSession.mockReturnValue({ status: 'authenticated', data: { user: { roles: ['INACTIF'] } } });
        const { container } = render(<UniformMyLoansCard />);
        await act(async () => { await Promise.resolve(); });
        expect(container.firstChild).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('liste les pièces détenues, y compris pour un compte sans rôle', async () => {
        mockUseSession.mockReturnValue({ status: 'authenticated', data: { user: { roles: [] } } });
        render(<UniformMyLoansCard />);
        expect(await screen.findByRole('heading', { name: 'Mes pièces empruntées (2)' })).toBeTruthy();
        expect(screen.getByText('Polo M')).toBeTruthy();
        expect(screen.getByText('Veste L')).toBeTruthy();
    });

    it('« Rendre » par pièce et « Tout rendre » par emprunt, sans dépliage', async () => {
        render(<UniformMyLoansCard />);
        expect(await screen.findByRole('button', { name: 'Rendre Polo M' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Rendre Veste L' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Tout rendre' })).toBeTruthy();
    });

    it('« Rendre » ouvre la modale sur la bonne pièce et rafraîchit après rendu', async () => {
        render(<UniformMyLoansCard />);
        fireEvent.click(await screen.findByRole('button', { name: 'Rendre Polo M' }));
        expect(screen.getByRole('heading', { name: 'Rendre Polo M' })).toBeTruthy();

        mineResponse = { batches: [{ ...BATCHES[0], pieces: [BATCHES[0].pieces[1]] }] };
        fireEvent.click(screen.getByLabelText(/Propre/));
        fireEvent.click(screen.getByRole('button', { name: 'Confirmer le rendu' }));

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(fetchMock).toHaveBeenCalledWith('/api/uniforms/loans/l1/return', expect.objectContaining({ method: 'POST' }));
        expect(await screen.findByRole('heading', { name: 'Mes pièces empruntées (1)' })).toBeTruthy();
    });

    it('« Tout rendre » cible l\'emprunt entier', async () => {
        render(<UniformMyLoansCard />);
        fireEvent.click(await screen.findByRole('button', { name: 'Tout rendre' }));
        fireEvent.click(screen.getByLabelText(/Sale/));
        mineResponse = { batches: [] };
        fireEvent.click(screen.getByRole('button', { name: 'Confirmer le rendu' }));

        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/uniforms/loan-batches/b1/return', expect.anything()));
        // Tout est rendu : la card disparaît.
        await waitFor(() => expect(screen.queryByRole('heading', { name: /Mes pièces empruntées/ })).toBeNull());
    });

    it('se rafraîchit sur l\'événement émis après un emprunt', async () => {
        mineResponse = { batches: [] };
        render(<UniformMyLoansCard />);
        await act(async () => { await Promise.resolve(); });
        expect(screen.queryByRole('heading', { name: /Mes pièces empruntées/ })).toBeNull();

        mineResponse = { batches: BATCHES };
        act(() => notifyUniformsChanged());
        expect(await screen.findByRole('heading', { name: 'Mes pièces empruntées (2)' })).toBeTruthy();
    });
});
