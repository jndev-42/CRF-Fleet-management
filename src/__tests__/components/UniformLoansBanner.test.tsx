/**
 * Tests RTL — `UniformLoansBanner` : bandeau global des pièces détenues.
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockUseSession = vi.fn();
vi.mock('next-auth/react', () => ({ useSession: () => mockUseSession() }));

import UniformLoansBanner from '@/components/uniforms/UniformLoansBanner';
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

describe('UniformLoansBanner', () => {
    it('ne rend rien sans emprunt en cours', async () => {
        mineResponse = { batches: [] };
        const { container } = render(<UniformLoansBanner />);
        await act(async () => { await Promise.resolve(); });
        expect(container.firstChild).toBeNull();
    });

    it('ne sollicite pas l\'API pour un compte INACTIF', async () => {
        mockUseSession.mockReturnValue({ status: 'authenticated', data: { user: { roles: ['INACTIF'] } } });
        const { container } = render(<UniformLoansBanner />);
        await act(async () => { await Promise.resolve(); });
        expect(container.firstChild).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('résume les pièces détenues, y compris pour un compte sans rôle', async () => {
        mockUseSession.mockReturnValue({ status: 'authenticated', data: { user: { roles: [] } } });
        render(<UniformLoansBanner />);
        expect(await screen.findByText(/Vous détenez 2 pièces d'uniforme/)).toBeTruthy();
        expect(screen.getByText(/Polo M, Veste L/)).toBeTruthy();
    });

    it('déplié : « Rendre » par pièce et « Tout rendre » par emprunt', async () => {
        render(<UniformLoansBanner />);
        fireEvent.click(await screen.findByRole('button', { name: 'Rendre…' }));
        expect(screen.getByRole('button', { name: 'Rendre Polo M' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Rendre Veste L' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Tout rendre' })).toBeTruthy();
    });

    it('« Rendre » ouvre la modale sur la bonne pièce et rafraîchit après rendu', async () => {
        render(<UniformLoansBanner />);
        fireEvent.click(await screen.findByRole('button', { name: 'Rendre…' }));
        fireEvent.click(screen.getByRole('button', { name: 'Rendre Polo M' }));
        expect(screen.getByRole('heading', { name: 'Rendre Polo M' })).toBeTruthy();

        mineResponse = { batches: [{ ...BATCHES[0], pieces: [BATCHES[0].pieces[1]] }] };
        fireEvent.click(screen.getByLabelText(/Propre/));
        fireEvent.click(screen.getByRole('button', { name: 'Confirmer le rendu' }));

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(fetchMock).toHaveBeenCalledWith('/api/uniforms/loans/l1/return', expect.objectContaining({ method: 'POST' }));
        expect(await screen.findByText(/Vous détenez 1 pièce d'uniforme/)).toBeTruthy();
    });

    it('« Tout rendre » cible l\'emprunt entier', async () => {
        render(<UniformLoansBanner />);
        fireEvent.click(await screen.findByRole('button', { name: 'Rendre…' }));
        fireEvent.click(screen.getByRole('button', { name: 'Tout rendre' }));
        fireEvent.click(screen.getByLabelText(/Sale/));
        mineResponse = { batches: [] };
        fireEvent.click(screen.getByRole('button', { name: 'Confirmer le rendu' }));

        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/uniforms/loan-batches/b1/return', expect.anything()));
        // Tout est rendu : le bandeau disparaît.
        await waitFor(() => expect(screen.queryByRole('region')).toBeNull());
    });

    it('se rafraîchit sur l\'événement émis après un emprunt', async () => {
        mineResponse = { batches: [] };
        render(<UniformLoansBanner />);
        await act(async () => { await Promise.resolve(); });
        expect(screen.queryByRole('region')).toBeNull();

        mineResponse = { batches: BATCHES };
        act(() => notifyUniformsChanged());
        expect(await screen.findByRole('region', { name: 'Uniformes empruntés' })).toBeTruthy();
    });
});
