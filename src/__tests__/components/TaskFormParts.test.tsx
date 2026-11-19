/**
 * Tests RTL — pièces de la modale de tâche et barre d'outils du suivi technique :
 * AssigneePicker, LinkPicker (dont l'affichage d'erreur), TaskAttachments
 * (validation navigateur, erreurs d'envoi et de suppression, dépôt pendant un envoi),
 * TasksToolbar.
 */
import { useState } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AssigneePicker from '@/components/fleetTracking/AssigneePicker';
import LinkPicker from '@/components/fleetTracking/LinkPicker';
import TaskAttachments from '@/components/fleetTracking/TaskAttachments';
import TasksToolbar from '@/components/fleetTracking/TasksToolbar';
import { EMPTY_TASK_FILTERS } from '@/components/fleetTracking/useFleetTasks';
import type { AssignableManager, TaskAssignee, TaskAttachment, TaskLink } from '@/lib/fleetTracking/tasks';

const MANAGERS: AssignableManager[] = [
    { id: 'u-me', name: 'Camille Roux', email: 'camille@test.fr', roleLabel: 'Responsable véhicule' },
    { id: 'u-thomas', name: 'Thomas Leroy', email: 'thomas@test.fr', roleLabel: 'Administrateur' },
    { id: 'u-ines', name: 'Inès Bernard', email: 'ines@test.fr', roleLabel: 'Responsable véhicule' },
];

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => vi.restoreAllMocks());

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('AssigneePicker', () => {
    function Harness({ initial = [] as TaskAssignee[] }) {
        const [value, setValue] = useState<TaskAssignee[]>(initial);
        return (
            <>
                <AssigneePicker options={MANAGERS} value={value} onChange={setValue} currentUserId="u-me" />
                <output data-testid="value">{value.map(v => v.id).join(',')}</output>
            </>
        );
    }

    it('recherche sans accents, exclut les déjà choisis, ajoute et retire', () => {
        render(<Harness initial={[{ id: 'u-thomas', name: 'Thomas Leroy' }]} />);
        const input = screen.getByRole('combobox', { name: 'Ajouter un assigné' });
        fireEvent.focus(input);
        const list = screen.getByRole('listbox');
        expect(within(list).queryByRole('option', { name: /Thomas/ })).toBeNull();
        fireEvent.change(input, { target: { value: 'ines' } });
        expect(within(list).getAllByRole('option')).toHaveLength(1);
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(screen.getByTestId('value').textContent).toBe('u-thomas,u-ines');
        fireEvent.click(screen.getByRole('button', { name: 'Retirer Thomas Leroy' }));
        expect(screen.getByTestId('value').textContent).toBe('u-ines');
    });

    it('marque « (moi) » et affiche le rôle ; liste vide signalée', () => {
        const { unmount } = render(<Harness />);
        fireEvent.focus(screen.getByRole('combobox', { name: 'Ajouter un assigné' }));
        const me = screen.getByRole('option', { name: /Camille Roux \(moi\)/ });
        expect(within(me).getByText('Responsable véhicule')).toBeTruthy();
        unmount();
        render(<AssigneePicker options={[]} value={[]} onChange={vi.fn()} />);
        fireEvent.focus(screen.getByRole('combobox', { name: 'Ajouter un assigné' }));
        expect(screen.getByText('Aucun responsable disponible')).toBeTruthy();
    });
});

