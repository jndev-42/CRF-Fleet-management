import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/contexts/ULContext', () => ({
    useUL: () => ({ activeUL: { id: 'ul-paris-18', name: 'Paris 18' } }),
}));

const push = vi.hoisted(() => ({
    status: 'enabled' as string,
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    detachDevice: vi.fn(),
}));
vi.mock('@/components/PushProvider', () => ({ usePush: () => push }));

import { NotificationBell } from '@/components/NotificationBell';

async function openDropdown() {
    render(<NotificationBell />);
    fireEvent.click(screen.getByLabelText('Notifications'));
}

beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ notifications: [] }), { status: 200 }));
    push.status = 'enabled';
    push.subscribe.mockReset().mockResolvedValue(true);
    push.unsubscribe.mockReset().mockResolvedValue(undefined);
});

describe('NotificationBell — interrupteur push', () => {
    it('masque l\'interrupteur si le push n\'est pas supporté', async () => {
        push.status = 'unsupported';
        await openDropdown();
        expect(screen.queryByText('Notifications push')).toBeNull();
    });

    it('désactive les notifications push quand elles sont activées', async () => {
        await openDropdown();
        fireEvent.click(await screen.findByText('Activées'));
        await waitFor(() => expect(push.unsubscribe).toHaveBeenCalledTimes(1));
    });

    it('active les notifications push quand elles sont désactivées', async () => {
        push.status = 'disabled';
        await openDropdown();
        fireEvent.click(await screen.findByText('Désactivées'));
        await waitFor(() => expect(push.subscribe).toHaveBeenCalledTimes(1));
    });

    it('explique comment réactiver quand l\'autorisation est refusée, sans redemander', async () => {
        push.status = 'denied';
        await openDropdown();
        fireEvent.click(await screen.findByText('Désactivées'));
        expect(await screen.findByText(/paramètres de votre navigateur/)).toBeTruthy();
        expect(push.subscribe).not.toHaveBeenCalled();
    });
});
