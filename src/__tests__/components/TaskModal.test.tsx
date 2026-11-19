/**
 * Tests RTL — modale de tâche du suivi technique : validation du titre, sélecteur
 * d'assignés (seuls les responsables fournis, « (moi) »), envoi complet, erreur API,
 * changement d'état et suppression avec confirmation.
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { id: 'u-me', roles: ['RESP_VEHICULE'] } } }) }));

import TaskModal from '@/components/fleetTracking/TaskModal';
import type { AssignableManager, FleetTaskDetail } from '@/lib/fleetTracking/tasks';

const MANAGERS: AssignableManager[] = [
    { id: 'u-me', name: 'Camille Roux', email: 'camille@test.fr', roleLabel: 'Responsable véhicule' },
    { id: 'u-thomas', name: 'Thomas Leroy', email: 'thomas@test.fr', roleLabel: 'Administrateur' },
];

const EXISTING: FleetTaskDetail = {
    id: 't-1', title: 'Confirmer le devis', description: 'Avec peinture', status: 'IN_PROGRESS', priority: 'HIGH',
    dueDate: '2026-11-20', pinned: false, dossierId: null, completedAt: null, createdAt: 't', updatedAt: 't',
    assignees: [{ id: 'u-thomas', name: 'Thomas Leroy' }],
    links: [{ type: 'CONTACT', id: 'c-1', label: 'MVR Évolution', detail: null, phone: '01 02 03 04 05', vehicleName: null, missing: false }],
    attachmentCount: 1,
    attachments: [{ id: 'a-1', fileName: 'devis.pdf', contentType: 'application/pdf', size: 1_200_000, uploadedByName: 'Thomas Leroy', createdAt: '2026-11-12T10:00:00Z' }],
};

let fetchMock: ReturnType<typeof vi.fn>;
let writeResponse: Response;

beforeEach(() => {
    writeResponse = new Response(JSON.stringify({ success: true, id: 'new' }), { status: 201 });
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method) return writeResponse;
        if (url.startsWith('/api/fleet-tracking/link-targets')) return new Response(JSON.stringify({ targets: [] }), { status: 200 });
        return new Response(JSON.stringify({ task: EXISTING }), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => vi.restoreAllMocks());

const writes = () => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method);

function renderCreate() {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(<TaskModal taskId={null} initialStatus="TODO" assignees={MANAGERS} onClose={onClose} onSaved={onSaved} />);
    return { onSaved, onClose };
}

describe('TaskModal — création', () => {
    it('titre vide : message et aucun envoi', () => {
        renderCreate();
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
        expect(screen.getByRole('alert').textContent).toBe('Le titre est requis');
        expect(writes()).toHaveLength(0);
    });

    it('le sélecteur ne propose que les responsables fournis ; l\'envoi contient assignés et champs', async () => {
        const { onSaved, onClose } = renderCreate();
        fireEvent.change(screen.getByLabelText('Titre *'), { target: { value: '  Prendre RDV contrôle technique ' } });
        fireEvent.change(screen.getByLabelText('Priorité'), { target: { value: 'HIGH' } });
        fireEvent.change(screen.getByLabelText('Échéance'), { target: { value: '2026-12-12' } });
        fireEvent.click(screen.getByRole('radio', { name: /En attente/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Épingler' }));

        fireEvent.focus(screen.getByRole('combobox', { name: 'Ajouter un assigné' }));
        const list = screen.getByRole('listbox', { name: /Responsables véhicule et admins/ });
        const options = within(list).getAllByRole('option');
        expect(options).toHaveLength(2);
        expect(within(list).getByRole('option', { name: /Camille Roux \(moi\)/ })).toBeTruthy();
        fireEvent.click(within(list).getByRole('option', { name: /Thomas Leroy/ }));
        expect(screen.getByRole('button', { name: 'Retirer Thomas Leroy' })).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(onClose).toHaveBeenCalled();
        const [url, init] = writes()[0] as [string, RequestInit];
        expect(url).toBe('/api/fleet-tracking/tasks');
        expect(init.method).toBe('POST');
        expect(JSON.parse(String(init.body))).toEqual({
            title: 'Prendre RDV contrôle technique',
            description: null,
            status: 'WAITING',
            priority: 'HIGH',
            dueDate: '2026-12-12',
            pinned: true,
            assigneeIds: ['u-thomas'],
            links: [],
        });
    });

    it('erreur de l\'API (assigné refusé) : message affiché, modale ouverte', async () => {
        writeResponse = new Response(JSON.stringify({ error: 'Assigné invalide : seuls les responsables…' }), { status: 400 });
        const { onClose } = renderCreate();
        fireEvent.change(screen.getByLabelText('Titre *'), { target: { value: 'X' } });
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
        expect((await screen.findByRole('alert')).textContent).toMatch(/Assigné invalide/);
        expect(onClose).not.toHaveBeenCalled();
    });

    it('sans échéance : « Date à fixer » ; pas de pièce jointe avant création', () => {
        renderCreate();
        expect(screen.getByText('Date à fixer')).toBeTruthy();
        expect(screen.getByText(/s.ajoutent une fois la tâche créée/)).toBeTruthy();
    });
});

describe('TaskModal — modification', () => {
    it('charge la tâche : champs, assignés, contact appelable, pièce jointe', async () => {
        render(<TaskModal taskId="t-1" initialStatus="TODO" assignees={MANAGERS} onClose={vi.fn()} onSaved={vi.fn()} />);
        await waitFor(() => expect((screen.getByLabelText('Titre *') as HTMLInputElement).value).toBe('Confirmer le devis'));
        expect(screen.getByRole('radio', { name: /En cours/ }).getAttribute('aria-checked')).toBe('true');
        expect(screen.getByRole('button', { name: 'Retirer Thomas Leroy' })).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Appeler MVR Évolution' }).getAttribute('href')).toBe('tel:0102030405');
        expect(screen.getByRole('link', { name: 'devis.pdf' }).getAttribute('href')).toBe('/api/fleet-tracking/tasks/t-1/attachments/a-1');
    });

    it('enregistrer envoie un PATCH avec les listes complètes ; retirer un assigné l\'enlève', async () => {
        writeResponse = new Response(JSON.stringify({ success: true }), { status: 200 });
        render(<TaskModal taskId="t-1" initialStatus="TODO" assignees={MANAGERS} onClose={vi.fn()} onSaved={vi.fn()} />);
        await screen.findByRole('button', { name: 'Retirer Thomas Leroy' });
        fireEvent.click(screen.getByRole('button', { name: 'Retirer Thomas Leroy' }));
        fireEvent.click(screen.getByRole('radio', { name: /Terminé/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
        await waitFor(() => expect(writes()).toHaveLength(1));
        const [url, init] = writes()[0] as [string, RequestInit];
        expect(url).toBe('/api/fleet-tracking/tasks/t-1');
        expect(init.method).toBe('PATCH');
        const body = JSON.parse(String(init.body));
        expect(body.status).toBe('DONE');
        expect(body.assigneeIds).toEqual([]);
        // Rattachements inchangés : non envoyés (pas d'écrasement d'une modification concurrente).
        expect('links' in body).toBe(false);
    });

    it('sans changement des listes : ni assigneeIds ni links dans le PATCH', async () => {
        writeResponse = new Response(JSON.stringify({ success: true }), { status: 200 });
        render(<TaskModal taskId="t-1" initialStatus="TODO" assignees={MANAGERS} onClose={vi.fn()} onSaved={vi.fn()} />);
        await waitFor(() => expect((screen.getByLabelText('Titre *') as HTMLInputElement).value).toBe('Confirmer le devis'));
        fireEvent.change(screen.getByLabelText('Titre *'), { target: { value: 'Confirmer le devis signé' } });
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
        await waitFor(() => expect(writes()).toHaveLength(1));
        const body = JSON.parse(String((writes()[0][1] as RequestInit).body));
        expect(body.title).toBe('Confirmer le devis signé');
        expect('assigneeIds' in body).toBe(false);
        expect('links' in body).toBe(false);
    });

    it('supprimer demande confirmation puis envoie DELETE', async () => {
        writeResponse = new Response(JSON.stringify({ success: true }), { status: 200 });
        const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
        render(<TaskModal taskId="t-1" initialStatus="TODO" assignees={MANAGERS} onClose={vi.fn()} onSaved={vi.fn()} />);
        await screen.findByRole('button', { name: 'Supprimer' });
        fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
        expect(writes()).toHaveLength(0);
        fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
        await waitFor(() => expect(writes()).toHaveLength(1));
        expect((writes()[0][1] as RequestInit).method).toBe('DELETE');
        expect(confirm).toHaveBeenCalledTimes(2);
    });

    it('tâche disparue (404) : « Tâche introuvable » et bouton Fermer', async () => {
        fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ error: 'x' }), { status: 404 }));
        const onClose = vi.fn();
        render(<TaskModal taskId="gone" initialStatus="TODO" assignees={MANAGERS} onClose={onClose} onSaved={vi.fn()} />);
        expect((await screen.findByRole('alert')).textContent).toBe('Tâche introuvable');
        fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
        expect(onClose).toHaveBeenCalled();
    });

    it('tâche d\'une autre UL (403) : inviter à changer d\'UL', async () => {
        fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ error: 'Accès refusé' }), { status: 403 }));
        render(<TaskModal taskId="t-b" initialStatus="TODO" assignees={MANAGERS} onClose={vi.fn()} onSaved={vi.fn()} />);
        expect((await screen.findByRole('alert')).textContent).toMatch(/autre unité locale : changez d.UL dans l.en-tête/);
        expect(screen.queryByLabelText('Titre *')).toBeNull();
    });
});