describe('LinkPicker', () => {
    function Harness({ initial = [] as TaskLink[] }) {
        const [value, setValue] = useState<TaskLink[]>(initial);
        return (
            <>
                <LinkPicker value={value} onChange={setValue} />
                <output data-testid="value">{value.map(v => `${v.type}:${v.id}`).join(',')}</output>
            </>
        );
    }

    it('résultats groupés par type ; un choix ajoute une puce cliquable', async () => {
        fetchMock.mockResolvedValue(json({ targets: [
            { type: 'VEHICLE', id: 'v1', label: '75-188', detail: 'GV-114-QM' },
            { type: 'CONTACT', id: 'c1', label: 'MVR Évolution', detail: null },
            { type: 'INCIDENT', id: 'i1', label: 'Incident du 14/11/2026', detail: '75-188' },
        ] }));
        render(<Harness />);
        fireEvent.focus(screen.getByRole('combobox', { name: 'Ajouter un rattachement' }));
        const vehicles = await screen.findByRole('group', { name: 'Véhicules' });
        expect(within(vehicles).getByRole('option', { name: /75-188/ })).toBeTruthy();
        expect(screen.getByRole('group', { name: 'Contacts' })).toBeTruthy();
        expect(screen.getByRole('group', { name: 'Incidents' })).toBeTruthy();
        fireEvent.click(within(vehicles).getByRole('option', { name: /75-188/ }));
        expect(screen.getByTestId('value').textContent).toBe('VEHICLE:v1');
        expect(screen.getByRole('link', { name: '75-188' }).getAttribute('href')).toBe('/vehicles/75-188');
        expect(String(fetchMock.mock.calls[0][0])).toBe('/api/fleet-tracking/link-targets?q=');
    });

    it('erreur de recherche : message affiché', async () => {
        fetchMock.mockResolvedValue(json({ error: 'Accès refusé' }, 403));
        render(<Harness />);
        fireEvent.focus(screen.getByRole('combobox', { name: 'Ajouter un rattachement' }));
        expect((await screen.findByRole('alert')).textContent).toBe('Accès refusé');
    });

    it('panne réseau : « Recherche impossible »', async () => {
        fetchMock.mockRejectedValue(new Error('offline'));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        render(<Harness />);
        fireEvent.focus(screen.getByRole('combobox', { name: 'Ajouter un rattachement' }));
        expect((await screen.findByRole('alert')).textContent).toBe('Recherche impossible');
    });

    it('un rattachement indisponible reste affiché sans lien', () => {
        render(<Harness initial={[{ type: 'CONTACT', id: 'c9', label: 'Contact indisponible', detail: null, phone: null, vehicleName: null, missing: true }]} />);
        expect(screen.getByText('Contact indisponible')).toBeTruthy();
        expect(screen.queryByRole('link')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Retirer Contact indisponible' }));
        expect(screen.getByTestId('value').textContent).toBe('');
    });
});

describe('TaskAttachments', () => {
    const PDF_ATTACHMENT: TaskAttachment = { id: 'a1', fileName: 'devis.pdf', contentType: 'application/pdf', size: 2_200_000, uploadedByName: 'Inès B.', createdAt: '2026-11-12T10:00:00Z' };

    function Harness({ initial = [] as TaskAttachment[] }) {
        const [value, setValue] = useState<TaskAttachment[]>(initial);
        return (
            <>
                <TaskAttachments taskId="t1" attachments={value} onChange={setValue} />
                <output data-testid="value">{value.map(v => v.fileName).join(',')}</output>
            </>
        );
    }
    const pick = (file: File) => fireEvent.change(screen.getByLabelText('Joindre un fichier'), { target: { files: [file] } });

    it('liste : nom, taille, déposant, date', () => {
        render(<Harness initial={[PDF_ATTACHMENT]} />);
        expect(screen.getByRole('link', { name: 'devis.pdf' })).toBeTruthy();
        expect(screen.getByText('2,1 Mo · Inès B. · 12/11/2026')).toBeTruthy();
    });

    it('validation navigateur : type refusé ou plus de 4 Mo, rien n\'est envoyé', () => {
        render(<Harness />);
        pick(new File(['MZ'], 'outil.exe', { type: 'application/x-msdownload' }));
        expect(screen.getByRole('alert').textContent).toMatch(/PDF ou une image/);
        pick(new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'gros.pdf', { type: 'application/pdf' }));
        expect(screen.getByRole('alert').textContent).toMatch(/4 Mo/);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('envoi réussi ajoute la pièce jointe ; erreur d\'envoi affichée', async () => {
        fetchMock.mockResolvedValueOnce(json({ attachment: { ...PDF_ATTACHMENT, id: 'a2', fileName: 'photo.png' } }, 201));
        render(<Harness />);
        pick(new File(['x'], 'photo.png', { type: 'image/png' }));
        await waitFor(() => expect(screen.getByTestId('value').textContent).toBe('photo.png'));
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('/api/fleet-tracking/tasks/t1/attachments');
        expect(init.method).toBe('POST');

        fetchMock.mockResolvedValueOnce(json({ error: 'Une tâche compte au plus 20 pièces jointes.' }, 400));
        pick(new File(['x'], 'autre.pdf', { type: 'application/pdf' }));
        expect((await screen.findByRole('alert')).textContent).toMatch(/au plus 20/);
        expect(screen.getByTestId('value').textContent).toBe('photo.png');
    });

    it('suppression : confirmation, puis erreur affichée sans retirer la ligne', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        fetchMock.mockResolvedValueOnce(json({ error: 'Erreur serveur' }, 500));
        render(<Harness initial={[PDF_ATTACHMENT]} />);
        fireEvent.click(screen.getByRole('button', { name: 'Supprimer devis.pdf' }));
        expect((await screen.findByRole('alert')).textContent).toBe('Erreur serveur');
        expect(screen.getByTestId('value').textContent).toBe('devis.pdf');

        fetchMock.mockResolvedValueOnce(json({ success: true }));
        fireEvent.click(screen.getByRole('button', { name: 'Supprimer devis.pdf' }));
        await waitFor(() => expect(screen.getByTestId('value').textContent).toBe(''));
        expect((fetchMock.mock.calls[1] as [string, RequestInit])[1].method).toBe('DELETE');
    });

    it('dépôt pendant un envoi : ignoré, aucune pièce jointe ne disparaît', async () => {
        let release!: (r: Response) => void;
        fetchMock.mockReturnValueOnce(new Promise<Response>(r => { release = r; }));
        render(<Harness initial={[PDF_ATTACHMENT]} />);
        pick(new File(['x'], 'premier.pdf', { type: 'application/pdf' }));
        const zone = screen.getByText(/Envoi…/).parentElement!;
        fireEvent.drop(zone, { dataTransfer: { files: [new File(['y'], 'second.pdf', { type: 'application/pdf' })] } });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        release(json({ attachment: { ...PDF_ATTACHMENT, id: 'a3', fileName: 'premier.pdf' } }, 201));
        await waitFor(() => expect(screen.getByTestId('value').textContent).toBe('devis.pdf,premier.pdf'));
    });
});

describe('TasksToolbar', () => {
    it('transmet les filtres, la vue et la création', () => {
        const onChange = vi.fn();
        const onViewChange = vi.fn();
        const onCreate = vi.fn();
        render(
            <TasksToolbar
                filters={EMPTY_TASK_FILTERS}
                onChange={onChange}
                vehicles={[{ type: 'VEHICLE', id: 'v1', label: '75-188', detail: null }]}
                assignees={MANAGERS}
                view="board"
                onViewChange={onViewChange}
                onCreate={onCreate}
            />,
        );
        fireEvent.change(screen.getByLabelText('Rechercher une tâche'), { target: { value: 'devis' } });
        expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_TASK_FILTERS, q: 'devis' });
        fireEvent.change(screen.getByLabelText('Filtrer par véhicule'), { target: { value: 'v1' } });
        expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_TASK_FILTERS, vehicle: 'v1' });
        fireEvent.change(screen.getByLabelText('Filtrer par assigné'), { target: { value: 'u-thomas' } });
        expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_TASK_FILTERS, assignee: 'u-thomas' });
        fireEvent.click(screen.getByRole('button', { name: 'Mes tâches' }));
        expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_TASK_FILTERS, assignee: 'me' });
        fireEvent.click(screen.getByRole('button', { name: /Épinglées/ }));
        expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_TASK_FILTERS, pinned: true });
        fireEvent.click(screen.getByRole('button', { name: 'Prioritaires' }));
        expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_TASK_FILTERS, priority: 'HIGH' });
        expect(screen.getByRole('button', { name: /Tableau/ }).getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(screen.getByRole('button', { name: /Liste/ }));
        expect(onViewChange).toHaveBeenCalledWith('list');
        fireEvent.click(screen.getByRole('button', { name: 'Tâche' }));
        expect(onCreate).toHaveBeenCalled();
    });

    it('un filtre rapide actif se désactive au second clic', () => {
        const onChange = vi.fn();
        render(
            <TasksToolbar filters={{ ...EMPTY_TASK_FILTERS, assignee: 'me', priority: 'HIGH' }} onChange={onChange}
                vehicles={[]} assignees={[]} view="list" onViewChange={vi.fn()} onCreate={vi.fn()} />,
        );
        expect(screen.getByRole('button', { name: 'Mes tâches' }).getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(screen.getByRole('button', { name: 'Mes tâches' }));
        expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_TASK_FILTERS, priority: 'HIGH' });
        fireEvent.click(screen.getByRole('button', { name: 'Prioritaires' }));
        expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_TASK_FILTERS, assignee: 'me' });
    });
});
