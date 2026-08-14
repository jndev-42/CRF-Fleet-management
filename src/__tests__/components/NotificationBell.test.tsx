import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: mockPush }),
    useSearchParams: () => mockSearchParams,
}));

vi.mock('@/lib/contexts/ULContext', () => ({
    useUL: () => ({ activeUL: { id: 'ul-paris-18', name: 'Paris 18' } }),
}));

import { NotificationBell } from '@/components/NotificationBell';

function getUrl(input: string | URL | Request): string {
    if (typeof input === 'string') return input;
    if ('url' in input && typeof input.url === 'string') return input.url;
    return String(input);
}

const notif1 = { id: 'notif-1', title: 'Véhicule VL186', message: 'Retour effectué', isRead: false, createdAt: new Date().toISOString() };
const notif2 = { id: 'notif-2', title: 'Réservation validée', message: 'Votre réservation a été validée', url: '/vehicles/VL186', isRead: false, createdAt: new Date().toISOString() };

async function defaultFetchHandler(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const url = getUrl(input);
    if (url.includes('/api/notifications') && (!init || init.method === undefined)) {
        return new Response(JSON.stringify({ notifications: [notif1, notif2] }), { status: 200 });
    }
    if (url.includes('/api/notifications') && init?.method === 'DELETE') {
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
    mockSearchParams = new URLSearchParams();
});

afterEach(() => {
    vi.restoreAllMocks();
    window.history.pushState({}, '', '/');
});

describe('NotificationBell', () => {
    it('affiche un badge non-lu quand des notifications existent', async () => {
        mockFetch();
        const { container } = render(<NotificationBell />);
        await waitFor(() => expect(container.querySelector('.notification-badge')).toBeTruthy());
    });

    it('n\'affiche pas de badge sans notification', async () => {
        mockFetch(async () => new Response(JSON.stringify({ notifications: [] }), { status: 200 }));
        const { container } = render(<NotificationBell />);
        await waitFor(() => expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy());
        expect(container.querySelector('.notification-badge')).toBeNull();
    });

    it('ouvre le dropdown et affiche la liste des notifications', async () => {
        mockFetch();
        render(<NotificationBell />);
        await waitFor(() => screen.getByRole('button', { name: 'Notifications' }));

        fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));

        expect(await screen.findByText('Véhicule VL186')).toBeTruthy();
        expect(screen.getByText('Réservation validée')).toBeTruthy();
    });

    it('affiche "Aucune notification" pour une liste vide', async () => {
        mockFetch(async () => new Response(JSON.stringify({ notifications: [] }), { status: 200 }));
        render(<NotificationBell />);
        await waitFor(() => screen.getByRole('button', { name: 'Notifications' }));

        fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));

        expect(await screen.findByText('Aucune notification')).toBeTruthy();
    });

    it('supprime une notification cliquée et navigue vers son URL', async () => {
        const fetchMock = mockFetch();
        render(<NotificationBell />);
        await waitFor(() => screen.getByRole('button', { name: 'Notifications' }));
        fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));

        const item = await screen.findByText('Réservation validée');
        fireEvent.click(item.closest('.notification-item')!);

        await waitFor(() => {
            const deleteCall = fetchMock.mock.calls.find(c => getUrl(c[0]).includes('/api/notifications/notif-2') && (c[1] as RequestInit)?.method === 'DELETE');
            expect(deleteCall).toBeTruthy();
        });
        expect(mockPush).toHaveBeenCalledWith('/vehicles/VL186');
    });

    it('efface toutes les notifications via "Effacer"', async () => {
        const fetchMock = mockFetch();
        render(<NotificationBell />);
        await waitFor(() => screen.getByRole('button', { name: 'Notifications' }));
        fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));

        await screen.findByText('Véhicule VL186');
        fireEvent.click(screen.getByTitle('Tout effacer'));

        await waitFor(() => {
            const clearCall = fetchMock.mock.calls.find(c => getUrl(c[0]) === '/api/notifications' && (c[1] as RequestInit)?.method === 'DELETE');
            expect(clearCall).toBeTruthy();
        });
        expect(screen.getByText('Aucune notification')).toBeTruthy();
    });

    it('ferme le dropdown au clic en dehors', async () => {
        mockFetch();
        render(<NotificationBell />);
        await waitFor(() => screen.getByRole('button', { name: 'Notifications' }));
        fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
        expect(await screen.findByText('Notifications')).toBeTruthy();

        fireEvent.mouseDown(document.body);

        await waitFor(() => expect(screen.queryByText('Aucune notification')).toBeNull());
    });

    it('nettoie les notifications correspondantes en arrivant depuis un push (?fromPush=true)', async () => {
        mockSearchParams = new URLSearchParams('fromPush=true');
        window.history.pushState({}, '', '/vehicles/VL186?fromPush=true');
        const fetchMock = mockFetch();

        render(<NotificationBell />);

        await waitFor(() => {
            const deleteCall = fetchMock.mock.calls.find(c => getUrl(c[0]).includes('/api/notifications/notif-2') && (c[1] as RequestInit)?.method === 'DELETE');
            expect(deleteCall).toBeTruthy();
        });
    });
});
