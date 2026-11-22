/**
 * Tests RTL — détail d'un dossier du suivi technique : compteur des pièces à
 * récupérer (« N sur M manquantes ») mis à jour quand on coche une pièce, envoi de
 * la valeur reçue, clôture, suppression avec confirmation, tâche créée depuis le
 * dossier (dossier et véhicule pré-remplis).
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { id: 'u-me', roles: ['RESP_VEHICULE'] } } }) }));

import DossierDetail from '@/components/fleetTracking/DossierDetail';
import type { DossierItem, FleetDossierDetail } from '@/lib/fleetTracking/dossiers';

const item = (id: string, label: string, patch: Partial<DossierItem> = {}): DossierItem => ({
    id, label, received: false, receivedValue: null, attachmentId: null, attachmentName: null,
    receivedAt: null, receivedByName: null, position: 0, createdAt: 't', ...patch,
});

const DOSSIER: FleetDossierDetail = {
    id: 'd-1', title: 'Sinistre roue arrière droite', description: 'Jante voilée', status: 'OPEN', pinned: false,
    vehicles: [{ id: 'veh-a', name: '75-188', plate: 'GV-114-QM', missing: false }],
    createdByName: 'Camille Roux', createdAt: '2026-11-14T10:00:00Z', updatedAt: 't', closedAt: null, closeReason: null, sourceType: null, sourceId: null,
    taskCount: 1, openTaskCount: 1, itemCount: 2, missingItemCount: 2, attachmentCount: 0,
    items: [item('i-1', 'Référence du sinistre'), item('i-2', 'Devis de réparation')],
    tasks: [{
        id: 't-1', title: 'Relancer l’assureur', description: null, status: 'WAITING', priority: 'NORMAL', dueDate: '2026-11-25',
        pinned: false, dossierId: 'd-1', completedAt: null, createdAt: 't', updatedAt: 't',
        assignees: [{ id: 'u-thomas', name: 'Thomas Leroy' }],
        links: [
            { type: 'VEHICLE', id: 'veh-a', label: '75-188', detail: null, phone: null, vehicleName: '75-188', missing: false },
            { type: 'CONTACT', id: 'c-1', label: 'Assureur flotte', detail: 'Proposé par l’UL Paris 15', phone: '01 02 03 04 05', vehicleName: null, missing: false },
        ],
        attachmentCount: 0,
    }],
    attachments: [],
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        if (url === '/api/fleet-tracking/dossiers/d-1/items/i-1' && init?.method === 'PATCH') {
            const body = JSON.parse(String(init.body));
            return new Response(JSON.stringify({
                success: true,
                item: item('i-1', 'Référence du sinistre', { received: true, receivedValue: body.receivedValue, receivedAt: '2026-11-18T09:00:00Z', receivedByName: 'Camille Roux' }),
            }), { status: 200 });
        }
        if (url === '/api/fleet-tracking/dossiers/d-1' && init?.method === 'PATCH') {
            return new Response(JSON.stringify({ success: true, dossier: { ...DOSSIER, status: 'CLOSED', closedAt: '2026-11-18T10:00:00Z', closeReason: 'INSURANCE' } }), { status: 200 });
        }
        if (url === '/api/fleet-tracking/tasks' && init?.method === 'POST') return new Response(JSON.stringify({ success: true, id: 't-new' }), { status: 201 });
        if (url === '/api/fleet-tracking/dossiers/d-1/attachments' && init?.method === 'POST') {
            return new Response(JSON.stringify({ success: true, attachment: { id: 'a-new', fileName: 'devis.pdf', contentType: 'application/pdf', size: 2048, uploadedByName: 'Camille Roux', createdAt: '2026-11-18T09:00:00Z' } }), { status: 201 });
        }
        if (init?.method === 'DELETE') return new Response(JSON.stringify({ success: true }), { status: 200 });
        if (url.startsWith('/api/fleet-tracking/dossiers?')) return new Response(JSON.stringify({ dossiers: [DOSSIER] }), { status: 200 });
        if (url.startsWith('/api/fleet-tracking/link-targets')) return new Response(JSON.stringify({ targets: [] }), { status: 200 });
        return new Response(JSON.stringify({ dossier: DOSSIER }), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => vi.restoreAllMocks());

function renderDetail() {
    const onBack = vi.fn();
    const onChanged = vi.fn();
    render(<DossierDetail dossierId="d-1" vehicles={[]} assignees={[]} onBack={onBack} onChanged={onChanged} />);
    return { onBack, onChanged };
}

describe('DossierDetail', () => {
    it('cocher une pièce : « 2 sur 2 manquantes » devient « 1 sur 2 manquantes », avec la valeur reçue', async () => {
        renderDetail();
        expect(await screen.findByText('2 sur 2 manquantes')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Marquer reçue : Référence du sinistre' }));
        fireEvent.change(screen.getByLabelText('Valeur reçue (facultatif)'), { target: { value: ' SIN-4521 ' } });
        fireEvent.click(screen.getByRole('button', { name: 'Valider la réception' }));
        expect(await screen.findByText('1 sur 2 manquantes')).toBeTruthy();
        const call = fetchMock.mock.calls.find(([u, i]) => u === '/api/fleet-tracking/dossiers/d-1/items/i-1' && (i as RequestInit)?.method === 'PATCH');
        expect(JSON.parse(String((call![1] as RequestInit).body))).toEqual({ received: true, receivedValue: 'SIN-4521', attachmentId: null });
        expect(screen.getByText(/SIN-4521 · reçue le 18\/11\/2026 · par Camille Roux/)).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Annuler la réception : Référence du sinistre' })).toBeTruthy();
    });

    it('en-tête, tâches du dossier et objets rattachés (contact appelable, sans doublon du véhicule)', async () => {
        renderDetail();
        expect(await screen.findByRole('heading', { name: 'Sinistre roue arrière droite' })).toBeTruthy();
        expect(screen.getAllByText('En cours').length).toBeGreaterThan(0);
        expect(screen.getByRole('button', { name: 'Relancer l’assureur' })).toBeTruthy();
        expect(screen.getAllByText('En attente').length).toBeGreaterThan(0);
        expect(screen.getByRole('link', { name: 'Appeler Assureur flotte' }).getAttribute('href')).toBe('tel:0102030405');
        expect(screen.getByRole('link', { name: 'Fiche véhicule 75-188' }).getAttribute('href')).toBe('/vehicles/75-188');
    });

    it('« Clore le dossier » envoie status CLOSED et affiche « Rouvrir le dossier »', async () => {
        const { onChanged } = renderDetail();
        fireEvent.click(await screen.findByRole('button', { name: 'Clore le dossier' }));
        // Le motif est obligatoire : la confirmation reste désactivée tant qu'il n'est pas choisi.
        const confirm = screen.getByRole('button', { name: 'Confirmer la clôture' }) as HTMLButtonElement;
        expect(confirm.disabled).toBe(true);
        fireEvent.change(screen.getByLabelText('Motif de clôture'), { target: { value: 'INSURANCE' } });
        fireEvent.click(confirm);
        expect(await screen.findByRole('button', { name: 'Rouvrir le dossier' })).toBeTruthy();
        const call = fetchMock.mock.calls.find(([u, i]) => u === '/api/fleet-tracking/dossiers/d-1' && (i as RequestInit)?.method === 'PATCH');
        expect(JSON.parse(String((call![1] as RequestInit).body))).toEqual({ status: 'CLOSED', closeReason: 'INSURANCE' });
        expect(screen.getByText('Motif : Pris en charge par l\'assurance')).toBeTruthy();
        expect(onChanged).toHaveBeenCalled();
    });

    it('supprimer demande une confirmation explicite, puis revient à la liste', async () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
        const { onBack } = renderDetail();
        const header = (await screen.findByRole('heading', { name: 'Sinistre roue arrière droite' })).closest('header')!;
        fireEvent.click(within(header).getByRole('button', { name: 'Supprimer' }));
        expect(fetchMock.mock.calls.some(([, i]) => (i as RequestInit)?.method === 'DELETE')).toBe(false);
        fireEvent.click(within(header).getByRole('button', { name: 'Supprimer' }));
        await waitFor(() => expect(onBack).toHaveBeenCalled());
        expect(String(confirm.mock.calls[0][0])).toMatch(/tâches sont conservées/);
    });

    it('« + Tâche » ouvre une création avec le dossier et le véhicule pré-remplis', async () => {
        renderDetail();
        await screen.findByRole('heading', { name: 'Tâches du dossier' });
        fireEvent.click(screen.getByRole('button', { name: 'Tâche' }));
        const dialog = await screen.findByRole('dialog', { name: 'Nouvelle tâche' });
        await waitFor(() => expect((within(dialog).getByLabelText('Dossier') as HTMLSelectElement).value).toBe('d-1'));
        expect(within(dialog).getByText('75-188')).toBeTruthy();
    });

    it('dossier d\'une autre UL (403) : message explicite', async () => {
        fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ error: 'x' }), { status: 403 }));
        renderDetail();
        expect((await screen.findByRole('alert')).textContent).toMatch(/autre unité locale/);
    });

    it('créer une tâche depuis le dossier : le POST porte dossierId d-1 et le véhicule ; dossier et liste rafraîchis', async () => {
        const { onChanged } = renderDetail();
        await screen.findByRole('heading', { name: 'Tâches du dossier' });
        fireEvent.click(screen.getByRole('button', { name: 'Tâche' }));
        const dialog = await screen.findByRole('dialog', { name: 'Nouvelle tâche' });
        fireEvent.change(within(dialog).getByLabelText('Titre *'), { target: { value: 'Demander le devis' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
        await waitFor(() => expect(onChanged).toHaveBeenCalled());
        const call = fetchMock.mock.calls.find(([u, i]) => u === '/api/fleet-tracking/tasks' && (i as RequestInit)?.method === 'POST');
        const body = JSON.parse(String((call![1] as RequestInit).body));
        expect(body.dossierId).toBe('d-1');
        expect(body.links).toEqual([{ type: 'VEHICLE', id: 'veh-a' }]);
        // Le dossier est relu (compteurs à jour).
        await waitFor(() => expect(fetchMock.mock.calls.filter(([u, i]) => u === '/api/fleet-tracking/dossiers/d-1' && !(i as RequestInit)?.method).length).toBeGreaterThan(1));
    });

    it('déposer un fichier dans « Pièces jointes » l\'envoie aux pièces jointes du dossier', async () => {
        renderDetail();
        const card = (await screen.findByRole('heading', { name: 'Pièces jointes' })).closest('section')!;
        const file = new File(['%PDF-1.7'], 'devis.pdf', { type: 'application/pdf' });
        fireEvent.change(within(card).getByLabelText('Joindre un fichier'), { target: { files: [file] } });
        expect(await within(card).findByRole('link', { name: 'devis.pdf' })).toBeTruthy();
        const call = fetchMock.mock.calls.find(([, i]) => (i as RequestInit)?.method === 'POST');
        expect(call![0]).toBe('/api/fleet-tracking/dossiers/d-1/attachments');
        expect(within(card).getByRole('link', { name: 'devis.pdf' }).getAttribute('href')).toBe('/api/fleet-tracking/dossiers/d-1/attachments/a-new');
    });

    it('supprimer une pièce jointe désignée par une pièce reçue retire le lien de la pièce', async () => {
        const withFile: FleetDossierDetail = {
            ...DOSSIER,
            items: [item('i-1', 'Constat', { received: true, attachmentId: 'a-1', attachmentName: 'constat.pdf', receivedAt: '2026-11-15T10:00:00Z' }), DOSSIER.items[1]],
            attachments: [{ id: 'a-1', fileName: 'constat.pdf', contentType: 'application/pdf', size: 1000, uploadedByName: null, createdAt: '2026-11-15T10:00:00Z' }],
        };
        fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ dossier: withFile }), { status: 200 }));
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        renderDetail();
        const items = (await screen.findByRole('heading', { name: 'Pièces à récupérer' })).closest('section')!;
        expect(within(items).getByRole('link', { name: /constat\.pdf/ })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Supprimer constat.pdf' }));
        await waitFor(() => expect(within(items).queryByRole('link', { name: /constat\.pdf/ })).toBeNull());
        // La pièce reste reçue.
        expect(within(items).getByRole('button', { name: 'Annuler la réception : Constat' })).toBeTruthy();
    });

    it('formulaire de réception : Annuler efface la saisie ; un fichier retiré du dossier n\'est plus sélectionné', async () => {
        const withFile: FleetDossierDetail = {
            ...DOSSIER,
            attachments: [{ id: 'a-1', fileName: 'constat.pdf', contentType: 'application/pdf', size: 1000, uploadedByName: null, createdAt: 't' }],
        };
        fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ dossier: withFile }), { status: 200 }));
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        renderDetail();
        fireEvent.click(await screen.findByRole('button', { name: 'Marquer reçue : Référence du sinistre' }));
        fireEvent.change(screen.getByLabelText('Valeur reçue (facultatif)'), { target: { value: 'SIN-1' } });
        fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
        fireEvent.click(screen.getByRole('button', { name: 'Marquer reçue : Référence du sinistre' }));
        expect((screen.getByLabelText('Valeur reçue (facultatif)') as HTMLInputElement).value).toBe('');

        fireEvent.change(screen.getByLabelText('Fichier reçu (facultatif)'), { target: { value: 'a-1' } });
        fireEvent.click(screen.getByRole('button', { name: 'Supprimer constat.pdf' }));
        await waitFor(() => expect((screen.getByLabelText('Fichier reçu (facultatif)') as HTMLSelectElement).value).toBe(''));
        fireEvent.click(screen.getByRole('button', { name: 'Valider la réception' }));
        await waitFor(() => expect(fetchMock.mock.calls.some(([u, i]) => u === '/api/fleet-tracking/dossiers/d-1/items/i-1' && (i as RequestInit)?.method === 'PATCH')).toBe(true));
        const call = fetchMock.mock.calls.find(([u, i]) => u === '/api/fleet-tracking/dossiers/d-1/items/i-1' && (i as RequestInit)?.method === 'PATCH');
        expect(JSON.parse(String((call![1] as RequestInit).body)).attachmentId).toBeNull();
    });

    it('sélecteur de dossier d\'une tâche : le dossier actuel clos est affiché avec son titre', async () => {
        const closed = { ...DOSSIER, id: 'd-closed', title: 'Remplacement batterie', status: 'CLOSED' as const };
        fetchMock.mockImplementation(async (url: string) => {
            if (url === '/api/fleet-tracking/dossiers') return new Response(JSON.stringify({ dossiers: [DOSSIER, closed] }), { status: 200 });
            if (url.startsWith('/api/fleet-tracking/link-targets')) return new Response(JSON.stringify({ targets: [] }), { status: 200 });
            return new Response(JSON.stringify({ dossier: DOSSIER }), { status: 200 });
        });
        const { default: DossierSelect } = await import('@/components/fleetTracking/DossierSelect');
        render(<DossierSelect value="d-closed" onChange={vi.fn()} current="d-closed" />);
        expect(await screen.findByRole('option', { name: 'Remplacement batterie (clos) — 75-188' })).toBeTruthy();
        expect(screen.getByRole('option', { name: 'Sinistre roue arrière droite — 75-188' })).toBeTruthy();
    });

    it('dossier issu d\'une déclaration : lien vers son PDF', async () => {
        const sourced = { ...DOSSIER, sourceType: 'INCIDENT_REPORT' as const, sourceId: 'rep-42' };
        fetchMock.mockImplementation(async (url: string) => {
            if (url.startsWith('/api/fleet-tracking/link-targets')) return new Response(JSON.stringify({ targets: [] }), { status: 200 });
            return new Response(JSON.stringify({ dossier: sourced, dossiers: [] }), { status: 200 });
        });
        renderDetail();
        const link = await screen.findByRole('link', { name: /Voir la déclaration d.incident/ });
        expect(link.getAttribute('href')).toBe('/api/incidents/rep-42/pdf');
    });

    it('ligne de liste d\'un dossier clos : affiche le motif de clôture', async () => {
        const { default: DossierListItem } = await import('@/components/fleetTracking/DossierListItem');
        render(<ul><DossierListItem dossier={{ ...DOSSIER, status: 'CLOSED', closedAt: '2026-11-18T10:00:00Z', closeReason: 'REPAIRED' }} onOpen={vi.fn()} /></ul>);
        expect(screen.getByText(/Réparé/)).toBeTruthy();
        expect(screen.getByText('Clos')).toBeTruthy();
    });
});
