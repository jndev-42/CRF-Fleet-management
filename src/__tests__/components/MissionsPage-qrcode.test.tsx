import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/navigation', () => ({
    useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

vi.mock('next-auth/react', () => ({
    useSession: vi.fn(),
}));

vi.mock('./MissionsTable', () => ({
    default: () => <div data-testid="missions-table" />,
}));

import MissionsPage from '@/app/missions/page';
import { useSession } from 'next-auth/react';

const mockUseSession = vi.mocked(useSession);

function mockSession(roles: string[], ulId: string | undefined = 'ul-paris-18') {
    mockUseSession.mockReturnValue({
        status: 'authenticated',
        data: {
            user: {
                roles,
                ulId,
                availableULs: ulId ? [{ id: ulId, name: 'Paris 18', isHome: true }] : [],
            },
        },
    } as never);
}

beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(global, 'fetch').mockImplementation((input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : String(input);
        if (url.includes('/api/missions?')) {
            return Promise.resolve(new Response(JSON.stringify({ reports: [], total: 0 }), { status: 200 }));
        }
        if (url.includes('/qr-token')) {
            return Promise.resolve(new Response(JSON.stringify({ token: 'tok-paris-18' }), { status: 200 }));
        }
        return Promise.resolve(new Response('{}', { status: 200 }));
    });
});

describe('MissionsPage — bouton QR Code', () => {
    it('n\'affiche pas le bouton pour un CI/RPAPS (non gestionnaire)', async () => {
        mockSession(['CI/RPAPS']);
        render(<MissionsPage />);
        await screen.findByText('Aucun compte rendu trouvé.');
        expect(screen.queryByRole('button', { name: /QR Code/ })).toBeNull();
    });

    it('n\'affiche pas le bouton sans UL active', async () => {
        mockSession(['ADMIN'], 'default');
        render(<MissionsPage />);
        await screen.findByText('Aucun compte rendu trouvé.');
        expect(screen.queryByRole('button', { name: /QR Code/ })).toBeNull();
    });

    it('affiche le bouton pour un CADRE avec une UL active, et ouvre la modale au clic', async () => {
        mockSession(['CADRE']);
        render(<MissionsPage />);

        const button = await screen.findByRole('button', { name: /QR Code — Paris 18/ });
        fireEvent.click(button);

        await screen.findByText('QR Code — Unité Locale Paris 18');
        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith('/api/ul/ul-paris-18/qr-token', { method: 'POST' });
        });
    });

    it('affiche le bouton pour un ADMIN', async () => {
        mockSession(['ADMIN']);
        render(<MissionsPage />);
        expect(await screen.findByRole('button', { name: /QR Code — Paris 18/ })).toBeTruthy();
    });
});
