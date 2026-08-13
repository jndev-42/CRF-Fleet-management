import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockPathname = '/vehicles';
const mockSignOut = vi.fn();
const mockSwitchUL = vi.fn();
type Visibility = 'available' | 'admin_only' | 'disabled';
let mockGetVisibility = vi.fn<(key: string) => Visibility>(() => 'available');
let mockUL: {
    activeUL: { id: string; name: string } | null;
    availableULs: { id: string; name: string }[];
    isMultiUL: boolean;
    switchUL: typeof mockSwitchUL;
} = {
    activeUL: { id: 'ul-1', name: 'Paris 18' },
    availableULs: [{ id: 'ul-1', name: 'Paris 18' }],
    isMultiUL: false,
    switchUL: mockSwitchUL,
};

vi.mock('next/navigation', () => ({
    usePathname: () => mockPathname,
}));

vi.mock('next-auth/react', () => ({
    signOut: (...args: unknown[]) => mockSignOut(...args),
}));

vi.mock('@/lib/contexts/MenuSettingsContext', () => ({
    useMenuSettings: () => ({ getVisibility: mockGetVisibility }),
}));

vi.mock('@/lib/contexts/ULContext', () => ({
    useUL: () => mockUL,
}));

vi.mock('@/components/NotificationBell', () => ({
    NotificationBell: () => <div data-testid="notification-bell" />,
}));

import Navbar from '@/components/Navbar';

beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = '/vehicles';
    mockGetVisibility = vi.fn<(key: string) => Visibility>(() => 'available');
    mockUL = {
        activeUL: { id: 'ul-1', name: 'Paris 18' },
        availableULs: [{ id: 'ul-1', name: 'Paris 18' }],
        isMultiUL: false,
        switchUL: mockSwitchUL,
    };
});

describe('Navbar', () => {
    it('affiche seulement le logo et le toggle de thème sans utilisateur', () => {
        render(<Navbar />);
        expect(screen.getByText('Martine')).toBeTruthy();
        expect(screen.queryByLabelText('Ouvrir le menu de navigation')).toBeNull();
    });

    it('affiche le menu de navigation pour un utilisateur connecté', () => {
        render(<Navbar user={{ email: 'user@test.com', roles: ['CHVL'] }} />);
        expect(screen.getByLabelText('Ouvrir le menu de navigation')).toBeTruthy();
        expect(screen.getByText('Véhicules')).toBeTruthy();
        expect(screen.getByText('Frais')).toBeTruthy();
    });

    it('masque Statistiques/Inventaire/Missions/Administration pour un rôle CHVL basique', () => {
        render(<Navbar user={{ email: 'user@test.com', roles: ['CHVL'] }} />);
        expect(screen.queryByText('Inventaire')).toBeNull();
        expect(screen.queryByText('Missions')).toBeNull();
        expect(screen.queryByText('Administration')).toBeNull();
    });

    it('affiche Administration pour un admin', () => {
        render(<Navbar user={{ email: 'admin@test.com', roles: ['ADMIN'] }} />);
        expect(screen.getByText('Administration')).toBeTruthy();
        expect(screen.getByText('Inventaire')).toBeTruthy();
    });

    it('masque Statistiques pour un utilisateur INACTIF', () => {
        render(<Navbar user={{ email: 'inactif@test.com', roles: ['INACTIF'] }} />);
        expect(screen.queryByText('Statistiques')).toBeNull();
        expect(screen.queryByTestId('notification-bell')).toBeNull();
    });

    it('respecte un réglage de menu admin_only pour un non-super-admin', () => {
        mockGetVisibility = vi.fn((key: string) => (key === 'stats' ? 'admin_only' : 'available'));
        render(<Navbar user={{ email: 'admin@test.com', roles: ['ADMIN'] }} />);
        expect(screen.queryByText('Statistiques')).toBeNull();
    });

    it('ouvre et ferme le menu mobile via le bouton burger', () => {
        render(<Navbar user={{ email: 'user@test.com', roles: ['CHVL'] }} />);
        const burger = screen.getByLabelText('Ouvrir le menu de navigation');
        expect(burger.getAttribute('aria-expanded')).toBe('false');

        fireEvent.click(burger);
        expect(burger.getAttribute('aria-expanded')).toBe('true');
    });

    it('appelle signOut lors du clic sur Déconnexion', () => {
        render(<Navbar user={{ email: 'user@test.com', roles: ['CHVL'] }} />);
        fireEvent.click(screen.getByLabelText('Se déconnecter'));
        expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: '/login' });
    });

    it('affiche un sélecteur d\'UL en mode multi-UL', () => {
        mockUL = {
            activeUL: { id: 'ul-1', name: 'Paris 18' },
            availableULs: [{ id: 'ul-1', name: 'Paris 18' }, { id: 'ul-2', name: 'Lyon 3' }],
            isMultiUL: true,
            switchUL: mockSwitchUL,
        };
        render(<Navbar user={{ email: 'user@test.com', roles: ['CHVL'] }} />);
        expect(screen.getByLabelText('Changer d\'Unité Locale')).toBeTruthy();
    });

    it('change d\'UL via le sélecteur', () => {
        mockUL = {
            activeUL: { id: 'ul-1', name: 'Paris 18' },
            availableULs: [{ id: 'ul-1', name: 'Paris 18' }, { id: 'ul-2', name: 'Lyon 3' }],
            isMultiUL: true,
            switchUL: mockSwitchUL,
        };
        render(<Navbar user={{ email: 'user@test.com', roles: ['CHVL'] }} />);
        fireEvent.change(screen.getByLabelText('Changer d\'Unité Locale'), { target: { value: 'ul-2' } });
        expect(mockSwitchUL).toHaveBeenCalledWith('ul-2');
    });
});
