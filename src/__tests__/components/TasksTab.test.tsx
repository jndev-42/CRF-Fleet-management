/**
 * Tests RTL — suivi technique, onglet « Tâches » : rendu par colonnes, changement
 * d'état par la pastille (alternative mobile/clavier au glisser-déposer) et par
 * glisser-déposer, retour arrière en cas d'échec, « Terminé » replié, ouverture de la
 * modale par lien profond.
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { id: 'u-me', roles: ['RESP_VEHICULE'] } } }) }));

import TasksTab from '@/components/fleetTracking/TasksTab';
import type { FleetTask, FleetTaskDetail } from '@/lib/fleetTracking/tasks';

function task(id: string, patch: Partial<FleetTask> = {}): FleetTask {
    return {
        id, title: `Tâche ${id}`, description: null, status: 'TODO', priority: 'NORMAL', dueDate: null,
        pinned: false, dossierId: null, completedAt: null, createdAt: `2026-11-0${id.length}T10:00:00.000Z`,
        updatedAt: '2026-11-10T10:00:00.000Z', assignees: [], links: [], attachmentCount: 0, ...patch,
    };
}

let tasks: FleetTask[];
let patchStatus: number;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
    patchStatus = 200;
    tasks = [
        task('devis', {
            title: 'Demander un devis carrosserie', priority: 'HIGH', pinned: true, attachmentCount: 2,
            assignees: [{ id: 'u-me', name: 'Camille Roux' }],
            links: [{ type: 'VEHICLE', id: 'veh-1', label: '75-188', detail: null, phone: null, vehicleName: '75-188', missing: false }],
        }),
        task('balais', { title: 'Remplacer les balais', status: 'IN_PROGRESS', dueDate: '2026-11-28' }),
    ];
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        if (url.startsWith('/api/fleet-tracking/assignees')) return new Response(JSON.stringify({ assignees: [] }), { status: 200 });
        if (url.startsWith('/api/fleet-tracking/link-targets')) return new Response(JSON.stringify({ targets: [] }), { status: 200 });
        if (init?.method === 'PATCH') {
            if (patchStatus !== 200) return new Response(JSON.stringify({ error: 'Enregistrement refusé' }), { status: patchStatus });
            const id = decodeURIComponent(url.split('/').pop()!);
            const body = JSON.parse(String(init.body)) as Partial<FleetTask>;
            const updated = { ...tasks.find(t => t.id === id)!, ...body };
            tasks = tasks.map(t => (t.id === id ? updated : t));
            return new Response(JSON.stringify({ success: true, task: updated }), { status: 200 });
        }
        const detail = /\/api\/fleet-tracking\/tasks\/([^/?]+)$/.exec(url);
        if (detail) {
            const found = tasks.find(t => t.id === decodeURIComponent(detail[1]));
            if (!found) return new Response(JSON.stringify({ error: 'Tâche introuvable' }), { status: 404 });
            const full: FleetTaskDetail = { ...found, attachments: [] };
            return new Response(JSON.stringify({ task: full }), { status: 200 });
        }
        return new Response(JSON.stringify({ tasks }), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => vi.restoreAllMocks());

const column = (name: RegExp) => screen.getByRole('region', { name });
const patchCalls = () => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH');

describe('TasksTab', () => {
    it('range chaque tâche dans la colonne de son état, avec pastilles et compteur', async () => {
        render(<TasksTab openTaskId={null} onOpenTask={vi.fn()} />);
        const todo = await screen.findByRole('region', { name: /À faire \(1\)/ });
        const card = within(todo).getByRole('article', { name: 'Demander un devis carrosserie' });
        expect(within(card).getByText('75-188')).toBeTruthy();
        expect(within(card).getByText('Prioritaire')).toBeTruthy();
        expect(within(card).getByLabelText('Épinglée')).toBeTruthy();
        expect(within(card).getByText('Date à fixer')).toBeTruthy();
        expect(within(card).getByLabelText('2 pièce(s) jointe(s)')).toBeTruthy();
        expect(within(column(/En cours \(1\)/)).getByText('Remplacer les balais')).toBeTruthy();
        expect(column(/En attente \(0\)/)).toBeTruthy();
        expect(column(/Terminé \(0\)/)).toBeTruthy();
    });

    it('la pastille d\'état déplace la carte sans glisser-déposer, et l\'état est enregistré', async () => {
        render(<TasksTab openTaskId={null} onOpenTask={vi.fn()} />);
        const card = await screen.findByRole('article', { name: 'Demander un devis carrosserie' });
        fireEvent.click(within(card).getByRole('button', { name: /État : À faire/ }));
        const menu = within(card).getByRole('menu', { name: /Déplacer/ });
        fireEvent.click(within(menu).getByRole('menuitemradio', { name: /En attente/ }));

        await waitFor(() => expect(within(column(/En attente \(1\)/)).getByText('Demander un devis carrosserie')).toBeTruthy());
        const [url, init] = patchCalls()[0] as [string, RequestInit];
        expect(url).toBe('/api/fleet-tracking/tasks/devis');
        expect(JSON.parse(String(init.body))).toEqual({ status: 'WAITING' });
    });

    it('échec d\'enregistrement : la carte revient à sa colonne et un message s\'affiche', async () => {
        patchStatus = 500;
        render(<TasksTab openTaskId={null} onOpenTask={vi.fn()} />);
        const card = await screen.findByRole('article', { name: 'Remplacer les balais' });
        fireEvent.click(within(card).getByRole('button', { name: /État : En cours/ }));
        fireEvent.click(within(card).getByRole('menuitemradio', { name: /Terminé/ }));

        expect((await screen.findByRole('alert')).textContent).toBe('Enregistrement refusé');
        expect(within(column(/En cours \(1\)/)).getByText('Remplacer les balais')).toBeTruthy();
        expect(column(/Terminé \(0\)/)).toBeTruthy();
    });

    it('glisser-déposer d\'une carte vers une autre colonne change son état', async () => {
        render(<TasksTab openTaskId={null} onOpenTask={vi.fn()} />);
        const card = await screen.findByRole('article', { name: 'Remplacer les balais' });
        const store = new Map<string, string>();
        const dataTransfer = {
            setData: (k: string, v: string) => store.set(k, v),
            getData: (k: string) => store.get(k) ?? '',
            get types() { return [...store.keys()]; },
            effectAllowed: '', dropEffect: '',
        };
        fireEvent.dragStart(card, { dataTransfer });
        const done = column(/Terminé \(0\)/);
        fireEvent.dragOver(done, { dataTransfer });
        fireEvent.drop(done, { dataTransfer });

        await waitFor(() => expect(within(column(/Terminé \(1\)/)).getByText('Remplacer les balais')).toBeTruthy());
        expect(store.has('application/x-fleet-task')).toBe(true);
        expect(JSON.parse(String((patchCalls()[0][1] as RequestInit).body))).toEqual({ status: 'DONE' });
    });

    it('un texte externe déposé sur une colonne n\'est pas pris pour une tâche', async () => {
        render(<TasksTab openTaskId={null} onOpenTask={vi.fn()} />);
        await screen.findByRole('article', { name: 'Remplacer les balais' });
        const dataTransfer = { types: ['text/plain'], getData: (k: string) => (k === 'text/plain' ? 'balais' : ''), dropEffect: '' };
        const done = column(/Terminé \(0\)/);
        fireEvent.dragOver(done, { dataTransfer });
        fireEvent.drop(done, { dataTransfer });
        expect(patchCalls()).toHaveLength(0);
    });

    it('pendant l\'enregistrement d\'un déplacement, la pastille de la carte est désactivée', async () => {
        let release!: () => void;
        const gate = new Promise<void>(r => { release = r; });
        const original = fetchMock.getMockImplementation() as (url: string, init?: RequestInit) => Promise<Response>;
        fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
            if (init?.method === 'PATCH') await gate;
            return original(url, init);
        });
        render(<TasksTab openTaskId={null} onOpenTask={vi.fn()} />);
        const card = await screen.findByRole('article', { name: 'Remplacer les balais' });
        fireEvent.click(within(card).getByRole('button', { name: /État : En cours/ }));
        fireEvent.click(within(card).getByRole('menuitemradio', { name: /En attente/ }));
        const moved = await screen.findByRole('article', { name: 'Remplacer les balais' });
        await waitFor(() => expect((within(moved).getByRole('button', { name: /État : En attente/ }) as HTMLButtonElement).disabled).toBe(true));
        expect(moved.getAttribute('draggable')).toBe('false');
        release();
        await waitFor(() => expect((within(screen.getByRole('article', { name: 'Remplacer les balais' })).getByRole('button', { name: /État :/ }) as HTMLButtonElement).disabled).toBe(false));
        expect(patchCalls()).toHaveLength(1);
    });

    it('menu d\'état au clavier : flèches, Début/Fin, Échap rend le focus à la pastille', async () => {
        render(<TasksTab openTaskId={null} onOpenTask={vi.fn()} />);
        const card = await screen.findByRole('article', { name: 'Remplacer les balais' });
        const pill = within(card).getByRole('button', { name: /État : En cours/ });
        fireEvent.click(pill);
        const menu = within(card).getByRole('menu');
        expect(document.activeElement?.textContent).toMatch(/En cours/);
        fireEvent.keyDown(menu, { key: 'ArrowDown' });
        expect(document.activeElement?.textContent).toMatch(/En attente/);
        fireEvent.keyDown(menu, { key: 'End' });
        expect(document.activeElement?.textContent).toMatch(/Terminé/);
        fireEvent.keyDown(menu, { key: 'ArrowDown' });
        expect(document.activeElement?.textContent).toMatch(/À faire/);
        fireEvent.keyDown(menu, { key: 'Home' });
        expect(document.activeElement?.textContent).toMatch(/À faire/);
        fireEvent.keyDown(menu, { key: 'ArrowUp' });
        expect(document.activeElement?.textContent).toMatch(/Terminé/);
        fireEvent.keyDown(menu, { key: 'Escape' });
        expect(within(card).queryByRole('menu')).toBeNull();
        expect(document.activeElement).toBe(pill);
        expect(patchCalls()).toHaveLength(0);
    });

    it('un lien profond arrivé pendant une création ouvre la tâche à la place du formulaire vide', async () => {
        const { rerender } = render(<TasksTab openTaskId={null} onOpenTask={vi.fn()} />);
        await screen.findByRole('article', { name: 'Remplacer les balais' });
        fireEvent.click(screen.getByRole('button', { name: 'Tâche' }));
        expect(screen.getByRole('dialog', { name: 'Nouvelle tâche' })).toBeTruthy();
        rerender(<TasksTab openTaskId="balais" onOpenTask={vi.fn()} />);
        const dialog = await screen.findByRole('dialog', { name: 'Modifier la tâche' });
        await waitFor(() => expect((within(dialog).getByLabelText('Titre *') as HTMLInputElement).value).toBe('Remplacer les balais'));
    });

    it('lien profond vers une tâche d\'une autre UL (403) : message clair', async () => {
        const original = fetchMock.getMockImplementation() as (url: string, init?: RequestInit) => Promise<Response>;
        fetchMock.mockImplementation(async (url: string, init?: RequestInit) => (
            url === '/api/fleet-tracking/tasks/autre-ul'
                ? new Response(JSON.stringify({ error: 'Accès refusé' }), { status: 403 })
                : original(url, init)
        ));
        const onOpenTask = vi.fn();
        render(<TasksTab openTaskId="autre-ul" onOpenTask={onOpenTask} />);
        expect((await screen.findByRole('alert')).textContent).toBe('Cette tâche appartient à une autre unité locale : changez d\u2019UL dans l\u2019en-tête pour l\u2019ouvrir.');
        fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
        expect(onOpenTask).toHaveBeenCalledWith(null);
    });

    it('« Terminé » est replié au-delà de 5 cartes', async () => {
        tasks = Array.from({ length: 7 }, (_, i) => task(`d${i}`, { title: `Fini ${i}`, status: 'DONE', completedAt: `2026-11-1${i}T10:00:00.000Z` }));
        render(<TasksTab openTaskId={null} onOpenTask={vi.fn()} />);
        const done = await screen.findByRole('region', { name: /Terminé \(7\)/ });
        expect(within(done).getAllByRole('article')).toHaveLength(5);
        // Les plus récemment terminées d'abord.
        expect(within(done).getAllByRole('article')[0].getAttribute('aria-label')).toBe('Fini 6');
        fireEvent.click(within(done).getByRole('button', { name: 'Afficher les 2 autres' }));
        expect(within(done).getAllByRole('article')).toHaveLength(7);
    });

    it('vide : « Aucune tâche pour l\'instant » et bouton de création', async () => {
        tasks = [];
        render(<TasksTab openTaskId={null} onOpenTask={vi.fn()} />);
        expect(await screen.findByText('Aucune tâche pour l’instant')).toBeTruthy();
        fireEvent.click(screen.getAllByRole('button', { name: /Tâche/ }).at(-1)!);
        expect(screen.getByRole('dialog', { name: 'Nouvelle tâche' })).toBeTruthy();
    });

    it('lien de notification (?tache=) : la modale de la tâche s\'affiche', async () => {
        const onOpenTask = vi.fn();
        render(<TasksTab openTaskId="balais" onOpenTask={onOpenTask} />);
        const dialog = await screen.findByRole('dialog', { name: 'Modifier la tâche' });
        await waitFor(() => expect((within(dialog).getByLabelText('Titre *') as HTMLInputElement).value).toBe('Remplacer les balais'));
        fireEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }));
        expect(onOpenTask).toHaveBeenCalledWith(null);
    });

    it('cliquer une carte demande l\'ouverture de sa modale', async () => {
        const onOpenTask = vi.fn();
        render(<TasksTab openTaskId={null} onOpenTask={onOpenTask} />);
        fireEvent.click(await screen.findByRole('button', { name: 'Remplacer les balais' }));
        expect(onOpenTask).toHaveBeenCalledWith('balais');
    });

    it('les filtres sont transmis à l\'API', async () => {
        render(<TasksTab openTaskId={null} onOpenTask={vi.fn()} />);
        await screen.findByRole('article', { name: 'Remplacer les balais' });
        fireEvent.click(screen.getByRole('button', { name: 'Mes tâches' }));
        fireEvent.click(screen.getByRole('button', { name: /Épinglées/ }));
        await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u) === '/api/fleet-tracking/tasks?assignee=me&pinned=1')).toBe(true));
    });

    it('filtre d\'ouverture « echeance » : tâches à échéance demandées ; le retirer prévient l\'onglet', async () => {
        const onFilterChanged = vi.fn();
        render(<TasksTab openTaskId={null} onOpenTask={vi.fn()} initialFilter="echeance" onFilterChanged={onFilterChanged} />);
        await screen.findByRole('article', { name: 'Remplacer les balais' });
        expect(fetchMock.mock.calls.some(([u]) => String(u) === '/api/fleet-tracking/tasks?due=soon')).toBe(true);
        const toggle = screen.getByRole('button', { name: 'Échéances à traiter' });
        expect(toggle.getAttribute('aria-pressed')).toBe('true');
        expect(onFilterChanged).not.toHaveBeenCalled();
        fireEvent.click(toggle);
        expect(onFilterChanged).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u) === '/api/fleet-tracking/tasks')).toBe(true));
    });

    it('onChanged : une fois après un déplacement réussi, jamais après un échec', async () => {
        const onChanged = vi.fn();
        render(<TasksTab openTaskId={null} onOpenTask={vi.fn()} onChanged={onChanged} />);
        const card = await screen.findByRole('article', { name: 'Demander un devis carrosserie' });
        fireEvent.click(within(card).getByRole('button', { name: /État : À faire/ }));
        fireEvent.click(within(card).getByRole('menuitemradio', { name: /En attente/ }));
        await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));

        patchStatus = 500;
        const other = screen.getByRole('article', { name: 'Remplacer les balais' });
        fireEvent.click(within(other).getByRole('button', { name: /État : En cours/ }));
        fireEvent.click(within(other).getByRole('menuitemradio', { name: /Terminé/ }));
        expect(await screen.findByRole('alert')).toBeTruthy();
        expect(onChanged).toHaveBeenCalledTimes(1);
    });

    it('onChanged : une fois après l\'enregistrement de la modale', async () => {
        const onChanged = vi.fn();
        render(<TasksTab openTaskId="balais" onOpenTask={vi.fn()} onChanged={onChanged} />);
        const dialog = await screen.findByRole('dialog', { name: 'Modifier la tâche' });
        const title = within(dialog).getByLabelText('Titre *') as HTMLInputElement;
        await waitFor(() => expect(title.value).toBe('Remplacer les balais'));
        fireEvent.change(title, { target: { value: 'Remplacer les balais avant' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
        await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    });
});
