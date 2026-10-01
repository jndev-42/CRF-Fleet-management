import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockUseSession = vi.fn();
vi.mock('next-auth/react', () => ({ useSession: () => mockUseSession() }));

vi.mock('@/components/vehicle/VehicleGuideReader', () => ({
    default: (props: { rangeUrl?: string; initialPage?: number; fileName: string; onClose: () => void }) => (
        <div data-testid="reader" data-url={props.rangeUrl} data-page={props.initialPage}>
            {props.fileName}
            <button onClick={props.onClose}>Fermer la liseuse</button>
        </div>
    ),
}));

import ReferentielChatButton from '@/components/referentiel/ReferentielChatButton';

const SEARCH_RESULTS = {
    ready: true,
    results: [
        { page: 120, title: 'Urgences vitales / Hémorragie / IV.B.1', excerpt: '…comprimer la plaie : \u0002hémorragie\u0003 <b>externe</b>…' },
        { page: 121, title: '', excerpt: 'suite du texte' },
    ],
};

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status });
}

let fetchMock: ReturnType<typeof vi.fn>;

function mockFetch(handlers: { status?: unknown; search?: unknown; fileUrl?: Response }) {
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith('/api/referentiel/search')) return json(handlers.search ?? SEARCH_RESULTS);
        if (url === '/api/referentiel/file-url') return handlers.fileUrl ?? json({ url: 'https://r2.test/guide.pdf?sig=1', fileName: 'guide.pdf' });
        return json(handlers.status ?? { ready: true, fileName: 'guide.pdf', pageCount: 826 });
    });
    vi.spyOn(global, 'fetch').mockImplementation(fetchMock as typeof fetch);
}

beforeEach(() => {
    mockUseSession.mockReturnValue({ status: 'authenticated', data: { user: { roles: ['CHVL'] } } });
});

afterEach(() => {
    vi.restoreAllMocks();
});

async function openChat() {
    fireEvent.click(screen.getByRole('button', { name: 'Interroger le référentiel secourisme' }));
    await screen.findByRole('dialog', { name: 'Référentiel secourisme' });
}

describe('ReferentielChatButton', () => {
    it('ne rend rien si non authentifié', () => {
        mockUseSession.mockReturnValue({ status: 'unauthenticated', data: null });
        const { container } = render(<ReferentielChatButton />);
        expect(container.firstChild).toBeNull();
    });

    it('ne rend rien pour un compte INACTIF', () => {
        mockUseSession.mockReturnValue({ status: 'authenticated', data: { user: { roles: ['CHVL', 'INACTIF'] } } });
        const { container } = render(<ReferentielChatButton />);
        expect(container.firstChild).toBeNull();
    });

    it('affiche l\'avertissement permanent à l\'ouverture', async () => {
        mockFetch({});
        render(<ReferentielChatButton />);
        await openChat();
        expect(screen.getByText('Extraits du référentiel — ne remplace ni la formation ni la régulation (15)')).toBeTruthy();
    });

    it('affiche « Aucun référentiel importé » et bloque la saisie', async () => {
        mockFetch({ status: { ready: false } });
        render(<ReferentielChatButton />);
        await openChat();
        expect(await screen.findByText('Aucun référentiel importé')).toBeTruthy();
        expect((screen.getByLabelText('Votre question') as HTMLInputElement).disabled).toBe(true);
    });

    it('question → résultats surlignés → ouverture de la liseuse à la bonne page', async () => {
        mockFetch({});
        render(<ReferentielChatButton />);
        await openChat();

        await waitFor(() => expect((screen.getByLabelText('Votre question') as HTMLInputElement).disabled).toBe(false));
        fireEvent.change(screen.getByLabelText('Votre question'), { target: { value: 'hémorragie' } });
        fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

        expect(await screen.findByText('Urgences vitales / Hémorragie / IV.B.1')).toBeTruthy();
        expect(fetchMock).toHaveBeenCalledWith('/api/referentiel/search?q=h%C3%A9morragie');
        // Titre de repli quand la fiche n'en a pas.
        expect(screen.getByText('Page 121')).toBeTruthy();

        // Surlignage par <mark>, jamais par HTML interprété.
        const mark = document.querySelector('mark');
        expect(mark?.textContent).toBe('hémorragie');
        expect(document.body.innerHTML).not.toContain('<b>externe</b>');
        expect(screen.getByText(/<b>externe<\/b>/)).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Ouvrir p. 120' }));
        const reader = await screen.findByTestId('reader');
        expect(reader.getAttribute('data-page')).toBe('120');
        expect(reader.getAttribute('data-url')).toBe('https://r2.test/guide.pdf?sig=1');
    });

    it('indique l\'absence de résultat', async () => {
        mockFetch({ search: { ready: true, results: [] } });
        render(<ReferentielChatButton />);
        await openChat();
        await waitFor(() => expect((screen.getByLabelText('Votre question') as HTMLInputElement).disabled).toBe(false));
        fireEvent.change(screen.getByLabelText('Votre question'), { target: { value: 'zzzz' } });
        fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
        expect(await screen.findByText(/Aucun passage trouvé/)).toBeTruthy();
    });

    it('signale un échec d\'ouverture de la liseuse', async () => {
        mockFetch({ fileUrl: json({ error: 'x' }, 500) });
        render(<ReferentielChatButton />);
        await openChat();
        await waitFor(() => expect((screen.getByLabelText('Votre question') as HTMLInputElement).disabled).toBe(false));
        fireEvent.change(screen.getByLabelText('Votre question'), { target: { value: 'hémorragie' } });
        fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir p. 120' }));
        expect(await screen.findByText("Impossible d'ouvrir le référentiel.")).toBeTruthy();
        expect(screen.queryByTestId('reader')).toBeNull();
    });

    it('place le focus sur le champ quand le chat est prêt, et le rend au bouton à la fermeture', async () => {
        mockFetch({});
        render(<ReferentielChatButton />);
        await openChat();
        await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Votre question')));

        fireEvent.click(screen.getByRole('button', { name: 'Fermer le chat' }));
        await waitFor(() => expect(document.activeElement).toBe(
            screen.getByRole('button', { name: 'Interroger le référentiel secourisme' })));
    });

    it('se ferme par la croix', async () => {
        mockFetch({});
        render(<ReferentielChatButton />);
        await openChat();
        fireEvent.click(screen.getByRole('button', { name: 'Fermer le chat' }));
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});
