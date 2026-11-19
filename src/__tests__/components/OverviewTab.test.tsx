/**
 * Tests RTL — onglet « Vue d'ensemble » du suivi technique : compteurs cliquables,
 * encart « À confirmer en priorité » masqué sans contenu, cocher une prochaine action
 * puis « Annuler » (rétablit l'état précédent).
 *
 * Fichiers testés : src/components/fleetTracking/OverviewTab.tsx, useCompleteWithUndo.ts
 */
import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { id: 'u-me', roles: ['RESP_VEHICULE'] } } }) }));

import OverviewTab from '@/components/fleetTracking/OverviewTab';
import { UNDO_DELAY_MS, UNDO_FAILED_MESSAGE } from '@/components/fleetTracking/useCompleteWithUndo';
import type { FleetOverview } from '@/lib/fleetTracking/overview';
import type { FleetTask } from '@/lib/fleetTracking/tasks';

const TASK: FleetTask = {
    id: 't-1', title: 'Confirmer le devis auprès du garage', description: null, status: 'WAITING', priority: 'HIGH',
    dueDate: '2026-11-20', pinned: true, dossierId: null, completedAt: null, createdAt: '2026-11-14T10:00:00Z', updatedAt: 't',
    assignees: [{ id: 'u-1', name: 'Camille R.' }],
    links: [{ type: 'VEHICLE', id: 'veh-188', label: '75-188', detail: null, phone: null, vehicleName: '75-188', missing: false }],
    attachmentCount: 1,
};

function makeOverview(over: Partial<FleetOverview> = {}): FleetOverview {
    return {
        today: '2026-11-18',
        counters: { openDossiers: 4, vehicleCount: 4, dueSoon: 3, dueSoonTasks: 1, dueSoonControls: 2, missingItems: 6, controlsToSchedule: 5 },
        nextActions: [TASK],
        nextActionsTotal: 9,
        priority: { pinned: [{ kind: 'TASK', dueDate: TASK.dueDate, task: TASK }], fallback: null },
        vehicles: [{ id: 'veh-188', name: '75-188', model: 'VL', plate: 'GV-114-QM', openDossiers: 2 }],
        tabCounts: { tasks: 9, dossiers: 4 },
        ...over,
    };
}

const EMPTY = makeOverview({
    counters: { openDossiers: 0, vehicleCount: 0, dueSoon: 0, dueSoonTasks: 0, dueSoonControls: 0, missingItems: 0, controlsToSchedule: 0 },
    nextActions: [], nextActionsTotal: 0, priority: { pinned: [], fallback: null }, vehicles: [],
    tabCounts: { tasks: 0, dossiers: 0 },
});

const fetchMock = vi.fn();

beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ task: {} }), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

function renderTab(overview: FleetOverview | null, props: Partial<Parameters<typeof OverviewTab>[0]> = {}) {
    const handlers = { onChanged: vi.fn(), onNavigate: vi.fn(), onOpenDossier: vi.fn(), onOpenTask: vi.fn() };
    render(<OverviewTab overview={overview} loading={false} error={null} {...handlers} {...props} />);
    return handlers;
}

/** Vue d'ensemble dont `?tache=` est simulé par un état local. */
function WithTaskUrl({ overview, onOpenTask }: { overview: FleetOverview; onOpenTask: (id: string | null) => void }) {
    const [taskId, setTaskId] = useState<string | null>(null);
    return (
        <OverviewTab overview={overview} loading={false} error={null} onChanged={vi.fn()} onNavigate={vi.fn()} onOpenDossier={vi.fn()}
            openTaskId={taskId} onOpenTask={id => { onOpenTask(id); setTaskId(id); }} />
    );
}

