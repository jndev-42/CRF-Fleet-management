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
    vehicles: [{ id: 'veh-a', name: '75-188', plate: null, missing: false }], createdByName: null,
    createdAt: '2026-11-14T10:00:00Z', updatedAt: 't', closedAt: null, closeReason: null, sourceType: null, sourceId: null,
    taskCount: 2, openTaskCount: 2, itemCount: 4, missingItemCount: 2, attachmentCount: 0,
};

beforeEach(() => {
    global.fetch = vi.fn(async (url: string) => {
        if (url === '/api/fleet-tracking/tasks/t-42') return new Response(JSON.stringify({ task: TASK }), { status: 200 });
        if (url.startsWith('/api/fleet-tracking/assignees')) return new Response(JSON.stringify({ assignees: [] }), { status: 200 });
        if (url.startsWith('/api/fleet-tracking/link-targets')) return new Response(JSON.stringify({ targets: [] }), { status: 200 });
        if (url.startsWith('/api/fleet-tracking/overview')) {
            return new Response(JSON.stringify({
                today: '2026-11-18',
                counters: { openDossiers: 1, vehicleCount: 1, dueSoon: 0, dueSoonTasks: 0, dueSoonControls: 0, missingItems: 2, controlsToSchedule: 0 },
                nextActions: [], nextActionsTotal: 3, priority: { pinned: [], fallback: null },
                vehicles: [], tabCounts: { tasks: 3, dossiers: 1 },
            }), { status: 200 });
        }
        if (url.startsWith('/api/fleet-tracking/controls')) {
            return new Response(JSON.stringify({ today: '2026-11-18', controls: [], counts: { all: 0, to_schedule: 0, soon: 0, overdue: 0, scheduled: 0 } }), { status: 200 });
        }
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

    it('onglet Contrôles : sélection transmise, contenu affiché quand actif', async () => {
        const onSelectTab = vi.fn();
        const { rerender } = render(<FleetTrackingPanel tab="taches" onSelectTab={onSelectTab} />);
        fireEvent.click(screen.getByRole('tab', { name: 'Contrôles' }));
        expect(onSelectTab).toHaveBeenCalledWith('controles');
        rerender(<FleetTrackingPanel tab="controles" onSelectTab={onSelectTab} />);
        expect(screen.getByRole('tab', { name: 'Contrôles' }).getAttribute('aria-selected')).toBe('true');
        expect(await screen.findByRole('button', { name: 'Toutes (0)' })).toBeTruthy();
    });

    it('Vue d\'ensemble : badges des sous-onglets ; « Contrôles à dater » ouvre Contrôles filtré sur « À dater »', async () => {
        const onSelectTab = vi.fn();
        const { rerender } = render(<FleetTrackingPanel tab="ensemble" onSelectTab={onSelectTab} />);
        expect(screen.getByRole('tab', { name: /Vue d'ensemble/ }).getAttribute('aria-selected')).toBe('true');
        await waitFor(() => expect(within(screen.getByRole('tab', { name: /Tâches/ })).getByText('3')).toBeTruthy());
        expect(within(screen.getByRole('tab', { name: /Dossiers/ })).getByText('1')).toBeTruthy();
        fireEvent.click(await screen.findByRole('button', { name: /^Contrôles à dater : 0/ }));
        expect(onSelectTab).toHaveBeenCalledWith('controles', { filter: 'to_schedule' });
        rerender(<FleetTrackingPanel tab="controles" tabFilter={{ filter: 'to_schedule' }} onSelectTab={onSelectTab} />);
        expect((await screen.findByRole('button', { name: 'À dater (0)' })).getAttribute('aria-pressed')).toBe('true');
    });

    it('onglet Dossiers filtré « Pièces à récupérer » : un dossier complet est masqué, puis réapparaît', async () => {
        const complete: FleetDossier = { ...DOSSIER, id: 'd-2', title: 'Révision faite', pinned: false, missingItemCount: 0 };
        const base = global.fetch;
        global.fetch = vi.fn(async (url: string, init?: RequestInit) => (url.startsWith('/api/fleet-tracking/dossiers')
            ? new Response(JSON.stringify({ dossiers: [DOSSIER, complete] }), { status: 200 })
            : base(url, init))) as unknown as typeof fetch;
        const onClearTabFilter = vi.fn();
        render(<FleetTrackingPanel tab="dossiers" tabFilter={{ filter: 'pieces' }} onClearTabFilter={onClearTabFilter}
            onSelectTab={vi.fn()} dossierId={null} onOpenDossier={vi.fn()} />);
        const toggle = await screen.findByRole('button', { name: 'Pièces à récupérer' });
        expect(toggle.getAttribute('aria-pressed')).toBe('true');
        expect(await screen.findByText('Sinistre roue arrière droite')).toBeTruthy();
        expect(screen.queryByText('Révision faite')).toBeNull();
        fireEvent.click(toggle);
        expect(await screen.findByText('Révision faite')).toBeTruthy();
        expect(onClearTabFilter).toHaveBeenCalled();
    });

    it('onglet Dossiers filtré sur un véhicule : la lecture des dossiers porte vehicle=veh-a', async () => {
        const base = global.fetch;
        const spy = vi.fn(async (url: string, init?: RequestInit) => (url.startsWith('/api/fleet-tracking/link-targets')
            ? new Response(JSON.stringify({ targets: [{ type: 'VEHICLE', id: 'veh-a', label: '75-188', detail: null }] }), { status: 200 })
            : base(url, init)));
        global.fetch = spy as unknown as typeof fetch;
        render(<FleetTrackingPanel tab="dossiers" tabFilter={{ vehicle: 'veh-a' }} onSelectTab={vi.fn()} dossierId={null} onOpenDossier={vi.fn()} />);
        await screen.findByText('Sinistre roue arrière droite');
        expect(spy.mock.calls.some(([u]) => String(u).startsWith('/api/fleet-tracking/dossiers?') && String(u).includes('vehicle=veh-a'))).toBe(true);
        await waitFor(() => expect((screen.getByLabelText('Véhicule') as HTMLSelectElement).value).toBe('veh-a'));
    });

    it('véhicule d\'ouverture inconnu de l\'UL : le filtre est retiré une fois la liste reçue', async () => {
        render(<FleetTrackingPanel tab="dossiers" tabFilter={{ vehicle: 'veh-inconnu' }} onSelectTab={vi.fn()} dossierId={null} onOpenDossier={vi.fn()} />);
        await screen.findByText('Sinistre roue arrière droite');
        await waitFor(() => expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]).not.toContain('vehicle='));
        expect((screen.getByLabelText('Véhicule') as HTMLSelectElement).value).toBe('');
    });

    it('téléphone : la barre d\'onglets qui déborde est recentrée sur l\'onglet actif', () => {
        // jsdom ne calcule aucune mise en page : largeurs et positions simulées.
        const size = (name: string, get: (el: HTMLElement) => number) =>
            vi.spyOn(HTMLElement.prototype, name as 'offsetLeft', 'get').mockImplementation(function (this: HTMLElement) { return get(this); });
        size('scrollWidth', el => (el.getAttribute('role') === 'tablist' ? 600 : 0));
        size('clientWidth', el => (el.getAttribute('role') === 'tablist' ? 300 : 0));
        size('offsetWidth', () => 100);
        size('offsetLeft', el => (el.id === 'fleet-tab-controles' ? 400 : 0));
        render(<FleetTrackingPanel tab="controles" onSelectTab={vi.fn()} taskId={null} onOpenTask={vi.fn()} />);
        // 400 − (300 − 100) / 2 = 300
        expect(screen.getByRole('tablist').scrollLeft).toBe(300);
    });
});
