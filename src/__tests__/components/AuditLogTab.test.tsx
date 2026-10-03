import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AuditLogTab, { type AuditLogEntry } from '@/components/admin/AuditLogTab';

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

const users = [
    { email: 'admin@croix-rouge.fr', name: 'Admin CRF' },
    { email: 'chauffeur@croix-rouge.fr', name: null },
];

let calls: string[];

/** Réponse d'une page unique contenant `count` événements. */
function onePage(count: number) {
    return { page: 1, total: count, totalPages: 1 };
}

function mockFetch(pages: Record<string, unknown> | ((url: string) => Response)) {
    calls = [];
    vi.spyOn(global, 'fetch').mockImplementation((async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        if (typeof pages === 'function') return pages(url);
        return json(pages);
    }) as typeof fetch);
}

beforeEach(() => {
    calls = [];
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('AuditLogTab', () => {
    it('affiche la première page (10 lignes), auteur, action, ressource et résultat', async () => {
        mockFetch({
            entries: [
                entry(),
                entry({ id: 'e2', status: 403, action: "Modification des rôles d'un utilisateur", entityType: 'user', entityId: 'x@croix-rouge.fr' }),
            ],
            ...onePage(2),
        });
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
        expect((screen.getByRole('button', { name: 'Page précédente' }) as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByRole('button', { name: 'Page suivante' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("signale l'utilisateur incarné", async () => {
        mockFetch({ entries: [entry({ actorName: null, actorEmail: 'super@croix-rouge.fr', impersonatedEmail: 'x@croix-rouge.fr' })], ...onePage(1) });
        render(<AuditLogTab users={users} />);
        expect(await screen.findByText('en tant que x@croix-rouge.fr')).toBeTruthy();
        expect(screen.getByText('super@croix-rouge.fr')).toBeTruthy();
    });

    it('filtre sur la personne choisie', async () => {
        mockFetch({ entries: [entry()], ...onePage(1) });
        render(<AuditLogTab users={users} />);
        await screen.findByText("Suppression d'un véhicule");

        fireEvent.change(screen.getByLabelText('Personne'), { target: { value: 'chauffeur@croix-rouge.fr' } });
        await waitFor(() => expect(calls).toContain('/api/audit-logs?limit=10&page=1&userEmail=chauffeur%40croix-rouge.fr'));
    });

    it('« Page suivante » remplace la liste par la page suivante, « Page précédente » y revient', async () => {
        mockFetch(url => (url.includes('page=2')
            ? json({ entries: [entry({ id: 'e2', action: "Prise d'un véhicule" })], page: 2, total: 11, totalPages: 2 })
            : json({ entries: [entry()], page: 1, total: 11, totalPages: 2 })));
        render(<AuditLogTab users={users} />);
        expect(await screen.findByText('Page 1 sur 2')).toBeTruthy();
        expect(screen.getByText('1 à 10 sur 11 événements')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }));
        expect(await screen.findByText("Prise d'un véhicule")).toBeTruthy();
        expect(screen.queryByText("Suppression d'un véhicule")).toBeNull();
        expect(calls[1]).toBe('/api/audit-logs?limit=10&page=2');
        expect(screen.getByText('Page 2 sur 2')).toBeTruthy();
        expect(screen.getByText('11 à 11 sur 11 événements')).toBeTruthy();
        expect((screen.getByRole('button', { name: 'Page suivante' }) as HTMLButtonElement).disabled).toBe(true);

        fireEvent.click(screen.getByRole('button', { name: 'Page précédente' }));
        expect(await screen.findByText("Suppression d'un véhicule")).toBeTruthy();
        expect(calls[2]).toBe('/api/audit-logs?limit=10&page=1');
    });

    it('changer de personne ramène à la page 1', async () => {
        mockFetch(url => json({ entries: [entry()], page: url.includes('page=2') ? 2 : 1, total: 15, totalPages: 2 }));
        render(<AuditLogTab users={users} />);
        fireEvent.click(await screen.findByRole('button', { name: 'Page suivante' }));
        expect(await screen.findByText('Page 2 sur 2')).toBeTruthy();

        fireEvent.change(screen.getByLabelText('Personne'), { target: { value: 'chauffeur@croix-rouge.fr' } });
        await waitFor(() => expect(calls.at(-1)).toBe('/api/audit-logs?limit=10&page=1&userEmail=chauffeur%40croix-rouge.fr'));
        expect(await screen.findByText('Page 1 sur 2')).toBeTruthy();
    });

    it("se replie sur la dernière page quand la page demandée n'existe plus", async () => {
        let first = true;
        mockFetch(url => {
            if (url.includes('page=2')) return json({ entries: [], page: 2, total: 3, totalPages: 1 });
            if (first) {
                first = false;
                return json({ entries: [entry()], page: 1, total: 12, totalPages: 2 });
            }
            return json({ entries: [entry({ id: 'r1', action: 'Après purge' })], page: 1, total: 3, totalPages: 1 });
        });
        render(<AuditLogTab users={users} />);
        fireEvent.click(await screen.findByRole('button', { name: 'Page suivante' }));
        expect(await screen.findByText('Après purge')).toBeTruthy();
        expect(screen.getByText('Page 1 sur 1')).toBeTruthy();
        expect(calls).toEqual(['/api/audit-logs?limit=10&page=1', '/api/audit-logs?limit=10&page=2', '/api/audit-logs?limit=10&page=1']);
    });

    it('ignore une réponse périmée arrivée après un changement de personne', async () => {
        const pending: ((r: Response) => void)[] = [];
        calls = [];
        vi.spyOn(global, 'fetch').mockImplementation((async (input: RequestInfo | URL) => {
            const url = String(input);
            calls.push(url);
            if (url.includes('userEmail=')) return json({ entries: [entry({ id: 'c1', action: 'Action du chauffeur' })], ...onePage(1) });
            return new Promise<Response>(resolve => pending.push(resolve));
        }) as typeof fetch);
        render(<AuditLogTab users={users} />);
        await waitFor(() => expect(pending).toHaveLength(1));

        fireEvent.change(screen.getByLabelText('Personne'), { target: { value: 'chauffeur@croix-rouge.fr' } });
        expect(await screen.findByText('Action du chauffeur')).toBeTruthy();

        // La réponse « toutes les personnes » arrive en retard : elle est ignorée.
        pending[0](json({ entries: [entry({ id: 'old', action: 'Action périmée' })], page: 1, total: 40, totalPages: 4 }));
        await new Promise(r => setTimeout(r, 0));
        expect(screen.queryByText('Action périmée')).toBeNull();
        expect(screen.getAllByRole('row').slice(1)).toHaveLength(1);
        expect(screen.getByText('Page 1 sur 1')).toBeTruthy();
    });

    it("une page suivante en cours n'écrase pas la liste d'une autre personne", async () => {
        const pending: ((r: Response) => void)[] = [];
        vi.spyOn(global, 'fetch').mockImplementation((async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes('page=2')) return new Promise<Response>(resolve => pending.push(resolve));
            if (url.includes('userEmail=')) return json({ entries: [entry({ id: 'c1', action: 'Action du chauffeur' })], ...onePage(1) });
            return json({ entries: [entry()], page: 1, total: 20, totalPages: 2 });
        }) as typeof fetch);
        render(<AuditLogTab users={users} />);

        fireEvent.click(await screen.findByRole('button', { name: 'Page suivante' }));
        await waitFor(() => expect(pending).toHaveLength(1));
        fireEvent.change(screen.getByLabelText('Personne'), { target: { value: 'chauffeur@croix-rouge.fr' } });
        expect(await screen.findByText('Action du chauffeur')).toBeTruthy();

        pending[0](json({ entries: [entry({ id: 'p2', action: 'Page 2 périmée' })], page: 2, total: 20, totalPages: 2 }));
        await new Promise(r => setTimeout(r, 0));
        expect(screen.queryByText('Page 2 périmée')).toBeNull();
        expect(screen.getAllByRole('row').slice(1)).toHaveLength(1);
    });

    it("affiche l'erreur renvoyée par l'API", async () => {
        mockFetch(() => json({ error: 'Interdit' }, 403));
        render(<AuditLogTab users={users} />);
        expect((await screen.findByRole('alert')).textContent).toContain('Interdit');
    });

    it('affiche un état vide', async () => {
        mockFetch({ entries: [], page: 1, total: 0, totalPages: 1 });
        render(<AuditLogTab users={users} />);
        expect(await screen.findByText('Aucun événement sur la période.')).toBeTruthy();
        expect(screen.queryByRole('navigation', { name: "Pagination du journal d'audit" })).toBeNull();
    });
});
