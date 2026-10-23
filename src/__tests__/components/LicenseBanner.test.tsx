import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockUseSession = vi.fn();
vi.mock('next-auth/react', () => ({ useSession: () => mockUseSession() }));

import LicenseBanner from '@/components/LicenseBanner';

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('LicenseBanner', () => {
    it.each([['TRESORIER'], ['PRESIDENT'], ['DT']])('ne rend rien et n\'interroge pas l\'API pour un %s (n\'emprunte jamais)', async (role) => {
        mockUseSession.mockReturnValue({ status: 'authenticated', data: { user: { roles: [role] } } });
        const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ validated: false, daysLeft: 0, blocked: true }), { status: 200 }));

        const { container } = render(<LicenseBanner />);
        await act(async () => { await Promise.resolve(); });
        expect(container.firstChild).toBeNull();
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('affiche le blocage à un ADMIN sans rôle chauffeur (aucune dispense de papiers)', async () => {
        mockUseSession.mockReturnValue({ status: 'authenticated', data: { user: { roles: ['ADMIN'] } } });
        const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ validated: false, daysLeft: 0, blocked: true }), { status: 200 }));

        render(<LicenseBanner />);
        expect(await screen.findByText(/Accès bloqué/)).toBeTruthy();
        expect(fetchSpy).toHaveBeenCalledWith('/api/me/license-check');
    });

    it('affiche le délai restant à un rôle non-conducteur dont les papiers sont invalidés', async () => {
        mockUseSession.mockReturnValue({ status: 'authenticated', data: { user: { roles: ['RESP_VEHICULE'] } } });
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ validated: false, daysLeft: 4, blocked: false }), { status: 200 }));

        render(<LicenseBanner />);
        expect(await screen.findByText(/Validation des papiers requise/)).toBeTruthy();
        expect(screen.getByText(/4 jours/)).toBeTruthy();
    });

    it('ne rend rien tant que non authentifié', () => {
        mockUseSession.mockReturnValue({ status: 'unauthenticated', data: null });
        const { container } = render(<LicenseBanner />);
        expect(container.firstChild).toBeNull();
    });

    it('affiche un avertissement avec le nombre de jours restants', async () => {
        mockUseSession.mockReturnValue({ status: 'authenticated', data: { user: { roles: ['CHVL'] } } });
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ validated: false, daysLeft: 3, blocked: false }), { status: 200 }));

        render(<LicenseBanner />);
        expect(await screen.findByText(/Validation des papiers requise/)).toBeTruthy();
        expect(screen.getByText(/3 jours/)).toBeTruthy();
    });

    it('affiche un message de blocage si bloqué', async () => {
        mockUseSession.mockReturnValue({ status: 'authenticated', data: { user: { roles: ['CHVL'] } } });
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ validated: false, daysLeft: null, blocked: true }), { status: 200 }));

        render(<LicenseBanner />);
        expect(await screen.findByText(/Accès bloqué/)).toBeTruthy();
    });

    it('mentionne l\'attestation préfectorale pour un CHVPSP', async () => {
        mockUseSession.mockReturnValue({ status: 'authenticated', data: { user: { roles: ['CHVPSP'] } } });
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ validated: false, daysLeft: 5, blocked: false }), { status: 200 }));

        render(<LicenseBanner />);
        expect(await screen.findByText(/attestation préfectorale/)).toBeTruthy();
    });

    it('ne rend rien une fois les papiers validés', async () => {
        mockUseSession.mockReturnValue({ status: 'authenticated', data: { user: { roles: ['CHVL'] } } });
        vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ validated: true, daysLeft: null, blocked: false }), { status: 200 }));

        const { container } = render(<LicenseBanner />);
        await act(async () => { await Promise.resolve(); });
        expect(container.firstChild).toBeNull();
    });
});
