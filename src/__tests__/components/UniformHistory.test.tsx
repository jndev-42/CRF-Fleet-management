/**
 * Tests RTL — `UniformHistory` (onglet « Historique »).
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import UniformHistory from '@/components/uniforms/UniformHistory';
import { UNIFORMS_CHANGED_EVENT } from '@/components/uniforms/events';
import type { HistoryEvent, HistoryPage } from '@/lib/uniforms/history';

const BASE: Omit<HistoryEvent, 'key' | 'type' | 'at'> = {
    batchId: 'b1', borrowerName: 'Camille', borrowerEmail: null, source: 'app',
    returnedClean: null, returnComment: null, washedByName: null,
    pieces: [{ loanId: 'l1', itemName: 'Polo', sizeLabel: 'M' }],
};
const LOAN: HistoryEvent = { ...BASE, key: 'loan:b1', type: 'loan', at: '2026-09-01T08:00:00.000Z' };
const RETURN: HistoryEvent = {
    ...BASE, key: 'return:b1:x', type: 'return', at: '2026-09-01T09:00:00.000Z', returnedClean: false, returnComment: 'Boue',
    pieces: [{ loanId: 'l1', itemName: 'Polo', sizeLabel: 'M' }, { loanId: 'l2', itemName: 'Veste', sizeLabel: 'L' }],
};
const WASH: HistoryEvent = { ...BASE, key: 'wash:l1', type: 'wash', at: '2026-09-02T10:00:00.000Z', washedByName: 'Alex' };

let pages: Record<string, HistoryPage>;
let fetchMock: ReturnType<typeof vi.fn>;

const page = (events: HistoryEvent[], nextCursor: string | null = null): HistoryPage => ({ events, nextCursor, hasMore: nextCursor !== null });

beforeEach(() => {
    pages = { '': page([WASH, RETURN, LOAN]) };
    fetchMock = vi.fn(async (url: string) => {
        const cursor = new URL(url, 'http://localhost').searchParams.get('cursor') ?? '';
        return new Response(JSON.stringify(pages[cursor] ?? page([])), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('UniformHistory', () => {
    it('affiche emprunt, rendu (état, commentaire, pièces groupées) et lavage', async () => {
        render(<UniformHistory />);
        expect(await screen.findByText('Emprunt', { selector: 'span' })).toBeTruthy();
        expect(screen.getByText('Rendu sale')).toBeTruthy();
        expect(screen.getByText('Boue')).toBeTruthy();
        expect(screen.getByText(/Polo M, Veste L/)).toBeTruthy();
        expect(screen.getByText('Lavage', { selector: 'span' })).toBeTruthy();
        expect(screen.getByText('Alex')).toBeTruthy();
        expect(fetchMock).toHaveBeenCalledWith('/api/uniforms/history?type=all');
    });

    it('état vide', async () => {
        pages[''] = page([]);
        render(<UniformHistory />);
        expect(await screen.findByText('Aucun événement.')).toBeTruthy();
    });

    it('filtre par type', async () => {
        render(<UniformHistory />);
        await screen.findByText('Rendu sale');
        fireEvent.click(screen.getByRole('tab', { name: 'Rendus' }));
        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/uniforms/history?type=return'));
        expect(screen.getByRole('tab', { name: 'Rendus' }).getAttribute('aria-selected')).toBe('true');
    });

    it('recherche avec délai de saisie', async () => {
        render(<UniformHistory />);
        await screen.findByText('Rendu sale');
        fetchMock.mockClear();
        fireEvent.change(screen.getByLabelText('Rechercher dans l\'historique'), { target: { value: 'polo' } });
        expect(fetchMock).not.toHaveBeenCalled();
        await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/uniforms/history?type=all&q=polo'));
    });

    it('changement de filtre pendant un chargement : la liste précédente disparaît et la réponse périmée est ignorée', async () => {
        let releaseFirst: (r: Response) => void = () => {};
        fetchMock.mockImplementation((url: string) => {
            const type = new URL(url, 'http://localhost').searchParams.get('type');
            if (type === 'all') return new Promise<Response>(resolve => { releaseFirst = resolve; });
            return Promise.resolve(new Response(JSON.stringify(page([LOAN])), { status: 200 }));
        });
        render(<UniformHistory />);
        expect(screen.getByRole('status')).toBeTruthy();

        fireEvent.click(screen.getByRole('tab', { name: 'Emprunts' }));
        expect(await screen.findByText(/a emprunté Polo M/)).toBeTruthy();

        // La réponse tardive de l'ancien filtre ne doit pas écraser la liste courante.
        await act(async () => { releaseFirst(new Response(JSON.stringify(page([WASH, RETURN])), { status: 200 })); });
        expect(screen.queryByText('Rendu sale')).toBeNull();
        expect(screen.getAllByRole('listitem')).toHaveLength(1);
    });

    it('changement de filtre : l\'ancienne liste est remplacée par le chargement, et « Charger plus » disparaît', async () => {
        pages[''] = page([WASH, RETURN], 'c1');
        render(<UniformHistory />);
        await screen.findByText('Rendu sale');
        expect(screen.getByRole('button', { name: 'Charger plus' })).toBeTruthy();

        fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
        fireEvent.click(screen.getByRole('tab', { name: 'Lavages' }));
        expect(screen.queryByText('Rendu sale')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Charger plus' })).toBeNull();
        expect(screen.getByRole('status')).toBeTruthy();
    });

    it('« Charger plus » en vol pendant un changement de filtre : sa réponse est abandonnée', async () => {
        pages[''] = page([WASH], 'c1');
        let releaseMore: (r: Response) => void = () => {};
        fetchMock.mockImplementation((url: string) => {
            const params = new URL(url, 'http://localhost').searchParams;
            if (params.get('cursor')) return new Promise<Response>(resolve => { releaseMore = resolve; });
            return Promise.resolve(new Response(JSON.stringify(params.get('type') === 'loan' ? page([LOAN]) : pages['']), { status: 200 }));
        });
        render(<UniformHistory />);
        await screen.findByText('Alex');
        fireEvent.click(screen.getByRole('button', { name: 'Charger plus' }));
        fireEvent.click(screen.getByRole('tab', { name: 'Emprunts' }));
        expect(await screen.findByText(/a emprunté Polo M/)).toBeTruthy();

        await act(async () => { releaseMore(new Response(JSON.stringify(page([RETURN])), { status: 200 })); });
        expect(screen.queryByText('Rendu sale')).toBeNull();
        expect(screen.getAllByRole('listitem')).toHaveLength(1);
    });

    it('« Charger plus » ajoute la page suivante sans doublon, puis disparaît', async () => {
        pages[''] = page([WASH, RETURN], 'c1');
        pages['c1'] = page([RETURN, LOAN]);
        render(<UniformHistory />);
        await screen.findByText('Rendu sale');
        expect(screen.getAllByRole('listitem')).toHaveLength(2);

        fireEvent.click(screen.getByRole('button', { name: 'Charger plus' }));
        await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));
        expect(fetchMock).toHaveBeenCalledWith('/api/uniforms/history?type=all&cursor=c1');
        expect(screen.queryByRole('button', { name: 'Charger plus' })).toBeNull();
    });

    it('pas de bouton « Charger plus » sans page suivante', async () => {
        render(<UniformHistory />);
        await screen.findByText('Rendu sale');
        expect(screen.queryByRole('button', { name: 'Charger plus' })).toBeNull();
    });

    it('affiche l\'erreur serveur et l\'erreur réseau', async () => {
        fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: 'Interdit' }), { status: 403 }));
        const { unmount } = render(<UniformHistory />);
        expect((await screen.findByRole('alert')).textContent).toBe('Interdit');
        unmount();

        fetchMock.mockImplementation(async () => { throw new Error('offline'); });
        render(<UniformHistory />);
        expect((await screen.findByRole('alert')).textContent).toBe('Erreur de connexion');
    });

    it('se recharge sur UNIFORMS_CHANGED_EVENT', async () => {
        render(<UniformHistory />);
        await screen.findByText('Rendu sale');
        fetchMock.mockClear();
        await act(async () => { window.dispatchEvent(new Event(UNIFORMS_CHANGED_EVENT)); });
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    });
});
