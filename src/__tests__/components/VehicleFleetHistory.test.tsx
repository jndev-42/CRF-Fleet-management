/**
 * Tests RTL — section « Suivi technique » de la fiche véhicule : absente pour un
 * CHVL et en Vue DT (aucun appel), historique filtrable Tout / En cours / Clos-terminé
 * pour un responsable, masquée si l'API refuse (véhicule d'une autre UL).
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

import VehicleFleetHistory from '@/components/vehicle/VehicleFleetHistory';
import type { FleetDossier, VehicleHistoryEntry } from '@/lib/fleetTracking/dossiers';
import type { FleetTask } from '@/lib/fleetTracking/tasks';

const dossier = (id: string, title: string, status: 'OPEN' | 'CLOSED', createdAt: string): FleetDossier => ({
    id, title, description: null, status, pinned: false,
    vehicle: { id: 'veh-a', name: '75-188', plate: null, missing: false },
    createdByName: null, createdAt, updatedAt: createdAt, closedAt: status === 'CLOSED' ? '2026-03-21T10:00:00Z' : null,
    taskCount: 2, openTaskCount: status === 'OPEN' ? 2 : 0, itemCount: 2, missingItemCount: status === 'OPEN' ? 1 : 0, attachmentCount: 0,
});
const TASK: FleetTask = {
    id: 't-1', title: 'Révision 105 000 km', description: null, status: 'DONE', priority: 'NORMAL', dueDate: null, pinned: false,
    dossierId: null, completedAt: '2026-01-09T10:00:00Z', createdAt: '2026-01-05T10:00:00Z', updatedAt: 't',
    assignees: [], links: [], attachmentCount: 1,
};
const ENTRIES: VehicleHistoryEntry[] = [
    { kind: 'DOSSIER', date: '2026-11-14T10:00:00Z', dossier: dossier('d-1', 'Sinistre roue arrière droite', 'OPEN', '2026-11-14T10:00:00Z') },
    { kind: 'TASK', date: TASK.createdAt, task: TASK },
    { kind: 'DOSSIER', date: '2026-03-14T10:00:00Z', dossier: dossier('d-2', 'Remplacement batterie', 'CLOSED', '2026-03-14T10:00:00Z') },
];

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
    push.mockReset();
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ vehicle: { id: 'veh-a', name: '75-188' }, entries: ENTRIES }), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => vi.restoreAllMocks());

describe('VehicleFleetHistory', () => {
    it('CHVL : section absente, aucun appel', () => {
        const { container } = render(<VehicleFleetHistory vehicleName="75-188" userRoles={['CHVL']} isDtView={false} />);
        expect(container.textContent).toBe('');
        expect(screen.queryByText('Suivi technique')).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('Vue DT : section absente même pour un responsable', () => {
        const { container } = render(<VehicleFleetHistory vehicleName="75-188" userRoles={['ADMIN']} isDtView />);
        expect(container.textContent).toBe('');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('responsable : 3 entrées du plus récent au plus ancien, filtres avec compteurs, ouverture d\'un dossier', async () => {
        render(<VehicleFleetHistory vehicleName="75-188" userRoles={['RESP_VEHICULE']} isDtView={false} />);
        expect(await screen.findByRole('button', { name: 'Tout (3)' })).toBeTruthy();
        expect(fetchMock.mock.calls[0][0]).toBe('/api/fleet-tracking/vehicles/75-188/history');
        const titles = screen.getAllByRole('listitem').map(li => li.textContent ?? '');
        expect(titles[0]).toMatch(/Sinistre roue arrière droite/);
        expect(titles[1]).toMatch(/Révision 105 000 km.*Terminée le 09\/01\/2026/);
        expect(titles[2]).toMatch(/Remplacement batterie.*14\/03\/2026 → 21\/03\/2026/);

        fireEvent.click(screen.getByRole('button', { name: 'En cours (1)' }));
        expect(screen.getAllByRole('listitem')).toHaveLength(1);
        fireEvent.click(screen.getByRole('button', { name: 'Clos / terminé (2)' }));
        expect(screen.getAllByRole('listitem')).toHaveLength(2);

        fireEvent.click(screen.getByRole('button', { name: 'Consulter le dossier Remplacement batterie' }));
        expect(push).toHaveBeenCalledWith('/vehicles?vue=suivi&onglet=dossiers&dossier=d-2');
    });

    it('« + Dossier pour ce véhicule » : véhicule imposé, création puis ouverture du dossier', async () => {
        render(<VehicleFleetHistory vehicleName="75-188" userRoles={['ADMIN']} isDtView={false} />);
        fireEvent.click(await screen.findByRole('button', { name: 'Dossier pour ce véhicule' }));
        expect((screen.getByLabelText('Véhicule *') as HTMLInputElement).value).toBe('75-188');
        fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ success: true, id: 'd-new' }), { status: 201 }));
        fireEvent.change(screen.getByLabelText('Titre *'), { target: { value: 'Bruit de freinage' } });
        fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
        await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/vehicles?vue=suivi&onglet=dossiers&dossier=d-new'));
        const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
        expect(url).toBe('/api/fleet-tracking/dossiers');
        expect(JSON.parse(String(init.body))).toMatchObject({ title: 'Bruit de freinage', vehicleId: 'veh-a' });
    });

    it('API refusée (véhicule d\'une autre UL) : section masquée', async () => {
        fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ error: 'x' }), { status: 403 }));
        const { container } = render(<VehicleFleetHistory vehicleName="75-150" userRoles={['ADMIN']} isDtView={false} />);
        await vi.waitFor(() => expect(container.textContent).toBe(''));
    });

    it('panne serveur (500) ou réseau : message dans la section, pas de masquage', async () => {
        fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ error: 'Erreur serveur' }), { status: 500 }));
        render(<VehicleFleetHistory vehicleName="75-188" userRoles={['ADMIN']} isDtView={false} />);
        expect((await screen.findByRole('alert')).textContent).toBe('Erreur serveur');
        expect(screen.getByText('Suivi technique')).toBeTruthy();
    });

    it('erreur réseau : message générique', async () => {
        fetchMock.mockImplementationOnce(async () => { throw new TypeError('offline'); });
        vi.spyOn(console, 'error').mockImplementation(() => {});
        render(<VehicleFleetHistory vehicleName="75-188" userRoles={['ADMIN']} isDtView={false} />);
        expect((await screen.findByRole('alert')).textContent).toMatch(/impossible/);
    });

    it('changement de véhicule : l\'état est remis à zéro puis relu', async () => {
        fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ error: 'x' }), { status: 403 }));
        const { container, rerender } = render(<VehicleFleetHistory vehicleName="75-150" userRoles={['ADMIN']} isDtView={false} />);
        await vi.waitFor(() => expect(container.textContent).toBe(''));
        rerender(<VehicleFleetHistory vehicleName="75-188" userRoles={['ADMIN']} isDtView={false} />);
        expect(await screen.findByRole('button', { name: 'Tout (3)' })).toBeTruthy();
        expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/api/fleet-tracking/vehicles/75-188/history');
    });
});
