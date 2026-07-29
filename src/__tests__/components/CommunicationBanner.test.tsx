import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CommunicationBanner from '@/components/CommunicationBanner';

vi.mock('next/navigation', () => ({
    usePathname: vi.fn(),
}));

vi.mock('next-auth/react', () => ({
    useSession: vi.fn(),
}));

vi.mock('@/lib/contexts/ULContext', () => ({
    useUL: vi.fn(),
}));

import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useUL } from '@/lib/contexts/ULContext';

const mockUsePathname = vi.mocked(usePathname);
const mockUseSession = vi.mocked(useSession);
const mockUseUL = vi.mocked(useUL);

describe('CommunicationBanner component', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mockUsePathname.mockReturnValue('/vehicles');
        mockUseSession.mockReturnValue({
            data: { user: { id: 'u1', email: 'test@dev.local', roles: ['CHVL'], ulId: 'ul-paris-18' } },
            status: 'authenticated',
            update: vi.fn(),
        } as never);
        mockUseUL.mockReturnValue({
            activeUL: { id: 'ul-paris-18', name: 'Paris 18', slug: 'paris-18', isHome: true },
            availableULs: [],
            switchUL: vi.fn(),
            isMultiUL: false,
        });

        // Default mock fetch
        global.fetch = vi.fn();
    });

    it('renders null when unauthenticated', async () => {
        mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated', update: vi.fn() } as never);
        const { container } = render(<CommunicationBanner />);
        expect(container.firstChild).toBeNull();
    });

    it('renders null when fetch returns empty banners list', async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
            ok: true,
            json: async () => ({ banners: [] }),
        });

        const { container } = render(<CommunicationBanner />);
        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith('/api/banners?ulId=ul-paris-18');
        });
        expect(container.firstChild).toBeNull();
    });

    it('renders single banner without pagination when 1 banner matches', async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
            ok: true,
            json: async () => ({
                banners: [
                    {
                        id: 'b1',
                        title: 'Alerte Entretien',
                        message: 'Vidange prévue lundi.',
                        target_page: 'VEHICLES',
                        type: 'warning',
                        ul_id: 'ul-paris-18',
                        is_global: false,
                        is_active: true,
                    }
                ]
            }),
        });

        render(<CommunicationBanner />);

        await waitFor(() => {
            expect(screen.getByText('Alerte Entretien')).toBeTruthy();
            expect(screen.getByText('Vidange prévue lundi.')).toBeTruthy();
        });

        // No pagination indicator should be visible for a single banner
        expect(screen.queryByText(/1 \/ 1/)).toBeNull();
        expect(screen.queryByTitle('Bandeau suivant')).toBeNull();
    });

    it('renders pagination and navigates between multiple matching banners', async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
            ok: true,
            json: async () => ({
                banners: [
                    {
                        id: 'b1',
                        title: 'Info 1',
                        message: 'Premier message',
                        target_page: 'ALL',
                        type: 'info',
                        ul_id: 'ul-paris-18',
                        is_global: false,
                        is_active: true,
                    },
                    {
                        id: 'b2',
                        title: 'Info 2',
                        message: 'Deuxième message',
                        target_page: 'VEHICLES',
                        type: 'danger',
                        ul_id: null,
                        is_global: true,
                        is_active: true,
                    }
                ]
            }),
        });

        render(<CommunicationBanner />);

        await waitFor(() => {
            expect(screen.getByText('Premier message')).toBeTruthy();
            expect(screen.getByText('1 / 2')).toBeTruthy();
        });

        // Click next button to switch to second banner
        const nextBtn = screen.getByTitle('Bandeau suivant');
        fireEvent.click(nextBtn);

        expect(screen.getByText('Deuxième message')).toBeTruthy();
        expect(screen.getByText('2 / 2')).toBeTruthy();

        // Click next button again to wrap around to first banner
        fireEvent.click(nextBtn);

        expect(screen.getByText('Premier message')).toBeTruthy();
        expect(screen.getByText('1 / 2')).toBeTruthy();
    });

    it('filters out banners not matching the current pathname', async () => {
        mockUsePathname.mockReturnValue('/missions');

        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
            ok: true,
            json: async () => ({
                banners: [
                    {
                        id: 'b-vehicles-only',
                        title: 'Véhicules uniquement',
                        message: 'Ce message est réservé à la page véhicules',
                        target_page: 'VEHICLES',
                        type: 'info',
                        ul_id: 'ul-paris-18',
                        is_global: false,
                        is_active: true,
                    }
                ]
            }),
        });

        const { container } = render(<CommunicationBanner />);

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalled();
        });

        expect(container.firstChild).toBeNull();
    });

    it('renders clickable link when link_url is present', async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
            ok: true,
            json: async () => ({
                banners: [
                    {
                        id: 'b-link',
                        title: 'Info avec lien',
                        message: 'Consultez la fiche de mission.',
                        target_page: 'ALL',
                        type: 'info',
                        ul_id: 'ul-paris-18',
                        is_global: false,
                        is_active: true,
                        link_url: 'https://example.com/doc',
                        link_label: 'Voir le document',
                    }
                ]
            }),
        });

        render(<CommunicationBanner />);

        await waitFor(() => {
            const linkElement = screen.getByRole('link', { name: /Voir le document/i });
            expect(linkElement).toBeTruthy();
            expect(linkElement.getAttribute('href')).toBe('https://example.com/doc');
            expect(linkElement.getAttribute('target')).toBe('_blank');
            expect(linkElement.getAttribute('rel')).toBe('noopener noreferrer');
        });
    });
});
