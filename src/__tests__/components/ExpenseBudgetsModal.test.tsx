import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import ExpenseBudgetsModal from '@/components/expenses/ExpenseBudgetsModal';

const BUDGETS = [
    { id: 'b-repas', name: 'Repas' },
    { id: 'b-essence', name: 'Essence' },
];

function getUrl(input: string | URL | Request): string {
    if (typeof input === 'string') return input;
    if ('url' in input && typeof input.url === 'string') return input.url;
    return String(input);
}

/** Mock `fetch` routé par URL : la liste des budgets, puis les écritures. */
function mockFetch(handler?: (url: string, init?: RequestInit) => Response | undefined) {
    let list = [...BUDGETS];
    const mock = vi.fn().mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
        const url = getUrl(input);
        const method = init?.method || 'GET';

        const custom = handler?.(url, init);
        if (custom) return custom;

        if (url.startsWith('/api/expense-budgets') && method === 'GET') {
            return new Response(JSON.stringify(list), { status: 200 });
        }
        if (url.startsWith('/api/expense-budgets') && method === 'POST') {
            const body = JSON.parse(init!.body as string);
            list = [...list, { id: `b-${body.name}`, name: body.name }];
            return new Response(JSON.stringify(list[list.length - 1]), { status: 201 });
        }
        if (method === 'PATCH') {
            const id = url.split('/').pop()!;
            const body = JSON.parse(init!.body as string);
            list = list.map(b => (b.id === id ? { ...b, name: body.name } : b));
            return new Response(JSON.stringify({ success: true }), { status: 200 });
        }
        if (method === 'DELETE') {
            const id = url.split('/').pop()!;
            list = list.filter(b => b.id !== id);
            return new Response(JSON.stringify({ success: true }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
    });
    vi.spyOn(global, 'fetch').mockImplementation(mock as typeof fetch);
    return mock;
}

async function renderModal(onClose = vi.fn()) {
    const utils = render(<ExpenseBudgetsModal onClose={onClose} />);
    await screen.findByText('Repas');
    return { ...utils, onClose };
}

beforeEach(() => {
    vi.restoreAllMocks();
    mockFetch();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('ExpenseBudgetsModal', () => {
    it('la modale liste les budgets non archivés', async () => {
        await renderModal();

        expect(screen.getByText('Repas')).toBeTruthy();
        expect(screen.getByText('Essence')).toBeTruthy();
        expect(screen.getByRole('dialog')).toBeTruthy();
    });

    it('aucun libellé (archivé) n\'est affiché', async () => {
        const { container } = await renderModal();
        expect(container.textContent).not.toContain('archivé)');
        expect(screen.queryByText(/\(archivé\)/)).toBeNull();
    });

    it('la modale ajoute un budget', async () => {
        const fetchMock = mockFetch();
        await renderModal();

        fireEvent.change(screen.getByLabelText('Nouveau budget'), { target: { value: 'Formation' } });
        fireEvent.click(screen.getByRole('button', { name: /Ajouter/ }));

        expect(await screen.findByText('Formation')).toBeTruthy();
        const postCall = fetchMock.mock.calls.find(c => (c[1] as RequestInit)?.method === 'POST');
        expect(JSON.parse((postCall![1] as RequestInit).body as string)).toEqual({ name: 'Formation' });
    });

    it('la modale renomme un budget en édition inline', async () => {
        const fetchMock = mockFetch();
        await renderModal();

        fireEvent.click(screen.getByRole('button', { name: 'Renommer Repas' }));
        fireEvent.change(screen.getByLabelText('Renommer le budget Repas'), { target: { value: 'Restauration' } });
        fireEvent.click(screen.getByRole('button', { name: 'Confirmer le renommage' }));

        expect(await screen.findByText('Restauration')).toBeTruthy();
        const patchCall = fetchMock.mock.calls.find(c => (c[1] as RequestInit)?.method === 'PATCH');
        expect(getUrl(patchCall![0])).toBe('/api/expense-budgets/b-repas');
    });

    it('le focus passe sur l\'input de renommage', async () => {
        await renderModal();

        fireEvent.click(screen.getByRole('button', { name: 'Renommer Repas' }));
        const input = await screen.findByLabelText('Renommer le budget Repas');
        await waitFor(() => expect(document.activeElement).toBe(input));
    });

    it('la modale archive un budget après confirmation', async () => {
        const fetchMock = mockFetch();
        await renderModal();

        fireEvent.click(screen.getByRole('button', { name: 'Archiver Repas' }));
        // Rien n'est envoyé tant que la confirmation n'est pas validée.
        expect(fetchMock.mock.calls.some(c => (c[1] as RequestInit)?.method === 'DELETE')).toBe(false);
        expect(screen.getByText(/Archiver « Repas » \?/)).toBeTruthy();

        const confirm = screen.getByRole('button', { name: 'Confirmer' });
        await waitFor(() => expect(document.activeElement).toBe(confirm));
        fireEvent.click(confirm);

        await waitFor(() => expect(screen.queryByText('Repas')).toBeNull());
        const deleteCall = fetchMock.mock.calls.find(c => (c[1] as RequestInit)?.method === 'DELETE');
        expect(getUrl(deleteCall![0])).toBe('/api/expense-budgets/b-repas');
    });

    it('annuler la confirmation d\'archivage n\'archive rien et rend le focus', async () => {
        const fetchMock = mockFetch();
        await renderModal();

        fireEvent.click(screen.getByRole('button', { name: 'Archiver Repas' }));
        fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));

        expect(fetchMock.mock.calls.some(c => (c[1] as RequestInit)?.method === 'DELETE')).toBe(false);
        await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Archiver Repas' })));
    });

    it('le refus d\'archiver le dernier budget actif est affiché tel quel', async () => {
        const message = "Impossible d'archiver le dernier budget actif de l'UL : au moins un budget est requis pour saisir une note de frais.";
        mockFetch((url, init) => {
            if ((init?.method || 'GET') === 'DELETE') {
                return new Response(JSON.stringify({ error: message }), { status: 400 });
            }
            return undefined;
        });
        await renderModal();

        fireEvent.click(screen.getByRole('button', { name: 'Archiver Repas' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));

        expect(await screen.findByText(message)).toBeTruthy();
        // La ligne reste en confirmation : l'utilisateur peut réessayer ou annuler.
        expect(screen.getByText(/Archiver « Repas » \?/)).toBeTruthy();
    });

    it('Escape ferme la modale', async () => {
        const onClose = vi.fn();
        await renderModal(onClose);

        fireEvent.keyDown(window, { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
    });

    it('un échec de chargement affiche un message français', async () => {
        mockFetch(url => (url.startsWith('/api/expense-budgets')
            ? new Response(JSON.stringify({ error: 'Erreur serveur' }), { status: 500 })
            : undefined));

        render(<ExpenseBudgetsModal onClose={vi.fn()} />);

        expect(await screen.findByText('Impossible de charger les budgets.')).toBeTruthy();
    });
});
