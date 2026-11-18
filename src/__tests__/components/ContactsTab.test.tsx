/**
 * Tests RTL — suivi technique, onglet « Contacts » : les deux sections, la lecture
 * seule des contacts proposés par d'autres UL, la bascule de partage et l'export.
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ContactsTab from '@/components/fleetTracking/ContactsTab';
import type { FleetContact } from '@/lib/fleetTracking/contacts';

const base = {
    phones: [{ label: 'Atelier', number: '01 47 39 00 00' }],
    email: null, address: null, notes: null, updatedAt: '2026-11-03T10:00:00.000Z',
};
const OWN: FleetContact = { ...base, id: 'own-1', ulId: 'ul-a', name: 'Garage Renault Clichy', category: 'GARAGE', shared: false };
const SHARED: FleetContact = { ...base, id: 'b-1', ulId: 'ul-b', name: 'Assureur flotte', category: 'ASSURANCE', shared: true, ulName: 'Paris XV' };

let fetchMock: ReturnType<typeof vi.fn>;

function mockApi(list: { own: FleetContact[]; shared: FleetContact[] }, patchStatus = 200, vcardStatus = 200) {
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/vcard')) {
            return vcardStatus === 200
                ? new Response('BEGIN:VCARD\r\nEND:VCARD\r\n', { status: 200, headers: { 'Content-Disposition': 'attachment; filename="Prestataires_Paris.vcf"' } })
                : new Response(JSON.stringify({ error: 'Export refusé' }), { status: vcardStatus });
        }
        if (init?.method === 'PATCH') {
            return new Response(JSON.stringify(patchStatus === 200 ? { success: true } : { error: 'Refusé' }), { status: patchStatus });
        }
        return new Response(JSON.stringify(list), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
}

beforeEach(() => mockApi({ own: [OWN], shared: [SHARED] }));
afterEach(() => vi.restoreAllMocks());

describe('ContactsTab', () => {
    it('affiche les contacts de l\'UL et les prestataires proposés, avec la pastille d\'UL', async () => {
        render(<ContactsTab ulName="Paris XVIII" />);
        expect(await screen.findByText('Garage Renault Clichy')).toBeTruthy();
        expect(screen.getByText(/Contacts de l.UL Paris XVIII/)).toBeTruthy();
        const sharedSection = screen.getByRole('region', { name: /proposés par d.autres UL/ });
        expect(within(sharedSection).getByText('Assureur flotte')).toBeTruthy();
        expect(within(sharedSection).getByText(/Proposé par l.UL Paris XV/)).toBeTruthy();
    });

    it('un contact proposé par une autre UL n\'offre aucune action d\'édition', async () => {
        render(<ContactsTab />);
        const card = await screen.findByRole('article', { name: 'Assureur flotte' });
        expect(within(card).queryByRole('button')).toBeNull();
        expect(within(card).queryByRole('switch')).toBeNull();
        expect(within(card).getByLabelText('Lecture seule')).toBeTruthy();
        // Le téléphone reste composable.
        expect(within(card).getByRole('link', { name: '01 47 39 00 00' }).getAttribute('href')).toBe('tel:0147390000');
    });

    it('la bascule de partage envoie un PATCH { shared } sur le contact de l\'UL', async () => {
        render(<ContactsTab />);
        const card = await screen.findByRole('article', { name: 'Garage Renault Clichy' });
        const toggle = within(card).getByRole('switch') as HTMLInputElement;
        expect(toggle.checked).toBe(false);
        fireEvent.click(toggle);

        await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH')).toBe(true));
        const [url, init] = fetchMock.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method === 'PATCH') as [string, RequestInit];
        expect(url).toBe('/api/fleet-tracking/contacts/own-1');
        expect(JSON.parse(String(init.body))).toEqual({ shared: true });
        expect(toggle.checked).toBe(true);
    });

    it('un partage refusé revient à son état et affiche le message', async () => {
        mockApi({ own: [OWN], shared: [] }, 403);
        render(<ContactsTab />);
        const card = await screen.findByRole('article', { name: 'Garage Renault Clichy' });
        const toggle = within(card).getByRole('switch') as HTMLInputElement;
        fireEvent.click(toggle);
        expect((await screen.findByRole('alert')).textContent).toBe('Refusé');
        expect(toggle.checked).toBe(false);
    });

    it('masque la section des prestataires proposés quand elle est vide', async () => {
        mockApi({ own: [OWN], shared: [] });
        render(<ContactsTab />);
        await screen.findByText('Garage Renault Clichy');
        expect(screen.queryByText(/proposés par d.autres UL/)).toBeNull();
    });

    it('filtre par catégorie, et le compteur suit le filtre', async () => {
        render(<ContactsTab />);
        await screen.findByText('Garage Renault Clichy');
        expect(screen.getByText(/Contacts de l.UL/).textContent).toContain('· 1');
        fireEvent.click(screen.getByRole('button', { name: 'Assurance' }));
        expect(screen.queryByText('Garage Renault Clichy')).toBeNull();
        expect(screen.getByText('Assureur flotte')).toBeTruthy();
        expect(screen.getByText(/Contacts de l.UL/).textContent).toContain('· 0');
    });

    it('l\'export télécharge le .vcf sur une réponse 200', async () => {
        const createUrl = vi.fn(() => 'blob:x');
        Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: vi.fn() });
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
        render(<ContactsTab />);
        await screen.findByText('Garage Renault Clichy');
        fireEvent.click(screen.getByRole('button', { name: /Exporter vers le téléphone/ }));
        await waitFor(() => expect(click).toHaveBeenCalled());
        expect(createUrl).toHaveBeenCalled();
        expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('Prestataires_Paris.vcf');
        expect(fetchMock.mock.calls.some(([url]) => url === '/api/fleet-tracking/contacts/vcard')).toBe(true);
    });

    it('l\'export en échec affiche le message, sans téléchargement', async () => {
        mockApi({ own: [OWN], shared: [] }, 200, 403);
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
        render(<ContactsTab />);
        await screen.findByText('Garage Renault Clichy');
        fireEvent.click(screen.getByRole('button', { name: /Exporter vers le téléphone/ }));
        expect((await screen.findByRole('alert')).textContent).toBe('Export refusé');
        expect(click).not.toHaveBeenCalled();
    });

    it('export désactivé quand il n\'y a aucun contact', async () => {
        mockApi({ own: [], shared: [] });
        render(<ContactsTab />);
        expect(await screen.findByText(/Aucun contact pour/)).toBeTruthy();
        expect((screen.getByRole('button', { name: /Exporter vers le téléphone/ }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('en erreur de chargement, pas de message « Aucun contact »', async () => {
        fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: 'Interdit' }), { status: 403 }));
        global.fetch = fetchMock as unknown as typeof fetch;
        render(<ContactsTab />);
        expect((await screen.findByRole('alert')).textContent).toBe('Interdit');
        expect(screen.queryByText(/Aucun contact pour/)).toBeNull();
    });

    it('l\'interrupteur est désactivé tant que le PATCH est en cours', async () => {
        let release: (r: Response) => void = () => undefined;
        fetchMock = vi.fn((_url: string, init?: RequestInit) => init?.method === 'PATCH'
            ? new Promise<Response>(resolve => { release = resolve; })
            : Promise.resolve(new Response(JSON.stringify({ own: [OWN], shared: [] }), { status: 200 })));
        global.fetch = fetchMock as unknown as typeof fetch;
        render(<ContactsTab />);
        const toggle = within(await screen.findByRole('article', { name: 'Garage Renault Clichy' })).getByRole('switch') as HTMLInputElement;
        fireEvent.click(toggle);
        await waitFor(() => expect(toggle.disabled).toBe(true));
        fireEvent.click(toggle);
        expect(fetchMock.mock.calls.filter(([, i]) => (i as RequestInit | undefined)?.method === 'PATCH')).toHaveLength(1);
        release(new Response(JSON.stringify({ success: true }), { status: 200 }));
        await waitFor(() => expect(toggle.disabled).toBe(false));
        expect(toggle.checked).toBe(true);
    });

    it('ouvre la modale de création avec « + Contact »', async () => {
        render(<ContactsTab />);
        await screen.findByText('Garage Renault Clichy');
        fireEvent.click(screen.getByRole('button', { name: /Contact$/ }));
        expect(screen.getByRole('dialog', { name: 'Nouveau contact' })).toBeTruthy();
    });
});
