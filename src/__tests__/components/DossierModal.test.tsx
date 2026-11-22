/**
 * Tests RTL — suivi technique, modale de dossier : véhicules cochés d'office (filtre
 * de l'onglet, #176), choix de plusieurs véhicules (#177), recherche, modification de
 * la liste (envoyée seulement si elle change), véhicule parti de l'UL retirable.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import DossierModal from '@/components/fleetTracking/DossierModal';
import type { FleetDossier } from '@/lib/fleetTracking/dossiers';
import type { LinkTarget } from '@/lib/fleetTracking/tasks';

const VEHICLES: LinkTarget[] = [
    { type: 'VEHICLE', id: 'veh-a', label: '75-188', detail: 'GV-114-QM' },
    { type: 'VEHICLE', id: 'veh-b', label: '75-186', detail: null },
    { type: 'VEHICLE', id: 'veh-c', label: '75-182', detail: null },
];

const dossier = (patch: Partial<FleetDossier> = {}): FleetDossier => ({
    id: 'd-1', title: 'Pneus hiver', description: null, status: 'OPEN', pinned: false,
    vehicles: [{ id: 'veh-a', name: '75-188', plate: 'GV-114-QM', missing: false }], createdByName: null,
    createdAt: 't', updatedAt: 't', closedAt: null, closeReason: null, sourceType: null, sourceId: null,
    taskCount: 0, openTaskCount: 0, itemCount: 0, missingItemCount: 0, attachmentCount: 0, ...patch,
});

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, id: 'd-new' }), { status: 201 }));
    global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => vi.restoreAllMocks());

const checkbox = (name: RegExp) => screen.getByRole('checkbox', { name }) as HTMLInputElement;
const sentBody = () => JSON.parse(String((fetchMock.mock.calls.at(-1) as [string, RequestInit])[1].body)) as Record<string, unknown>;

describe('DossierModal', () => {
    it('création : véhicule du filtre coché d\'office, un second ajouté, vehicleIds envoyés dans l\'ordre de choix', async () => {
        const onSaved = vi.fn();
        render(<DossierModal dossier={null} vehicles={VEHICLES} initialVehicleIds={['veh-b']} onClose={vi.fn()} onSaved={onSaved} />);
        expect(checkbox(/75-186/).checked).toBe(true);
        expect(checkbox(/75-188/).checked).toBe(false);
        fireEvent.click(checkbox(/75-188/));
        expect(screen.getByText('2 véhicules choisis')).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Titre *'), { target: { value: 'Pneus hiver' } });
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
        await waitFor(() => expect(onSaved).toHaveBeenCalledWith('d-new'));
        expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/api/fleet-tracking/dossiers');
        expect(sentBody()).toMatchObject({ title: 'Pneus hiver', vehicleIds: ['veh-b', 'veh-a'] });
    });

    it('création sans véhicule : message, rien n\'est envoyé', () => {
        render(<DossierModal dossier={null} vehicles={VEHICLES} onClose={vi.fn()} onSaved={vi.fn()} />);
        fireEvent.change(screen.getByLabelText('Titre *'), { target: { value: 'X' } });
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
        expect(screen.getByRole('alert').textContent).toBe('Choisissez au moins un véhicule');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('modification sans toucher aux véhicules : vehicleIds non envoyés', async () => {
        const onSaved = vi.fn();
        render(<DossierModal dossier={dossier()} vehicles={VEHICLES} onClose={vi.fn()} onSaved={onSaved} />);
        fireEvent.change(screen.getByLabelText('Titre *'), { target: { value: 'Pneus été' } });
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
        await waitFor(() => expect(onSaved).toHaveBeenCalledWith('d-1'));
        expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/api/fleet-tracking/dossiers/d-1');
        expect(sentBody()).not.toHaveProperty('vehicleIds');
    });

    it('modification : véhicule ajouté, véhicule parti de l\'UL décoché → nouvelle liste envoyée', async () => {
        const onSaved = vi.fn();
        render(<DossierModal
            dossier={dossier({ vehicles: [
                { id: 'veh-a', name: '75-188', plate: null, missing: false },
                { id: 'veh-old', name: 'Véhicule indisponible', plate: null, missing: true },
            ] })}
            vehicles={VEHICLES} onClose={vi.fn()} onSaved={onSaved} />);
        expect(checkbox(/Véhicule indisponible/).checked).toBe(true);
        fireEvent.click(checkbox(/Véhicule indisponible/));
        fireEvent.click(checkbox(/75-182/));
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(sentBody()).toMatchObject({ vehicleIds: ['veh-a', 'veh-c'] });
    });

    it('liste longue : la recherche filtre les véhicules sans perdre les coches', () => {
        const many: LinkTarget[] = Array.from({ length: 10 }, (_, i) => ({ type: 'VEHICLE', id: `v${i}`, label: `75-1${i}0`, detail: null }));
        render(<DossierModal dossier={null} vehicles={many} initialVehicleIds={['v1']} onClose={vi.fn()} onSaved={vi.fn()} />);
        fireEvent.change(screen.getByLabelText('Rechercher un véhicule'), { target: { value: '75-120' } });
        expect(screen.getAllByRole('checkbox')).toHaveLength(1);
        expect(screen.getByText('1 véhicule choisi')).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Rechercher un véhicule'), { target: { value: 'zzz' } });
        expect(screen.getByText('Aucun véhicule ne correspond.')).toBeTruthy();
    });

    it('sans liste fournie : charge les véhicules de l\'UL', async () => {
        fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ targets: VEHICLES }), { status: 200 }));
        render(<DossierModal dossier={null} initialVehicleIds={['veh-a']} onClose={vi.fn()} onSaved={vi.fn()} />);
        expect(screen.getByRole('status').textContent).toMatch(/Chargement/);
        expect((await screen.findByRole('checkbox', { name: /75-188/ }) as HTMLInputElement).checked).toBe(true);
        expect(fetchMock).toHaveBeenCalledWith('/api/fleet-tracking/link-targets?type=VEHICLE', expect.anything());
    });
});
