/**
 * Tests RTL — page `/users` (Administration) : onglet actif porté par l'URL (`?onglet=`),
 * repli sur « Utilisateurs » pour un onglet inconnu ou hors de portée du rôle,
 * écriture de l'URL au changement d'onglet et redirection hors du panneau.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// URL simulée et réactive : `router.replace` réécrit les paramètres et réaffiche, comme Next.js.
const nav = vi.hoisted(() => ({
    params: new URLSearchParams(),
    listeners: new Set<() => void>(),
    replace: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
}));
vi.mock('next/navigation', async () => {
    const { useSyncExternalStore } = await import('react');
    const router = { replace: nav.replace, push: nav.push, refresh: nav.refresh };
    return {
        useSearchParams: () => useSyncExternalStore(
            (cb: () => void) => {
                nav.listeners.add(cb);
                return () => nav.listeners.delete(cb);
            },
            () => nav.params,
        ),
        usePathname: () => '/users',
        useRouter: () => router,
    };
});

const mockUseSession = vi.fn();
vi.mock('next-auth/react', () => ({ useSession: () => mockUseSession() }));

// Chaque onglet a ses propres tests : ici, seul compte celui qui est affiché.
vi.mock('@/components/admin/UsersTab', () => ({ default: () => <div data-testid="tab-users" /> }));
vi.mock('@/components/admin/MenusTab', () => ({ default: () => <div data-testid="tab-menus" /> }));
vi.mock('@/components/admin/ULsTab', () => ({ default: () => <div data-testid="tab-uls" /> }));
vi.mock('@/components/admin/BannersTab', () => ({ default: () => <div data-testid="tab-banners" /> }));
vi.mock('@/components/admin/ReferentielTab', () => ({ default: () => <div data-testid="tab-referentiel" /> }));
vi.mock('@/components/admin/ThemesTab', () => ({ default: () => <div data-testid="tab-themes" /> }));
vi.mock('@/components/admin/AuditLogTab', () => ({
    default: ({ users }: { users: unknown[] }) => <div data-testid="tab-audit">{users.length} personnes</div>,
}));

import AdminPage from '@/app/users/page';

const SESSIONS: Record<string, unknown> = {};
function sessionFor(roles: string[]) {
    const key = roles.join(',');
    // Objet stable d'un rendu à l'autre, comme le renvoie next-auth.
    SESSIONS[key] ??= { status: 'authenticated', data: { user: { email: 'moi@croix-rouge.fr', roles, ulId: 'ul-1' } }, update: vi.fn() };
    return SESSIONS[key];
}

function setUrl(query: string) {
    nav.params = new URLSearchParams(query);
}

/** Simule Next.js : applique l'URL écrite par `router.replace` et réaffiche. */
nav.replace.mockImplementation((href: string) => {
    nav.params = new URL(href, 'http://localhost').searchParams;
    nav.listeners.forEach(l => l());
});

function tabNames(): string[] {
    return screen.getAllByRole('tab').map(t => t.textContent ?? '');
}

function selectedTab(): string | null {
    return screen.getAllByRole('tab').find(t => t.getAttribute('aria-selected') === 'true')?.textContent ?? null;
}

