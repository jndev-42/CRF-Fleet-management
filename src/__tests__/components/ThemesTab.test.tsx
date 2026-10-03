import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ThemesTab from '@/components/admin/ThemesTab';

const THEME = {
    key: 'vendanges-montmartre',
    label: 'Fête des vendanges de Montmartre',
    description: 'desc',
    enabled: false,
    startDate: null,
    endDate: null,
    status: 'inactive',
    ulIds: [] as string[],
};

const ULS = [{ id: 'ul-18', name: 'Paris 18' }, { id: 'ul-17', name: 'Paris 17' }];

function mockFetch(handler: (url: string, init?: RequestInit) => { ok: boolean; body: unknown }) {
    return vi.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
        if (String(input) === '/api/ul') return { ok: true, json: async () => ({ uls: ULS }) } as Response;
        const { ok, body } = handler(String(input), init);
        return { ok, json: async () => body } as Response;
    });
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('ThemesTab', () => {
    beforeEach(() => vi.resetAllMocks());

    it('affiche une carte par thème avec son badge', async () => {
        mockFetch(() => ({ ok: true, body: { themes: [{ ...THEME, enabled: true, startDate: '2026-10-07', endDate: '2026-10-12', status: 'active' }] } }));
        render(<ThemesTab />);
        expect(await screen.findByText('Fête des vendanges de Montmartre')).toBeTruthy();
        expect(screen.getByText("Actif aujourd'hui")).toBeTruthy();
        expect((screen.getByLabelText('Début') as HTMLInputElement).value).toBe('2026-10-07');
    });

    it('affiche une erreur de chargement', async () => {
        mockFetch(() => ({ ok: false, body: { error: 'Interdit' } }));
        render(<ThemesTab />);
        expect((await screen.findByRole('alert')).textContent).toBe('Interdit');
    });

    it('enregistre avec le PUT attendu puis recharge', async () => {
        const spy = mockFetch((_url, init) => init?.method === 'PUT'
            ? { ok: true, body: { success: true } }
            : { ok: true, body: { themes: [THEME] } });
        render(<ThemesTab />);
        await screen.findByText('Fête des vendanges de Montmartre');

        fireEvent.click(screen.getByLabelText('Thème activé'));
        fireEvent.change(screen.getByLabelText('Début'), { target: { value: '2026-10-07' } });
        fireEvent.change(screen.getByLabelText('Fin'), { target: { value: '2026-10-12' } });
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

        await screen.findByText('Thème enregistré');
        const put = spy.mock.calls.find(([, init]) => init?.method === 'PUT')!;
        expect(String(put[0])).toBe('/api/settings/themes/vendanges-montmartre');
        expect(JSON.parse(String(put[1]?.body))).toEqual({ enabled: true, startDate: '2026-10-07', endDate: '2026-10-12', ulIds: [] });
    });

    it('affiche le message du serveur en cas de conflit', async () => {
        mockFetch((_url, init) => init?.method === 'PUT'
            ? { ok: false, body: { error: 'Plage en conflit avec le thème X' } }
            : { ok: true, body: { themes: [THEME] } });
        render(<ThemesTab />);
        await screen.findByText('Fête des vendanges de Montmartre');
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
        await waitFor(() => expect(screen.getByText('Plage en conflit avec le thème X')).toBeTruthy());
    });

    it('affiche « Toutes les UL » par défaut, sans cases à cocher', async () => {
        mockFetch(() => ({ ok: true, body: { themes: [THEME] } }));
        render(<ThemesTab />);
        await screen.findByText('Fête des vendanges de Montmartre');
        expect((screen.getByLabelText('Toutes les UL') as HTMLInputElement).checked).toBe(true);
        expect(screen.queryByLabelText('Paris 18')).toBeNull();
    });

    it('résume le périmètre d\'un thème déjà ciblé', async () => {
        mockFetch(() => ({ ok: true, body: { themes: [{ ...THEME, ulIds: ['ul-18', 'ul-17'] }] } }));
        render(<ThemesTab />);
        expect(await screen.findByText('2 UL : Paris 17, Paris 18')).toBeTruthy();
        expect((screen.getByLabelText('Paris 18') as HTMLInputElement).checked).toBe(true);
    });

    it('envoie les UL cochées dans le PUT', async () => {
        const spy = mockFetch((_url, init) => init?.method === 'PUT'
            ? { ok: true, body: { success: true } }
            : { ok: true, body: { themes: [THEME] } });
        render(<ThemesTab />);
        await screen.findByText('Fête des vendanges de Montmartre');

        fireEvent.click(screen.getByLabelText('Certaines UL seulement'));
        fireEvent.click(await screen.findByLabelText('Paris 18'));
        expect(screen.getByText('1 UL : Paris 18')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

        await screen.findByText('Thème enregistré');
        const put = spy.mock.calls.find(([, init]) => init?.method === 'PUT')!;
        expect(JSON.parse(String(put[1]?.body)).ulIds).toEqual(['ul-18']);
    });

    it('repasser à « Toutes les UL » envoie une liste vide', async () => {
        const spy = mockFetch((_url, init) => init?.method === 'PUT'
            ? { ok: true, body: { success: true } }
            : { ok: true, body: { themes: [{ ...THEME, ulIds: ['ul-18'] }] } });
        render(<ThemesTab />);
        await screen.findByText('Fête des vendanges de Montmartre');
        fireEvent.click(screen.getByLabelText('Toutes les UL'));
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
        await screen.findByText('Thème enregistré');
        const put = spy.mock.calls.find(([, init]) => init?.method === 'PUT')!;
        expect(JSON.parse(String(put[1]?.body)).ulIds).toEqual([]);
    });

    it('« Certaines UL seulement » sans UL cochée : message et enregistrement bloqué', async () => {
        const spy = mockFetch(() => ({ ok: true, body: { themes: [THEME] } }));
        render(<ThemesTab />);
        await screen.findByText('Fête des vendanges de Montmartre');
        fireEvent.click(screen.getByLabelText('Certaines UL seulement'));
        expect(screen.getByText('Choisissez au moins une UL')).toBeTruthy();
        const btn = screen.getByRole('button', { name: 'Enregistrer' }) as HTMLButtonElement;
        expect(btn.disabled).toBe(true);
        fireEvent.click(btn);
        expect(spy.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
    });

    it('résumé trié par ordre alphabétique', async () => {
        mockFetch(() => ({ ok: true, body: { themes: [{ ...THEME, ulIds: ['ul-18', 'ul-17'] }] } }));
        render(<ThemesTab />);
        expect(await screen.findByText('2 UL : Paris 17, Paris 18')).toBeTruthy();
    });
});
