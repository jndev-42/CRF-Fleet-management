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
    it('affiche les 50 derniers événements, auteur, action, ressource et résultat', async () => {
        mockFetch({
            entries: [
                entry(),
                entry({ id: 'e2', status: 403, action: "Modification des rôles d'un utilisateur", entityType: 'user', entityId: 'x@croix-rouge.fr' }),
            ],
            nextBefore: null,
        });
        render(<AuditLogTab users={users} />);

        expect(await screen.findByText("Suppression d'un véhicule")).toBeTruthy();
        expect(calls[0]).toBe('/api/audit-logs?limit=50');
        const rows = screen.getAllByRole('row').slice(1);
        expect(rows).toHaveLength(2);
        expect(within(rows[0]).getByText('Admin CRF')).toBeTruthy();
        expect(within(rows[0]).getByText('vehicle/abc').getAttribute('title')).toBe('DELETE /api/vehicles/abc · IP 203.0.113.7');
        expect(within(rows[0]).getByText('OK · 200')).toBeTruthy();
        // Les refus sont distinguables.
        expect(within(rows[1]).getByText('Échec · 403')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Charger plus' })).toBeNull();
    });

    it("signale l'utilisateur incarné", async () => {
        mockFetch({ entries: [entry({ actorName: null, actorEmail: 'super@croix-rouge.fr', impersonatedEmail: 'x@croix-rouge.fr' })], nextBefore: null });
        render(<AuditLogTab users={users} />);
        expect(await screen.findByText('en tant que x@croix-rouge.fr')).toBeTruthy();
        expect(screen.getByText('super@croix-rouge.fr')).toBeTruthy();
    });

    it('filtre sur la personne choisie', async () => {
        mockFetch({ entries: [entry()], nextBefore: null });
        render(<AuditLogTab users={users} />);
        await screen.findByText("Suppression d'un véhicule");

        fireEvent.change(screen.getByLabelText('Personne'), { target: { value: 'chauffeur@croix-rouge.fr' } });
        await waitFor(() => expect(calls).toContain('/api/audit-logs?limit=50&userEmail=chauffeur%40croix-rouge.fr'));
    });

    it('« Charger plus » ajoute la page suivante à la suite', async () => {
        mockFetch(url => (url.includes('before=')
            ? json({ entries: [entry({ id: 'e2', action: 'Prise d\'un véhicule' })], nextBefore: null })
            : json({ entries: [entry()], nextBefore: '2026-10-02T08:30:00.000Z' })));
        render(<AuditLogTab users={users} />);

        fireEvent.click(await screen.findByRole('button', { name: 'Charger plus' }));
        expect(await screen.findByText("Prise d'un véhicule")).toBeTruthy();
        expect(screen.getByText("Suppression d'un véhicule")).toBeTruthy();
        expect(calls[1]).toBe('/api/audit-logs?limit=50&before=2026-10-02T08%3A30%3A00.000Z');
        expect(screen.queryByRole('button', { name: 'Charger plus' })).toBeNull();
    });

    it('ignore une réponse périmée arrivée après un changement de personne', async () => {
        const pending: ((r: Response) => void)[] = [];
        calls = [];
        vi.spyOn(global, 'fetch').mockImplementation((async (input: RequestInfo | URL) => {
            const url = String(input);
            calls.push(url);
            if (url.includes('userEmail=')) return json({ entries: [entry({ id: 'c1', action: 'Action du chauffeur' })], nextBefore: null });
            return new Promise<Response>(resolve => pending.push(resolve));
        }) as typeof fetch);
        render(<AuditLogTab users={users} />);
        await waitFor(() => expect(pending).toHaveLength(1));

        fireEvent.change(screen.getByLabelText('Personne'), { target: { value: 'chauffeur@croix-rouge.fr' } });
        expect(await screen.findByText('Action du chauffeur')).toBeTruthy();

        // La réponse « toutes les personnes » arrive en retard : elle est ignorée.
        pending[0](json({ entries: [entry({ id: 'old', action: 'Action périmée' })], nextBefore: '2026-10-01T00:00:00.000Z' }));
        await new Promise(r => setTimeout(r, 0));
        expect(screen.queryByText('Action périmée')).toBeNull();
        expect(screen.getAllByRole('row').slice(1)).toHaveLength(1);
        expect(screen.queryByRole('button', { name: 'Charger plus' })).toBeNull();
    });

    it("« Charger plus » en cours n'est pas ajouté à la liste d'une autre personne", async () => {
        const pending: ((r: Response) => void)[] = [];
        vi.spyOn(global, 'fetch').mockImplementation((async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes('before=')) return new Promise<Response>(resolve => pending.push(resolve));
            if (url.includes('userEmail=')) return json({ entries: [entry({ id: 'c1', action: 'Action du chauffeur' })], nextBefore: null });
            return json({ entries: [entry()], nextBefore: '2026-10-02T08:30:00.000Z' });
        }) as typeof fetch);
        render(<AuditLogTab users={users} />);

        fireEvent.click(await screen.findByRole('button', { name: 'Charger plus' }));
        await waitFor(() => expect(pending).toHaveLength(1));
        fireEvent.change(screen.getByLabelText('Personne'), { target: { value: 'chauffeur@croix-rouge.fr' } });
        expect(await screen.findByText('Action du chauffeur')).toBeTruthy();

        pending[0](json({ entries: [entry({ id: 'p2', action: 'Page 2 périmée' })], nextBefore: null }));
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
        mockFetch({ entries: [], nextBefore: null });
        render(<AuditLogTab users={users} />);
        expect(await screen.findByText('Aucun événement sur la période.')).toBeTruthy();
    });
});
