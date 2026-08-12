import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ULsTab from '@/components/admin/ULsTab';

const ulParis: { id: string; name: string; slug: string; dtCode?: string | null } = { id: 'ul-paris-18', name: 'Paris 18', slug: 'paris-18', dtCode: 'DT 75' };
const ulLyon: { id: string; name: string; slug: string } = { id: 'ul-lyon-3', name: 'Lyon 3', slug: 'lyon-3' };

function getUrl(input: string | URL | Request): string {
    if (typeof input === 'string') return input;
    if ('url' in input && typeof input.url === 'string') return input.url;
    return String(input);
}

async function defaultFetchHandler(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const url = getUrl(input);
    if (url === '/api/ul' && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ uls: [ulParis, ulLyon] }), { status: 200 });
    }
    if (url === '/api/ul' && init?.method === 'POST') {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    if (url.includes('/api/ul/') && init?.method === 'PATCH') {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    if (url.includes('/api/ul/') && init?.method === 'DELETE') {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
}

function mockFetch(handler = defaultFetchHandler) {
    const mock = vi.fn().mockImplementation(handler);
    vi.spyOn(global, 'fetch').mockImplementation(mock as typeof fetch);
    return mock;
}

beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('ULsTab', () => {
    it('affiche la liste des UL', async () => {
        mockFetch();
        render(<ULsTab isSuperAdmin userUlId="ul-paris-18" />);

        expect(await screen.findByText('Unité Locale Paris 18')).toBeTruthy();
        expect(screen.getByText('Unité Locale Lyon 3')).toBeTruthy();
        expect(screen.getByText('🏢 DT 75')).toBeTruthy();
    });

    it('affiche l\'état vide sans UL', async () => {
        mockFetch(async () => new Response(JSON.stringify({ uls: [] }), { status: 200 }));
        render(<ULsTab isSuperAdmin />);

        expect(await screen.findByText('Aucune UL configurée')).toBeTruthy();
    });

    it('masque le bouton d\'ajout pour un non-SUPER_ADMIN', async () => {
        mockFetch();
        render(<ULsTab isSuperAdmin={false} userUlId="ul-paris-18" />);
        await screen.findByText('Unité Locale Paris 18');
        expect(screen.queryByRole('button', { name: /Ajouter une UL/ })).toBeNull();
    });

    it('un non-SUPER_ADMIN ne peut modifier que sa propre UL', async () => {
        mockFetch();
        render(<ULsTab isSuperAdmin={false} userUlId="ul-paris-18" />);
        await screen.findByText('Unité Locale Paris 18');

        expect(screen.getAllByRole('button', { name: 'Modifier' })).toHaveLength(1);
        expect(screen.queryByRole('button', { name: 'Supprimer' })).toBeNull();
    });

    it('génère automatiquement le slug depuis le nom en création', async () => {
        mockFetch();
        render(<ULsTab isSuperAdmin />);
        await screen.findByText('Unité Locale Paris 18');

        fireEvent.click(screen.getByRole('button', { name: /Ajouter une UL/ }));
        fireEvent.change(screen.getByPlaceholderText('Paris 18'), { target: { value: 'Saint-Étienne 42' } });

        expect(screen.getByPlaceholderText('paris-18')).toHaveProperty('value', 'saint-etienne-42');
    });

    it('crée une nouvelle UL (happy path)', async () => {
        const fetchMock = mockFetch();
        render(<ULsTab isSuperAdmin />);
        await screen.findByText('Unité Locale Paris 18');

        fireEvent.click(screen.getByRole('button', { name: /Ajouter une UL/ }));
        fireEvent.change(screen.getByPlaceholderText('Paris 18'), { target: { value: 'Marseille 1' } });
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

        await waitFor(() => {
            const postCall = fetchMock.mock.calls.find(c => getUrl(c[0]) === '/api/ul' && (c[1] as RequestInit)?.method === 'POST');
            expect(postCall).toBeTruthy();
            const body = JSON.parse((postCall![1] as RequestInit).body as string);
            expect(body.name).toBe('Marseille 1');
            expect(body.slug).toBe('marseille-1');
        });
        expect(await screen.findByText(/créée avec succès/)).toBeTruthy();
    });

    it('pré-remplit et verrouille le slug en édition', async () => {
        mockFetch();
        render(<ULsTab isSuperAdmin userUlId="ul-paris-18" />);
        await screen.findByText('Unité Locale Paris 18');

        fireEvent.click(screen.getAllByRole('button', { name: 'Modifier' })[0]);

        const slugInput = screen.getByPlaceholderText('paris-18') as HTMLInputElement;
        expect(slugInput.value).toBe('paris-18');
        expect(slugInput.disabled).toBe(true);
    });

    it('ajoute et supprime des numéros de téléphone', async () => {
        mockFetch();
        render(<ULsTab isSuperAdmin />);
        await screen.findByText('Unité Locale Paris 18');

        fireEvent.click(screen.getByRole('button', { name: /Ajouter une UL/ }));
        fireEvent.click(screen.getByRole('button', { name: /Ajouter un numéro/ }));

        const removeButtons = screen.getAllByRole('button', { name: '✕' });
        expect(removeButtons.length).toBeGreaterThan(0);
        fireEvent.click(removeButtons[0]);
    });

    it('supprime une UL après confirmation', async () => {
        const fetchMock = mockFetch();
        render(<ULsTab isSuperAdmin userUlId="ul-paris-18" />);
        await screen.findByText('Unité Locale Paris 18');

        fireEvent.click(screen.getAllByRole('button', { name: 'Supprimer' })[0]);

        expect(window.confirm).toHaveBeenCalled();
        await waitFor(() => {
            const deleteCall = fetchMock.mock.calls.find(c => (c[1] as RequestInit)?.method === 'DELETE');
            expect(deleteCall).toBeTruthy();
        });
        expect(await screen.findByText(/supprimée/)).toBeTruthy();
    });

    it('affiche une erreur si la création échoue', async () => {
        mockFetch(async (input, init) => {
            const url = getUrl(input);
            if (url === '/api/ul' && init?.method === 'POST') {
                return new Response(JSON.stringify({ error: 'Slug déjà utilisé' }), { status: 400 });
            }
            return defaultFetchHandler(input, init);
        });
        render(<ULsTab isSuperAdmin />);
        await screen.findByText('Unité Locale Paris 18');

        fireEvent.click(screen.getByRole('button', { name: /Ajouter une UL/ }));
        fireEvent.change(screen.getByPlaceholderText('Paris 18'), { target: { value: 'Doublon' } });
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

        expect(await screen.findByText(/Slug déjà utilisé/)).toBeTruthy();
    });
});
