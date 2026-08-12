import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import BannersTab, { type Banner } from '@/components/admin/BannersTab';

function getUrl(input: string | URL | Request): string {
    if (typeof input === 'string') return input;
    if ('url' in input && typeof input.url === 'string') return input.url;
    return String(input);
}

const baseBanner: Banner = {
    id: 'banner-1',
    title: 'Info importante',
    message: 'Réunion vendredi à 19h.',
    target_page: 'ALL',
    type: 'info',
    ul_id: null,
    is_global: true,
    is_active: true,
};

async function defaultFetchHandler(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const url = getUrl(input);
    if (url.includes('/api/banners') && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ banners: [baseBanner] }), { status: 200 });
    }
    if (url.includes('/api/ul')) {
        return new Response(JSON.stringify({ uls: [{ id: 'ul-paris-18', name: 'Paris 18' }] }), { status: 200 });
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

describe('BannersTab', () => {
    it('affiche l\'état vide sans bandeau', async () => {
        mockFetch(async () => new Response(JSON.stringify({ banners: [] }), { status: 200 }));
        render(<BannersTab showToast={vi.fn()} />);
        expect(await screen.findByText('Aucun bandeau de communication')).toBeTruthy();
    });

    it('affiche la liste des bandeaux avec leurs badges', async () => {
        mockFetch();
        render(<BannersTab showToast={vi.fn()} />);
        expect(await screen.findByText('Info importante')).toBeTruthy();
        expect(screen.getByText('Réunion vendredi à 19h.')).toBeTruthy();
        expect(screen.getByText('🌐 Commun (Toutes ULs)')).toBeTruthy();
        expect(screen.getByText('● Actif')).toBeTruthy();
    });

    it('ouvre la modale de création avec les champs vides', async () => {
        mockFetch();
        render(<BannersTab showToast={vi.fn()} />);
        await screen.findByText('Info importante');

        fireEvent.click(screen.getByRole('button', { name: '➕ Nouveau bandeau' }));

        expect(screen.getByText('Créer un nouveau bandeau')).toBeTruthy();
        expect(screen.getByPlaceholderText("Ex: Réunion d'équipe d'urgence ce vendredi à 19h au local.")).toHaveProperty('value', '');
    });

    it('crée un bandeau (happy path)', async () => {
        const fetchMock = mockFetch(async (input, init) => {
            const url = getUrl(input);
            if (url.includes('/api/banners') && init?.method === 'POST') {
                return new Response(JSON.stringify({ success: true }), { status: 200 });
            }
            return defaultFetchHandler(input, init);
        });
        const showToast = vi.fn();

        render(<BannersTab showToast={showToast} />);
        await screen.findByText('Info importante');

        fireEvent.click(screen.getByRole('button', { name: '➕ Nouveau bandeau' }));
        fireEvent.change(screen.getByPlaceholderText("Ex: Réunion d'équipe d'urgence ce vendredi à 19h au local."), {
            target: { value: 'Nouveau message' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Créer' }));

        await waitFor(() => {
            expect(showToast).toHaveBeenCalledWith('Bandeau créé avec succès');
        });

        const postCall = fetchMock.mock.calls.find(c => getUrl(c[0]).includes('/api/banners') && (c[1] as RequestInit)?.method === 'POST');
        expect(postCall).toBeTruthy();
        const body = JSON.parse((postCall![1] as RequestInit).body as string);
        expect(body.message).toBe('Nouveau message');
    });

    it('empêche la création d\'un bandeau sans message (champ requis)', async () => {
        const fetchMock = mockFetch();
        render(<BannersTab showToast={vi.fn()} />);
        await screen.findByText('Info importante');

        fireEvent.click(screen.getByRole('button', { name: '➕ Nouveau bandeau' }));
        fireEvent.click(screen.getByRole('button', { name: 'Créer' }));

        const postCall = fetchMock.mock.calls.find(c => (c[1] as RequestInit)?.method === 'POST');
        expect(postCall).toBeUndefined();
    });

    it('pré-remplit la modale d\'édition avec les valeurs du bandeau', async () => {
        mockFetch();
        render(<BannersTab showToast={vi.fn()} />);
        await screen.findByText('Info importante');

        fireEvent.click(screen.getByRole('button', { name: 'Éditer' }));

        expect(screen.getByText('Éditer le bandeau')).toBeTruthy();
        expect(screen.getByDisplayValue('Info importante')).toBeTruthy();
        expect(screen.getByDisplayValue('Réunion vendredi à 19h.')).toBeTruthy();
    });

    it('active/désactive un bandeau', async () => {
        const fetchMock = mockFetch(async (input, init) => {
            const url = getUrl(input);
            if (url.includes(`/api/banners/${baseBanner.id}`) && init?.method === 'PATCH') {
                return new Response(JSON.stringify({ success: true }), { status: 200 });
            }
            return defaultFetchHandler(input, init);
        });
        const showToast = vi.fn();
        render(<BannersTab showToast={showToast} />);
        await screen.findByText('Info importante');

        fireEvent.click(screen.getByRole('button', { name: 'Désactiver' }));

        await waitFor(() => expect(showToast).toHaveBeenCalledWith('Bandeau désactivé'));
        const patchCall = fetchMock.mock.calls.find(c => (c[1] as RequestInit)?.method === 'PATCH');
        expect(JSON.parse((patchCall![1] as RequestInit).body as string)).toEqual({ is_active: false });
    });

    it('supprime un bandeau après confirmation', async () => {
        const fetchMock = mockFetch(async (input, init) => {
            const url = getUrl(input);
            if (url.includes(`/api/banners/${baseBanner.id}`) && init?.method === 'DELETE') {
                return new Response(JSON.stringify({ success: true }), { status: 200 });
            }
            return defaultFetchHandler(input, init);
        });
        const showToast = vi.fn();
        render(<BannersTab showToast={showToast} />);
        await screen.findByText('Info importante');

        fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));

        expect(window.confirm).toHaveBeenCalled();
        await waitFor(() => expect(showToast).toHaveBeenCalledWith('Bandeau supprimé avec succès'));
        const deleteCall = fetchMock.mock.calls.find(c => (c[1] as RequestInit)?.method === 'DELETE');
        expect(deleteCall).toBeTruthy();
        expect(screen.queryByText('Info importante')).toBeNull();
    });

    it('ne charge pas la liste des UL pour un non-SUPER_ADMIN', async () => {
        const fetchMock = mockFetch();
        render(<BannersTab showToast={vi.fn()} isSuperAdmin={false} />);
        await screen.findByText('Info importante');

        const ulCall = fetchMock.mock.calls.find(c => getUrl(c[0]).includes('/api/ul'));
        expect(ulCall).toBeUndefined();
    });
});