beforeEach(() => {
    setUrl('');
    nav.listeners.clear();
    nav.replace.mockClear();
    nav.push.mockClear();
    global.fetch = vi.fn(async () => new Response(JSON.stringify({
        users: [{ id: 'u1', email: 'a@croix-rouge.fr', name: 'A', roles: [] }, { id: 'u2', email: 'b@croix-rouge.fr', name: 'B', roles: [] }],
        availableRoles: [],
    }), { status: 200 })) as unknown as typeof fetch;
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('AdminPage — onglet dans l’URL', () => {
    it('sans `onglet`, ouvre « Utilisateurs »', async () => {
        mockUseSession.mockReturnValue(sessionFor(['SUPER_ADMIN']));
        render(<AdminPage />);
        expect(await screen.findByTestId('tab-users')).toBeTruthy();
        expect(selectedTab()).toBe('Utilisateurs');
    });

    it('`?onglet=audit` ouvre le journal d’audit pour un super admin, avec la liste des utilisateurs', async () => {
        mockUseSession.mockReturnValue(sessionFor(['SUPER_ADMIN']));
        setUrl('onglet=audit&page=3');
        render(<AdminPage />);
        expect((await screen.findByTestId('tab-audit')).textContent).toBe('2 personnes');
        expect(selectedTab()).toBe("Journal d'audit");
        expect(screen.queryByTestId('tab-users')).toBeNull();
    });

    it.each([
        ['menus', 'tab-menus', 'Menus'],
        ['uls', 'tab-uls', null],
        ['banners', 'tab-banners', null],
        ['referentiel', 'tab-referentiel', 'Référentiel'],
        ['themes', 'tab-themes', 'Thèmes'],
    ])('`?onglet=%s` ouvre l’onglet correspondant (super admin)', async (onglet, testId, label) => {
        mockUseSession.mockReturnValue(sessionFor(['SUPER_ADMIN']));
        setUrl(`onglet=${onglet}`);
        render(<AdminPage />);
        expect(await screen.findByTestId(testId)).toBeTruthy();
        if (label) expect(selectedTab()).toBe(label);
    });

    it('un onglet inconnu retombe sur « Utilisateurs »', async () => {
        mockUseSession.mockReturnValue(sessionFor(['SUPER_ADMIN']));
        setUrl('onglet=inexistant');
        render(<AdminPage />);
        expect(await screen.findByTestId('tab-users')).toBeTruthy();
        expect(selectedTab()).toBe('Utilisateurs');
    });

    it('un ADMIN qui ouvre `?onglet=audit` retombe sur « Utilisateurs », sans onglet Journal d’audit', async () => {
        mockUseSession.mockReturnValue(sessionFor(['ADMIN']));
        setUrl('onglet=audit');
        render(<AdminPage />);
        expect(await screen.findByTestId('tab-users')).toBeTruthy();
        expect(screen.queryByTestId('tab-audit')).toBeNull();
        expect(tabNames()).not.toContain("Journal d'audit");
        expect(selectedTab()).toBe('Utilisateurs');
    });

    it('un ADMIN peut ouvrir les UL par l’URL ; un PRÉSIDENT non', async () => {
        mockUseSession.mockReturnValue(sessionFor(['ADMIN']));
        setUrl('onglet=uls');
        const { unmount } = render(<AdminPage />);
        expect(await screen.findByTestId('tab-uls')).toBeTruthy();
        unmount();

        mockUseSession.mockReturnValue(sessionFor(['PRESIDENT']));
        render(<AdminPage />);
        expect(await screen.findByTestId('tab-users')).toBeTruthy();
        expect(screen.queryByTestId('tab-uls')).toBeNull();
    });

    it('un SUPER_ADMIN inactif ne voit pas le journal d’audit par l’URL', async () => {
        // INACTIF bloque toute autorisation : pas d'accès au panneau, redirection vers l'accueil.
        mockUseSession.mockReturnValue(sessionFor(['SUPER_ADMIN', 'INACTIF']));
        setUrl('onglet=audit');
        render(<AdminPage />);
        await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/'));
        expect(screen.queryByTestId('tab-audit')).toBeNull();
    });

    it('cliquer un onglet écrit `?onglet=` et abandonne la page et le filtre du journal', async () => {
        mockUseSession.mockReturnValue(sessionFor(['SUPER_ADMIN']));
        setUrl('onglet=audit&page=3&personne=a%40croix-rouge.fr');
        render(<AdminPage />);
        await screen.findByTestId('tab-audit');

        fireEvent.click(screen.getByRole('tab', { name: 'Thèmes' }));
        expect(nav.replace).toHaveBeenLastCalledWith('/users?onglet=themes', { scroll: false });
        expect(await screen.findByTestId('tab-themes')).toBeTruthy();
        expect(nav.params.toString()).toBe('onglet=themes');

        fireEvent.click(screen.getByRole('tab', { name: 'Utilisateurs' }));
        expect(nav.replace).toHaveBeenLastCalledWith('/users', { scroll: false });
        expect(await screen.findByTestId('tab-users')).toBeTruthy();
    });

    it('cliquer l’onglet Journal d’audit l’ouvre et l’écrit dans l’URL', async () => {
        mockUseSession.mockReturnValue(sessionFor(['SUPER_ADMIN']));
        render(<AdminPage />);
        await screen.findByTestId('tab-users');
        fireEvent.click(screen.getByRole('tab', { name: "Journal d'audit" }));
        expect(await screen.findByTestId('tab-audit')).toBeTruthy();
        expect(nav.params.get('onglet')).toBe('audit');
    });
});

describe('AdminPage — accès', () => {
    it('redirige un visiteur non connecté vers l’accueil', async () => {
        mockUseSession.mockReturnValue({ status: 'unauthenticated', data: null, update: vi.fn() });
        render(<AdminPage />);
        await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/'));
    });

    it('redirige un rôle sans accès au panneau (CHVL)', async () => {
        mockUseSession.mockReturnValue(sessionFor(['CHVL']));
        setUrl('onglet=audit');
        render(<AdminPage />);
        await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/'));
        expect(global.fetch).not.toHaveBeenCalled();
    });
});
