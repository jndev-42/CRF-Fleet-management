import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import DesinfPreCheckinModal from '@/components/vehicle/modals/DesinfPreCheckinModal';

function getUrl(input: string | URL | Request): string {
    if (typeof input === 'string') return input;
    if ('url' in input && typeof input.url === 'string') return input.url;
    return String(input);
}

function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
    const mock = vi.fn().mockImplementation((input: string | URL | Request, init?: RequestInit) => Promise.resolve(handler(getUrl(input), init)));
    vi.spyOn(global, 'fetch').mockImplementation(mock as typeof fetch);
    return mock;
}

const usersResponse = { users: [{ id: 'u1', name: 'Jean Dupont', email: 'jean@test.com' }] };

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('DesinfPreCheckinModal', () => {
    it('charge la liste des utilisateurs au montage', async () => {
        mockFetch(() => new Response(JSON.stringify(usersResponse), { status: 200 }));
        render(<DesinfPreCheckinModal tripId="trip-1" onClose={vi.fn()} onConfirm={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: /Sélectionner un responsable/ }));
        expect(await screen.findByText('Jean Dupont')).toBeTruthy();
    });

    it('désactive le bouton Valider tant que le formulaire est incomplet', async () => {
        mockFetch(() => new Response(JSON.stringify(usersResponse), { status: 200 }));
        render(<DesinfPreCheckinModal tripId="trip-1" onClose={vi.fn()} onConfirm={vi.fn()} />);

        expect((screen.getByRole('button', { name: '✅ Valider' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('soumet les informations de désinfection (happy path)', async () => {
        const fetchMock = mockFetch((url) => {
            if (url === '/api/users') return new Response(JSON.stringify(usersResponse), { status: 200 });
            return new Response(JSON.stringify({ success: true }), { status: 200 });
        });
        const onConfirm = vi.fn();
        render(<DesinfPreCheckinModal tripId="trip-1" onClose={vi.fn()} onConfirm={onConfirm} />);

        fireEvent.click(screen.getByRole('button', { name: /Sélectionner un responsable/ }));
        fireEvent.click(await screen.findByText('Jean Dupont'));
        fireEvent.change(screen.getByPlaceholderText('Ex : LOT-2026-001'), { target: { value: 'LOT-2026-042' } });
        fireEvent.click(screen.getByRole('button', { name: '✅ Valider' }));

        await waitFor(() => expect(onConfirm).toHaveBeenCalled());
        const patchCall = fetchMock.mock.calls.find(c => (c[1] as RequestInit)?.method === 'PATCH');
        expect(patchCall).toBeTruthy();
        const body = JSON.parse((patchCall![1] as RequestInit).body as string);
        expect(body.desinfResponsableId).toBe('u1');
        expect(body.desinfResponsable).toBe('Jean Dupont');
        expect(body.desinfLotNumber).toBe('LOT-2026-042');
    });

    it('affiche une erreur si la sauvegarde échoue', async () => {
        const fetchMock = mockFetch((url) => {
            if (url === '/api/users') return new Response(JSON.stringify(usersResponse), { status: 200 });
            return new Response(JSON.stringify({ error: 'Trajet non trouvé' }), { status: 404 });
        });
        render(<DesinfPreCheckinModal tripId="trip-1" onClose={vi.fn()} onConfirm={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: /Sélectionner un responsable/ }));
        fireEvent.click(await screen.findByText('Jean Dupont'));
        fireEvent.change(screen.getByPlaceholderText('Ex : LOT-2026-001'), { target: { value: 'LOT-1' } });
        fireEvent.click(screen.getByRole('button', { name: '✅ Valider' }));

        expect(await screen.findByText('Trajet non trouvé')).toBeTruthy();
        expect(fetchMock).toHaveBeenCalled();
    });

    it('n\'est pas masquée aux technologies d\'assistance (pas d\'aria-hidden sur l\'overlay)', () => {
        mockFetch(() => new Response(JSON.stringify(usersResponse), { status: 200 }));
        const { container } = render(<DesinfPreCheckinModal tripId="trip-1" onClose={vi.fn()} onConfirm={vi.fn()} />);
        expect(screen.getByRole('dialog')).toBeTruthy();
        expect(container.querySelector('.modal-overlay')?.getAttribute('aria-hidden')).toBeNull();
    });
});
