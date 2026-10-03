import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// URL simulée et réactive : `router.replace` réécrit les paramètres et réaffiche, comme Next.js.
const nav = vi.hoisted(() => ({
    params: new URLSearchParams(),
    listeners: new Set<() => void>(),
    replace: (href: string) => {
        nav.params = new URL(href, 'http://localhost').searchParams;
        nav.listeners.forEach(l => l());
    },
}));
vi.mock('next/navigation', async () => {
    const { useSyncExternalStore } = await import('react');
    const router = { replace: (href: string) => nav.replace(href) };
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

import AuditLogTab, { type AuditLogEntry } from '@/components/admin/AuditLogTab';

const AS_OF = '2026-10-03T10:00:00.000Z';

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status });
}

function entry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
    return {
        id: 'e1',
        createdAt: '2026-10-02T08:30:00.000Z',
        actorEmail: 'admin@croix-rouge.fr',
        actorName: 'Admin CRF',
        impersonatedEmail: null,
        method: 'DELETE',
        path: '/api/vehicles/abc',
        action: "Suppression d'un véhicule",
        entityType: 'vehicle',
        entityId: 'abc',
        status: 200,
        ip: '203.0.113.7',
        ...overrides,
    };
}

/** Réponse paginée de l'API. */
function pageOf(entries: AuditLogEntry[], page: number, total: number, totalPages: number, asOf = AS_OF) {
    return { entries, page, total, totalPages, asOf };
}

const users = [
    { email: 'admin@croix-rouge.fr', name: 'Admin CRF' },
    { email: 'chauffeur@croix-rouge.fr', name: null },
];

let calls: string[];

function mockFetch(handler: Record<string, unknown> | ((url: string) => Response | Promise<Response>)) {
    calls = [];
    vi.spyOn(global, 'fetch').mockImplementation((async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        if (typeof handler === 'function') return handler(url);
        return json(handler);
    }) as typeof fetch);
}

function button(name: string): HTMLButtonElement {
    return screen.getByRole('button', { name }) as HTMLButtonElement;
}

