/**
 * Tests RTL — suivi technique, onglet « Contrôles » : filtres avec effectifs, états,
 * saisie d'un rendez-vous (la ligne quitte « À dater »), option « Créer une tâche »,
 * rendez-vous passé, suppression.
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ControlsTab from '@/components/fleetTracking/ControlsTab';
import {
    computeControls,
    countControls,
    type ControlAppointment,
    type ControlVehicle,
} from '@/lib/fleetTracking/controls';

const TODAY = '2026-11-18';

function vehicle(id: string, name: string, patch: Partial<ControlVehicle> = {}): ControlVehicle {
    return {
        id, name, plate: null, type: 'VL', mileage: 0, firstRegistrationDate: null,
        revisionKmInterval: null, revisionYearInterval: null, desinfTracking: false, nextDesinfMaxDate: null, ...patch,
    };
}

let appointments: ControlAppointment[];
let puts: Record<string, unknown>[];
let taskFails: boolean;
let fetchMock: ReturnType<typeof vi.fn>;

const vehicles = [
    vehicle('v182', '75-182', { type: 'VPSP', desinfTracking: true, nextDesinfMaxDate: '2026-11-16' }),
    vehicle('v184', '75-184', { firstRegistrationDate: '2022-12-12' }),
    vehicle('v186', '75-186', { desinfTracking: true, nextDesinfMaxDate: '2027-03-14' }),
];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
    appointments = [];
    puts = [];
    taskFails = false;
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        if (url.startsWith('/api/fleet-tracking/contacts')) {
            return json({ own: [{ id: 'c1', ulId: 'ul', name: 'Garage Renault Clichy', category: 'GARAGE', phones: [], email: null, address: null, notes: null, shared: false }], shared: [] });
        }
        if (init?.method === 'PUT') {
            const body = JSON.parse(String(init.body)) as Record<string, string> & { createTask?: boolean };
            puts.push(body);
            appointments = appointments.filter(a => !(a.vehicleId === body.vehicleId && a.controlType === body.controlType));
            appointments.push({
                id: `a-${body.vehicleId}`, vehicleId: body.vehicleId, controlType: body.controlType as ControlAppointment['controlType'],
                appointmentDate: body.appointmentDate, contactId: body.contactId ?? null,
                contactName: body.contactId === 'c1' ? 'Garage Renault Clichy' : null, notes: body.notes ?? null,
                taskId: body.createTask && !taskFails ? 't-1' : null,
            });
            if (body.createTask && taskFails) {
                return json({ success: true, taskId: null, taskCreated: false, taskError: "Rendez-vous enregistré, mais la tâche n'a pas pu être créée" });
            }
            return json({ success: true, taskId: body.createTask ? 't-1' : null, taskCreated: !!body.createTask, taskError: null });
        }
        if (init?.method === 'DELETE') {
            const id = decodeURIComponent(url.split('/').pop()!);
            appointments = appointments.filter(a => a.id !== id);
            return json({ success: true });
        }
        const controls = computeControls(vehicles, [], appointments, TODAY);
        return json({ today: TODAY, controls, counts: countControls(controls) });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => vi.restoreAllMocks());

const filter = (name: RegExp) => screen.getByRole('button', { name });
const row = (key: string) => screen.queryByTestId(`control-${key}`);

describe('ControlsTab', () => {
    it('affiche les échéances triées avec leur état et les effectifs des filtres', async () => {
        render(<ControlsTab />);
        expect((await screen.findAllByText('Désinfection VPSP')).length).toBe(2);
        expect(filter(/^Toutes \(3\)$/).getAttribute('aria-pressed')).toBe('true');
        expect(filter(/^À dater \(3\)$/)).toBeTruthy();
        expect(filter(/^Sous 30 jours \(2\)$/)).toBeTruthy();
        expect(filter(/^Dépassées \(1\)$/)).toBeTruthy();
        expect(filter(/^RDV fixé \(0\)$/)).toBeTruthy();
        const keys = screen.getAllByTestId(/^control-/).map(el => el.dataset.testid);
        expect(keys).toEqual(['control-v182:DESINFECTION', 'control-v184:CT', 'control-v186:DESINFECTION']);
        expect(within(row('v182:DESINFECTION')!).getByText('Dépassée')).toBeTruthy();
        expect(within(row('v182:DESINFECTION')!).getByText('16/11/2026 · dépassée de 2 j')).toBeTruthy();
        expect(within(row('v184:CT')!).getByText('À dater')).toBeTruthy();
    });

    it('filtre « Dépassées » puis « Sous 30 jours »', async () => {
        render(<ControlsTab />);
        await screen.findAllByText('Désinfection VPSP');
        fireEvent.click(filter(/^Dépassées/));
        expect(screen.getAllByTestId(/^control-/)).toHaveLength(1);
        expect(row('v182:DESINFECTION')).toBeTruthy();
        fireEvent.click(filter(/^Sous 30 jours/));
        expect(screen.getAllByTestId(/^control-/).map(el => el.dataset.testid)).toEqual(['control-v182:DESINFECTION', 'control-v184:CT']);
        fireEvent.click(filter(/^RDV fixé/));
        expect(screen.getByText('Aucun rendez-vous fixé.')).toBeTruthy();
    });

    it('fixer un RDV sur le CT du 75-184 : la ligne quitte « À dater » et passe « RDV fixé »', async () => {
        const onChanged = vi.fn();
        render(<ControlsTab onChanged={onChanged} />);
        await screen.findAllByText('Désinfection VPSP');
        fireEvent.click(filter(/^À dater/));
        expect(row('v184:CT')).toBeTruthy();

        fireEvent.click(within(row('v184:CT')!).getByRole('button', { name: /Fixer un rendez-vous/ }));
        const dialog = await screen.findByRole('dialog');
        await within(dialog).findByRole('option', { name: 'Garage Renault Clichy' });
        fireEvent.change(within(dialog).getByLabelText(/Date du rendez-vous/), { target: { value: '2026-11-28' } });
        fireEvent.change(within(dialog).getByLabelText('Garage'), { target: { value: 'c1' } });
        fireEvent.click(within(dialog).getByRole('checkbox'));
        fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(screen.getByText('Rendez-vous enregistré · Tâche créée')).toBeTruthy();
        expect(onChanged).toHaveBeenCalled();
        expect(puts[0]).toEqual({ vehicleId: 'v184', controlType: 'CT', appointmentDate: '2026-11-28', contactId: 'c1', notes: null, createTask: true });
        await waitFor(() => expect(row('v184:CT')).toBeNull());
        expect(filter(/^À dater \(2\)$/)).toBeTruthy();
        fireEvent.click(filter(/^RDV fixé/));
        expect(within(row('v184:CT')!).getByText('28/11/2026 · Garage Renault Clichy')).toBeTruthy();
        expect(within(row('v184:CT')!).getByRole('button', { name: /Modifier le rendez-vous/ })).toBeTruthy();
    });

    it('date requise : rien n\'est envoyé', async () => {
        render(<ControlsTab />);
        await screen.findAllByText('Désinfection VPSP');
        fireEvent.click(within(row('v184:CT')!).getByRole('button', { name: /Fixer un rendez-vous/ }));
        const dialog = await screen.findByRole('dialog');
        fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
        expect((await within(dialog).findByRole('alert')).textContent).toContain('La date du rendez-vous est requise');
        expect(puts).toHaveLength(0);
    });

    it('rendez-vous passé : « RDV passé le … » et toujours à dater ; suppression possible', async () => {
        appointments = [{ id: 'a-old', vehicleId: 'v184', controlType: 'CT', appointmentDate: '2026-11-10', contactId: null, contactName: null, notes: null, taskId: null }];
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        render(<ControlsTab />);
        await screen.findAllByText('Désinfection VPSP');
        expect(within(row('v184:CT')!).getByText('RDV passé le 10/11/2026')).toBeTruthy();
        expect(within(row('v184:CT')!).getByText('À dater')).toBeTruthy();

        fireEvent.click(within(row('v184:CT')!).getByRole('button', { name: /Fixer un rendez-vous/ }));
        const dialog = await screen.findByRole('dialog');
        fireEvent.click(within(dialog).getByRole('button', { name: 'Supprimer le rendez-vous' }));
        await waitFor(() => expect(screen.queryByText('RDV passé le 10/11/2026')).toBeNull());
        expect(fetchMock).toHaveBeenCalledWith('/api/fleet-tracking/controls/appointments/a-old', { method: 'DELETE' });
    });

    it('erreur de chargement affichée, sans tableau vide', async () => {
        fetchMock.mockImplementation(async () => json({ error: 'Interdit' }, 403));
        render(<ControlsTab />);
        expect((await screen.findByRole('alert')).textContent).toContain('Interdit');
        expect(screen.queryByRole('table')).toBeNull();
        expect(screen.queryByText(/Aucune échéance/)).toBeNull();
    });

    it('date bornée (aujourd\'hui → + 5 ans) ; une date passée est refusée sans envoi', async () => {
        render(<ControlsTab />);
        await screen.findAllByText('Désinfection VPSP');
        fireEvent.click(within(row('v184:CT')!).getByRole('button', { name: /Fixer un rendez-vous/ }));
        const dialog = await screen.findByRole('dialog');
        const input = within(dialog).getByLabelText(/Date du rendez-vous/) as HTMLInputElement;
        expect(input.min).toBe('2026-11-18');
        expect(input.max).toBe('2031-11-18');
        fireEvent.change(input, { target: { value: '2026-11-10' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
        expect((await within(dialog).findByRole('alert')).textContent).toMatch(/passée/);
        expect(puts).toHaveLength(0);
    });

    it('tâche liée existante : « Tâche liée » à la place de la case, jamais de nouvelle tâche demandée', async () => {
        appointments = [{ id: 'a-1', vehicleId: 'v184', controlType: 'CT', appointmentDate: '2026-11-28', contactId: null, contactName: null, notes: null, taskId: 't-1' }];
        render(<ControlsTab />);
        await screen.findAllByText('Désinfection VPSP');
        fireEvent.click(within(row('v184:CT')!).getByRole('button', { name: /Modifier le rendez-vous/ }));
        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByText(/Tâche liée/)).toBeTruthy();
        expect(within(dialog).queryByRole('checkbox')).toBeNull();
        fireEvent.change(within(dialog).getByLabelText(/Date du rendez-vous/), { target: { value: '2026-12-02' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
        await waitFor(() => expect(puts).toHaveLength(1));
        expect(puts[0].createTask).toBe(false);
    });

    it('tâche non créée : message dans la modale, qui reste ouverte, et la liste est relue', async () => {
        taskFails = true;
        render(<ControlsTab />);
        await screen.findAllByText('Désinfection VPSP');
        fireEvent.click(within(row('v184:CT')!).getByRole('button', { name: /Fixer un rendez-vous/ }));
        const dialog = await screen.findByRole('dialog');
        fireEvent.change(within(dialog).getByLabelText(/Date du rendez-vous/), { target: { value: '2026-11-28' } });
        fireEvent.click(within(dialog).getByRole('checkbox'));
        fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
        expect((await within(dialog).findByRole('alert')).textContent).toBe("Rendez-vous enregistré, mais la tâche n'a pas pu être créée");
        expect(screen.getByRole('dialog')).toBeTruthy();
        await waitFor(() => expect(within(row('v184:CT')!).getByText('RDV fixé')).toBeTruthy());
    });
});