describe('OverviewTab', () => {
    it('affiche les compteurs ; chaque carte ouvre l\'onglet filtré', () => {
        const { onNavigate } = renderTab(makeOverview());
        expect(screen.getByText('Sur les 4 véhicules')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /^Contrôles à dater : 5/ }));
        expect(onNavigate).toHaveBeenLastCalledWith('controles', { filter: 'to_schedule' });
        fireEvent.click(screen.getByRole('button', { name: /^Pièces à récupérer : 6/ }));
        expect(onNavigate).toHaveBeenLastCalledWith('dossiers', { filter: 'pieces' });
        fireEvent.click(screen.getByRole('button', { name: /^Dossiers ouverts : 4/ }));
        expect(onNavigate).toHaveBeenLastCalledWith('dossiers');
        const due = screen.getByRole('group', { name: 'Échéances à traiter : 3' });
        fireEvent.click(within(due).getByRole('button', { name: /^1 tâche à échéance/ }));
        expect(onNavigate).toHaveBeenLastCalledWith('taches', { filter: 'echeance' });
        fireEvent.click(within(due).getByRole('button', { name: /^2 contrôles sous 30 jours/ }));
        expect(onNavigate).toHaveBeenLastCalledWith('controles', { filter: 'soon' });
        fireEvent.click(screen.getByRole('button', { name: /^75-188 : 2 dossiers ouverts/ }));
        expect(onNavigate).toHaveBeenLastCalledWith('dossiers', { vehicle: 'veh-188' });
        fireEvent.click(screen.getByRole('button', { name: 'Voir les 9 tâches →' }));
        expect(onNavigate).toHaveBeenLastCalledWith('taches');
    });

    it('« Voir la tâche » quand il n\'y en a qu\'une ; pluriel des pièces jointes', () => {
        renderTab(makeOverview({ nextActionsTotal: 1 }));
        expect(screen.getByRole('button', { name: 'Voir la tâche →' })).toBeTruthy();
        expect(screen.getByLabelText('1 pièce jointe')).toBeTruthy();
    });

    it('prochaines actions et encart épinglé', () => {
        renderTab(makeOverview());
        expect(screen.getByText('9 à suivre')).toBeTruthy();
        const prio = screen.getByRole('region', { name: /À confirmer en priorité/ });
        expect(within(prio).getByText('1 épinglé')).toBeTruthy();
        expect(within(prio).getByText('Confirmer le devis auprès du garage')).toBeTruthy();
        // Épingle et couleur d'échéance (≤ 7 j) dans l'encart comme dans la liste.
        expect(within(prio).getByLabelText('Épinglée')).toBeTruthy();
        expect(within(prio).getByText('Échéance 20/11').className).toMatch(/due_overdue/);
        expect(screen.getAllByText('Échéance 20/11')).toHaveLength(2);
    });

    it('UL vide : compteurs à 0, encart masqué, message vide', () => {
        renderTab(EMPTY);
        expect(screen.getByRole('button', { name: /^Dossiers ouverts : 0/ })).toBeTruthy();
        expect(screen.queryByRole('region', { name: /À confirmer en priorité/ })).toBeNull();
        expect(screen.getByText('Aucune action à suivre pour l’instant.')).toBeTruthy();
    });

    it('repli : la tâche Prioritaire est montrée sans badge d\'épingles', () => {
        renderTab(makeOverview({ priority: { pinned: [], fallback: { ...TASK, pinned: false } } }));
        const prio = screen.getByRole('region', { name: /À confirmer en priorité/ });
        expect(within(prio).getByText('Confirmer le devis auprès du garage')).toBeTruthy();
        expect(within(prio).queryByText(/épinglé/)).toBeNull();
    });

    it('cocher termine la tâche ; « Annuler » la rétablit dans son état précédent', async () => {
        const { onChanged } = renderTab(makeOverview());
        fireEvent.click(screen.getByRole('checkbox', { name: 'Terminer « Confirmer le devis auprès du garage »' }));
        const toast = await screen.findByText('Tâche « Confirmer le devis auprès du garage » terminée');
        // Le focus passe sur « Annuler » (la ligne cochée a disparu).
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Annuler' }));
        expect(fetchMock).toHaveBeenCalledWith('/api/fleet-tracking/tasks/t-1', expect.objectContaining({
            method: 'PATCH', body: JSON.stringify({ status: 'DONE' }),
        }));
        expect(screen.queryByRole('checkbox')).toBeNull();
        expect(onChanged).toHaveBeenCalledTimes(1);

        fireEvent.click(within(toast.parentElement as HTMLElement).getByRole('button', { name: 'Annuler' }));
        await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith('/api/fleet-tracking/tasks/t-1', expect.objectContaining({
            method: 'PATCH', body: JSON.stringify({ status: 'WAITING' }),
        })));
        await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(2));
        expect(screen.getByRole('checkbox', { name: /Confirmer le devis/ })).toBeTruthy();
        expect(screen.queryByText(/terminée$/)).toBeNull();
    });

    it('le message « Annuler » disparaît après quelques secondes', async () => {
        vi.useFakeTimers();
        renderTab(makeOverview());
        await act(async () => {
            fireEvent.click(screen.getByRole('checkbox', { name: /Confirmer le devis/ }));
        });
        expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy();
        act(() => vi.advanceTimersByTime(UNDO_DELAY_MS + 10));
        expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull();
    });

    it('le survol ou le focus suspend le décompte, qui reprend ensuite', async () => {
        vi.useFakeTimers();
        renderTab(makeOverview());
        await act(async () => {
            fireEvent.click(screen.getByRole('checkbox', { name: /Confirmer le devis/ }));
        });
        const toast = screen.getByRole('button', { name: 'Annuler' }).parentElement as HTMLElement;
        fireEvent.mouseEnter(toast);
        act(() => vi.advanceTimersByTime(UNDO_DELAY_MS * 3));
        expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy();
        fireEvent.mouseLeave(toast);
        act(() => vi.advanceTimersByTime(UNDO_DELAY_MS + 10));
        expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull();
    });

    it('échec de l\'annulation : la ligne revient avec un message', async () => {
        renderTab(makeOverview());
        fireEvent.click(screen.getByRole('checkbox', { name: /Confirmer le devis/ }));
        const undo = await screen.findByRole('button', { name: 'Annuler' });
        fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: 'Erreur serveur' }), { status: 500 }));
        fireEvent.click(undo);
        expect((await screen.findByRole('alert')).textContent).toBe(UNDO_FAILED_MESSAGE);
        expect(screen.getByRole('checkbox', { name: /Confirmer le devis/ })).toBeTruthy();
    });

    it('« Modifier » passe par l\'URL et ouvre la tâche chargée depuis l\'API', async () => {
        fetchMock.mockImplementation(async (url: string) => {
            if (url === '/api/fleet-tracking/tasks/t-1') return new Response(JSON.stringify({ task: { ...TASK, attachments: [] } }), { status: 200 });
            if (url.startsWith('/api/fleet-tracking/assignees')) return new Response(JSON.stringify({ assignees: [] }), { status: 200 });
            return new Response(JSON.stringify({ targets: [] }), { status: 200 });
        });
        const onOpenTask = vi.fn();
        render(<WithTaskUrl overview={makeOverview()} onOpenTask={onOpenTask} />);
        fireEvent.click(screen.getByRole('button', { name: 'Modifier « Confirmer le devis auprès du garage »' }));
        expect(onOpenTask).toHaveBeenCalledWith('t-1');
        const dialog = await screen.findByRole('dialog', { name: 'Modifier la tâche' });
        await waitFor(() => expect((within(dialog).getByLabelText('Titre *') as HTMLInputElement).value).toBe('Confirmer le devis auprès du garage'));
        expect(fetchMock).toHaveBeenCalledWith('/api/fleet-tracking/tasks/t-1', expect.anything());
        fireEvent.click(within(dialog).getByRole('button', { name: 'Fermer la modale' }));
        expect(onOpenTask).toHaveBeenLastCalledWith(null);
    });

    it('« Nouveau dossier » : enregistrer ouvre le dossier créé et relit la vue', async () => {
        fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
            if (init?.method === 'POST') return new Response(JSON.stringify({ success: true, id: 'd-new' }), { status: 201 });
            if (url.startsWith('/api/fleet-tracking/link-targets')) {
                return new Response(JSON.stringify({ targets: [{ type: 'VEHICLE', id: 'veh-188', label: '75-188', detail: null }] }), { status: 200 });
            }
            return new Response(JSON.stringify({ assignees: [] }), { status: 200 });
        });
        const { onOpenDossier, onChanged } = renderTab(makeOverview());
        fireEvent.click(screen.getByRole('button', { name: /Nouveau dossier/ }));
        const dialog = await screen.findByRole('dialog');
        await within(dialog).findByRole('option', { name: '75-188' });
        fireEvent.change(within(dialog).getByLabelText('Titre *'), { target: { value: 'Sinistre roue' } });
        fireEvent.change(within(dialog).getByLabelText('Véhicule *'), { target: { value: 'veh-188' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
        await waitFor(() => expect(onOpenDossier).toHaveBeenCalledWith('d-new'));
        expect(onChanged).toHaveBeenCalled();
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('échec de la coche : la tâche revient avec un message', async () => {
        fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: 'Interdit' }), { status: 403 }));
        renderTab(makeOverview());
        fireEvent.click(screen.getByRole('checkbox', { name: /Confirmer le devis/ }));
        expect(await screen.findByRole('alert')).toBeTruthy();
        expect(screen.getByRole('checkbox', { name: /Confirmer le devis/ })).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Annuler' })).toBeNull();
    });

    it('dossier épinglé : « Ouvrir le dossier » ouvre son détail', () => {
        const { onOpenDossier } = renderTab(makeOverview({
            priority: {
                pinned: [{
                    kind: 'DOSSIER', dueDate: null,
                    dossier: {
                        id: 'd-1', title: 'Sinistre roue arrière droite', description: null, status: 'OPEN', pinned: true,
                        vehicle: { id: 'veh-188', name: '75-188', plate: null, missing: false }, createdByName: null,
                        createdAt: 't', updatedAt: 't', closedAt: null,
                        taskCount: 1, openTaskCount: 1, itemCount: 2, missingItemCount: 2, attachmentCount: 0,
                    },
                }],
                fallback: null,
            },
        }));
        expect(screen.getByText('2 pièces à récupérer')).toBeTruthy();
        expect(screen.getByText('Aucune échéance')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le dossier' }));
        expect(onOpenDossier).toHaveBeenCalledWith('d-1');
    });
});