beforeEach(() => {
    calls = [];
    nav.params = new URLSearchParams('onglet=audit');
    nav.listeners.clear();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('AuditLogTab', () => {
    it('affiche la première page (10 lignes), auteur, action, ressource et résultat', async () => {
        mockFetch(pageOf([
            entry(),
            entry({ id: 'e2', status: 403, action: "Modification des rôles d'un utilisateur", entityType: 'user', entityId: 'x@croix-rouge.fr' }),
        ], 1, 2, 1));
        render(<AuditLogTab users={users} />);

        expect(await screen.findByText("Suppression d'un véhicule")).toBeTruthy();
        expect(calls[0]).toBe('/api/audit-logs?limit=10&page=1');
        const rows = screen.getAllByRole('row').slice(1);
        expect(rows).toHaveLength(2);
        expect(within(rows[0]).getByText('Admin CRF')).toBeTruthy();
        expect(within(rows[0]).getByText('vehicle/abc').getAttribute('title')).toBe('DELETE /api/vehicles/abc · IP 203.0.113.7');
        expect(within(rows[0]).getByText('OK · 200')).toBeTruthy();
        // Les refus sont distinguables.
        expect(within(rows[1]).getByText('Échec · 403')).toBeTruthy();
        expect(screen.getByText('Page 1 sur 1')).toBeTruthy();
        expect(screen.getByText('1 à 2 sur 2 événements')).toBeTruthy();
        expect(button('Page précédente').disabled).toBe(true);
        expect(button('Page suivante').disabled).toBe(true);
    });

    it("signale l'utilisateur incarné", async () => {
        mockFetch(pageOf([entry({ actorName: null, actorEmail: 'super@croix-rouge.fr', impersonatedEmail: 'x@croix-rouge.fr' })], 1, 1, 1));
        render(<AuditLogTab users={users} />);
        expect(await screen.findByText('en tant que x@croix-rouge.fr')).toBeTruthy();
        expect(screen.getByText('super@croix-rouge.fr')).toBeTruthy();
        expect(screen.getByText('1 à 1 sur 1 événement')).toBeTruthy();
    });

    it("filtre sur la personne choisie et l'écrit dans l'URL, en revenant à la page 1", async () => {
        nav.params = new URLSearchParams('onglet=audit&page=2');
        mockFetch(url => json(pageOf([entry()], url.includes('page=2') ? 2 : 1, 15, 2)));
        render(<AuditLogTab users={users} />);
        expect(await screen.findByText('Page 2 sur 2')).toBeTruthy();

        fireEvent.change(screen.getByLabelText('Personne'), { target: { value: 'chauffeur@croix-rouge.fr' } });
        await waitFor(() => expect(calls.at(-1)).toBe('/api/audit-logs?limit=10&page=1&userEmail=chauffeur%40croix-rouge.fr'));
        expect(nav.params.toString()).toBe('onglet=audit&personne=chauffeur%40croix-rouge.fr');
        expect(await screen.findByText('Page 1 sur 2')).toBeTruthy();
    });

    it("reprend la page et la personne de l'URL au chargement", async () => {
        nav.params = new URLSearchParams('onglet=audit&page=3&personne=chauffeur%40croix-rouge.fr');
        mockFetch(() => json(pageOf([entry()], 3, 30, 3)));
        render(<AuditLogTab users={users} />);
        expect(await screen.findByText('Page 3 sur 3')).toBeTruthy();
        expect(calls[0]).toBe('/api/audit-logs?limit=10&page=3&userEmail=chauffeur%40croix-rouge.fr');
        expect((screen.getByLabelText('Personne') as HTMLSelectElement).value).toBe('chauffeur@croix-rouge.fr');
    });

    it('navigue de page en page en figeant la liste (asOf) et en écrivant la page dans l’URL', async () => {
        mockFetch(url => (url.includes('page=2')
            ? json(pageOf([entry({ id: 'e2', action: "Prise d'un véhicule" })], 2, 11, 2))
            : json(pageOf([entry()], 1, 11, 2))));
        render(<AuditLogTab users={users} />);
        expect(await screen.findByText('Page 1 sur 2')).toBeTruthy();
        expect(screen.getByText('1 à 10 sur 11 événements')).toBeTruthy();

        fireEvent.click(button('Page suivante'));
        expect(await screen.findByText("Prise d'un véhicule")).toBeTruthy();
        expect(screen.queryByText("Suppression d'un véhicule")).toBeNull();
        expect(calls[1]).toBe(`/api/audit-logs?limit=10&page=2&asOf=${encodeURIComponent(AS_OF)}`);
        expect(nav.params.get('page')).toBe('2');
        expect(screen.getByText('11 à 11 sur 11 événements')).toBeTruthy();
        expect(button('Page suivante').disabled).toBe(true);

        fireEvent.click(button('Page précédente'));
        expect(await screen.findByText("Suppression d'un véhicule")).toBeTruthy();
        expect(calls[2]).toBe(`/api/audit-logs?limit=10&page=1&asOf=${encodeURIComponent(AS_OF)}`);
        expect(nav.params.has('page')).toBe(false);
    });

    it('première / dernière page et « Aller à »', async () => {
        mockFetch(url => json(pageOf([entry()], Number(new URL(url, 'http://l').searchParams.get('page')), 50, 5)));
        render(<AuditLogTab users={users} />);
        expect(await screen.findByText('Page 1 sur 5')).toBeTruthy();

        fireEvent.click(button('Dernière page'));
        expect(await screen.findByText('Page 5 sur 5')).toBeTruthy();

        fireEvent.change(screen.getByLabelText('Aller à'), { target: { value: '3' } });
        fireEvent.click(button('OK'));
        expect(await screen.findByText('Page 3 sur 5')).toBeTruthy();

        fireEvent.click(button('Première page'));
        expect(await screen.findByText('Page 1 sur 5')).toBeTruthy();
    });

    it('« Actualiser » refige la liste et revient à la page 1', async () => {
        nav.params = new URLSearchParams('onglet=audit&page=2');
        let n = 0;
        mockFetch(url => json(pageOf([entry()], url.includes('page=2') ? 2 : 1, 20, 2, `2026-10-03T10:00:0${n++}.000Z`)));
        render(<AuditLogTab users={users} />);
        expect(await screen.findByText('Page 2 sur 2')).toBeTruthy();
        expect(calls[0]).toBe('/api/audit-logs?limit=10&page=2');

        fireEvent.click(button('Actualiser'));
        expect(await screen.findByText('Page 1 sur 2')).toBeTruthy();
        // Pas d'asOf : le serveur fige la liste à l'instant présent.
        expect(calls[1]).toBe('/api/audit-logs?limit=10&page=1');

        fireEvent.click(button('Page suivante'));
        await waitFor(() => expect(calls).toHaveLength(3));
        expect(calls[2]).toBe(`/api/audit-logs?limit=10&page=2&asOf=${encodeURIComponent('2026-10-03T10:00:01.000Z')}`);
    });

    it('« Actualiser » en page 1 relance la requête', async () => {
        mockFetch(() => json(pageOf([entry()], 1, 1, 1)));
        render(<AuditLogTab users={users} />);
        await screen.findByText('Page 1 sur 1');
        fireEvent.click(button('Actualiser'));
        await waitFor(() => expect(calls).toEqual(['/api/audit-logs?limit=10&page=1', '/api/audit-logs?limit=10&page=1']));
    });

    it("se replie sur la dernière page quand la page de l'URL n'existe pas", async () => {
        nav.params = new URLSearchParams('onglet=audit&page=9');
        mockFetch(url => (url.includes('page=9')
            ? json(pageOf([], 9, 12, 2))
            : json(pageOf([entry({ id: 'r1', action: 'Dernière page' })], 2, 12, 2))));
        render(<AuditLogTab users={users} />);
        expect(await screen.findByText('Dernière page')).toBeTruthy();
        expect(screen.getByText('Page 2 sur 2')).toBeTruthy();
        expect(nav.params.get('page')).toBe('2');
        expect(calls[1]).toBe(`/api/audit-logs?limit=10&page=2&asOf=${encodeURIComponent(AS_OF)}`);
    });

    it("une page invalide dans l'URL vaut la page 1", async () => {
        nav.params = new URLSearchParams('onglet=audit&page=abc');
        mockFetch(() => json(pageOf([entry()], 1, 1, 1)));
        render(<AuditLogTab users={users} />);
        await screen.findByText('Page 1 sur 1');
        expect(calls[0]).toBe('/api/audit-logs?limit=10&page=1');
    });

    it('ignore une réponse périmée arrivée après un changement de personne', async () => {
        const pending: ((r: Response) => void)[] = [];
        mockFetch(url => {
            if (url.includes('userEmail=')) return json(pageOf([entry({ id: 'c1', action: 'Action du chauffeur' })], 1, 1, 1));
            return new Promise<Response>(resolve => pending.push(resolve));
        });
        render(<AuditLogTab users={users} />);
        await waitFor(() => expect(pending).toHaveLength(1));

        fireEvent.change(screen.getByLabelText('Personne'), { target: { value: 'chauffeur@croix-rouge.fr' } });
        expect(await screen.findByText('Action du chauffeur')).toBeTruthy();

        // La réponse « toutes les personnes » arrive en retard : elle est ignorée.
        await act(async () => {
            pending[0](json(pageOf([entry({ id: 'old', action: 'Action périmée' })], 1, 40, 4)));
        });
        expect(screen.queryByText('Action périmée')).toBeNull();
        expect(screen.getAllByRole('row').slice(1)).toHaveLength(1);
        expect(screen.getByText('Page 1 sur 1')).toBeTruthy();
    });

    it("une page suivante en cours n'écrase pas la liste d'une autre personne", async () => {
        const pending: ((r: Response) => void)[] = [];
        mockFetch(url => {
            if (url.includes('page=2')) return new Promise<Response>(resolve => pending.push(resolve));
            if (url.includes('userEmail=')) return json(pageOf([entry({ id: 'c1', action: 'Action du chauffeur' })], 1, 1, 1));
            return json(pageOf([entry()], 1, 20, 2));
        });
        render(<AuditLogTab users={users} />);

        fireEvent.click(await screen.findByRole('button', { name: 'Page suivante' }));
        await waitFor(() => expect(pending).toHaveLength(1));
        fireEvent.change(screen.getByLabelText('Personne'), { target: { value: 'chauffeur@croix-rouge.fr' } });
        expect(await screen.findByText('Action du chauffeur')).toBeTruthy();

        await act(async () => {
            pending[0](json(pageOf([entry({ id: 'p2', action: 'Page 2 périmée' })], 2, 20, 2)));
        });
        expect(screen.queryByText('Page 2 périmée')).toBeNull();
        expect(screen.getAllByRole('row').slice(1)).toHaveLength(1);
    });

    it("affiche l'erreur renvoyée par l'API", async () => {
        mockFetch(() => json({ error: 'Interdit' }, 403));
        render(<AuditLogTab users={users} />);
        expect((await screen.findByRole('alert')).textContent).toContain('Interdit');
    });

    it('affiche un état vide, sans barre de pagination', async () => {
        mockFetch(pageOf([], 1, 0, 1));
        render(<AuditLogTab users={users} />);
        expect(await screen.findByText('Aucun événement sur la période.')).toBeTruthy();
        expect(screen.queryByRole('navigation', { name: "Pagination du journal d'audit" })).toBeNull();
    });
});
