/**
 * Tests RTL — suivi technique, onglet « Dossiers » : « Nouveau dossier » pendant un
 * filtre véhicule coche ce véhicule dans la modale (#176).
 */
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import DossiersTab from '@/components/fleetTracking/DossiersTab';

beforeEach(() => {
    global.fetch = vi.fn(async (url: string) => {
        if (url.startsWith('/api/fleet-tracking/link-targets')) {
            return new Response(JSON.stringify({ targets: [
                { type: 'VEHICLE', id: 'veh-a', label: '75-188', detail: null },
                { type: 'VEHICLE', id: 'veh-b', label: '75-186', detail: null },
            ] }), { status: 200 });
        }
        if (url.startsWith('/api/fleet-tracking/assignees')) return new Response(JSON.stringify({ assignees: [] }), { status: 200 });
        return new Response(JSON.stringify({ dossiers: [] }), { status: 200 });
    }) as unknown as typeof fetch;
});
afterEach(() => vi.restoreAllMocks());

const renderTab = (vehicle?: string) =>
    render(<DossiersTab openDossierId={null} onOpenDossier={vi.fn()} onChanged={vi.fn()} initialFilter={vehicle ? { vehicle } : undefined} />);

describe('DossiersTab', () => {
    it('« Nouveau dossier » avec le filtre véhicule : ce véhicule est coché d\'office', async () => {
        renderTab();
        await screen.findByRole('option', { name: '75-186' });
        fireEvent.change(screen.getByLabelText('Véhicule'), { target: { value: 'veh-b' } });
        fireEvent.click(screen.getByRole('button', { name: /Nouveau dossier/ }));
        const dialog = await screen.findByRole('dialog');
        expect((within(dialog).getByRole('checkbox', { name: /75-186/ }) as HTMLInputElement).checked).toBe(true);
        expect((within(dialog).getByRole('checkbox', { name: /75-188/ }) as HTMLInputElement).checked).toBe(false);
    });

    it('« Nouveau dossier » sans filtre : aucun véhicule coché', async () => {
        renderTab();
        await screen.findByRole('option', { name: '75-186' });
        fireEvent.click(screen.getByRole('button', { name: /Nouveau dossier/ }));
        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getAllByRole('checkbox').every(c => !(c as HTMLInputElement).checked)).toBe(true);
    });
});
