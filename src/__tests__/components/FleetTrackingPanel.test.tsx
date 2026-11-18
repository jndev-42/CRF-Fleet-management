/**
 * Tests RTL — panneau « Suivi technique » : onglet Tâches avec une tâche à ouvrir
 * (lien de notification `?tache=`) → la modale « Modifier la tâche » s'affiche, et
 * la fermer demande le retrait de la tâche de l'URL.
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { id: 'u-me', roles: ['RESP_VEHICULE'] } } }) }));

import FleetTrackingPanel from '@/components/fleetTracking/FleetTrackingPanel';
import type { FleetTaskDetail } from '@/lib/fleetTracking/tasks';
import type { FleetDossier } from '@/lib/fleetTracking/dossiers';

const TASK: FleetTaskDetail = {
    id: 't-42', title: 'Récupérer la référence du sinistre', description: null, status: 'WAITING', priority: 'HIGH',
    dueDate: null, pinned: false, dossierId: null, completedAt: null, createdAt: '2026-11-14T10:00:00Z', updatedAt: 't',
    assignees: [], links: [], attachmentCount: 0, attachments: [],
};

const DOSSIER: FleetDossier = {
    id: 'd-1', title: 'Sinistre roue arrière droite', description: null, status: 'OPEN', pinned: true,
    vehicle: { id: 'veh-a', name: '75-188', plate: null, missing: false }, createdByName: null,
    createdAt: '2026-11-14T10:00:00Z', updatedAt: 't', closedAt: null,
    taskCount: 2, openTaskCount: 2, itemCount: 4, missingItemCount: 2, attachmentCount: 0,
};

beforeEach(() => {
    global.fetch = vi.fn(async (url: string) => {
        if (url === '/api/fleet-tracking/tasks/t-42') return new Response(JSON.stringify({ task: TASK }), { status: 200 });
        if (url.startsWith('/api/fleet-tracking/assignees')) return new Response(JSON.stringify({ assignees: [] }), { status: 200 });
        if (url.startsWith('/api/fleet-tracking/link-targets')) return new Response(JSON.stringify({ targets: [] }), { status: 200 });
        if (url.startsWith('/api/fleet-tracking/dossiers')) return new Response(JSON.stringify({ dossiers: [DOSSIER] }), { status: 200 });
        return new Response(JSON.stringify({ tasks: [TASK] }), { status: 200 });
    }) as unknown as typeof fetch;
});
afterEach(() => vi.restoreAllMocks());

describe('FleetTrackingPanel', () => {
    it('onglet Tâches actif ; la tâche du lien s\'ouvre, la fermer appelle onOpenTask(null)', async () => {
        const onOpenTask = vi.fn();
        render(<FleetTrackingPanel tab="taches" onSelectTab={vi.fn()} taskId="t-42" onOpenTask={onOpenTask} />);
        expect(screen.getByRole('tab', { name: 'Tâches' }).getAttribute('aria-selected')).toBe('true');
        const dialog = await screen.findByRole('dialog', { name: 'Modifier la tâche' });
        await waitFor(() => expect((within(dialog).getByLabelText('Titre *') as HTMLInputElement).value).toBe('Récupérer la référence du sinistre'));
        fireEvent.click(within(dialog).getByRole('button', { name: 'Fermer la modale' }));
        expect(onOpenTask).toHaveBeenCalledWith(null);
    });

    it('changer d\'onglet transmet le choix', () => {
        const onSelectTab = vi.fn();
        render(<FleetTrackingPanel tab="taches" onSelectTab={onSelectTab} taskId={null} onOpenTask={vi.fn()} />);
        fireEvent.click(screen.getByRole('tab', { name: 'Contacts' }));
        expect(onSelectTab).toHaveBeenCalledWith('contacts');
    });

    it('onglet Dossiers : badge du nombre de dossiers ouverts, liste et ouverture d\'un dossier', async () => {
        const onOpenDossier = vi.fn();
        render(<FleetTrackingPanel tab="dossiers" onSelectTab={vi.fn()} dossierId={null} onOpenDossier={onOpenDossier} />);
        const tab = screen.getByRole('tab', { name: /Dossiers/ });
        await waitFor(() => expect(within(tab).getByText('1')).toBeTruthy());
        expect(await screen.findByText('Sinistre roue arrière droite')).toBeTruthy();
        expect(screen.getByText(/75-188 · Ouvert le 14\/11\/2026 · 2 tâches en cours · 2 pièces manquantes/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le dossier Sinistre roue arrière droite' }));
        expect(onOpenDossier).toHaveBeenCalledWith('d-1');
    });
});
