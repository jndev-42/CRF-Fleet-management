/**
 * Tests RTL — modale de contact prestataire (`ContactFormModal`) : création,
 * modification, suppression, erreurs serveur et client, fermeture et focus.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ContactFormModal from '@/components/fleetTracking/ContactFormModal';
import type { FleetContact } from '@/lib/fleetTracking/contacts';

const CONTACT: FleetContact = {
    id: 'c-1', ulId: 'ul-a', name: 'MVR Évolution', category: 'CARROSSERIE',
    phones: [{ label: 'Gérant', number: '06 12 34 56 78' }],
    email: 'gerant@mvr.fr', address: 'Saint-Ouen', notes: null, shared: true, updatedAt: '2026-11-01T00:00:00.000Z',
};

let fetchMock: ReturnType<typeof vi.fn>;

function respond(status: number, body: unknown = { success: true }) {
    fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
    global.fetch = fetchMock as unknown as typeof fetch;
}

function lastCall(): [string, RequestInit] {
    return fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit];
}

function setup(contact: FleetContact | null = null) {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(<ContactFormModal contact={contact} onClose={onClose} onSaved={onSaved} />);
    return { onClose, onSaved };
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

beforeEach(() => respond(201, { success: true, id: 'new' }));
afterEach(() => vi.restoreAllMocks());

describe('ContactFormModal — création', () => {
    it('place le focus sur le champ Nom', () => {
        setup();
        expect(document.activeElement).toBe(screen.getByLabelText('Nom *'));
    });

    it('POST avec un corps exact : lignes vides retirées, champs vides à null, partage inclus', async () => {
        const { onSaved } = setup();
        fireEvent.change(screen.getByLabelText('Nom *'), { target: { value: '  Garage Renault ' } });
        fireEvent.change(screen.getByLabelText('Catégorie *'), { target: { value: 'GARAGE' } });
        fireEvent.change(screen.getByLabelText('Numéro 1'), { target: { value: ' 01 47 39 00 00 ' } });
        fireEvent.change(screen.getByLabelText('Libellé du numéro 1'), { target: { value: 'Atelier' } });
        fireEvent.click(screen.getByRole('button', { name: /Ajouter un numéro/ }));
        fireEvent.click(screen.getByLabelText(/Partager ce contact/));
        submit();

        await waitFor(() => expect(onSaved).toHaveBeenCalledWith());
        const [url, init] = lastCall();
        expect(url).toBe('/api/fleet-tracking/contacts');
        expect(init.method).toBe('POST');
        expect(JSON.parse(String(init.body))).toEqual({
            name: 'Garage Renault',
            category: 'GARAGE',
            phones: [{ label: 'Atelier', number: '01 47 39 00 00' }],
            email: null,
            address: null,
            notes: null,
            shared: true,
        });
    });

    it('affiche le { error } du serveur sans fermer', async () => {
        respond(400, { error: 'Données invalides : E-mail invalide' });
        const { onSaved } = setup();
        fireEvent.change(screen.getByLabelText('Nom *'), { target: { value: 'X' } });
        fireEvent.change(screen.getByLabelText('Numéro 1'), { target: { value: '0102' } });
        submit();
        expect((await screen.findByRole('alert')).textContent).toBe('Données invalides : E-mail invalide');
        expect(onSaved).not.toHaveBeenCalled();
    });

    it('refuse sans aucun numéro, sans appel réseau', () => {
        setup();
        fireEvent.change(screen.getByLabelText('Nom *'), { target: { value: 'X' } });
        fireEvent.submit(screen.getByLabelText('Nom *').closest('form') as HTMLFormElement);
        expect(screen.getByRole('alert').textContent).toBe('Au moins un téléphone est requis');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuse un libellé sans numéro', () => {
        setup();
        fireEvent.change(screen.getByLabelText('Nom *'), { target: { value: 'X' } });
        fireEvent.change(screen.getByLabelText('Numéro 1'), { target: { value: '0102' } });
        fireEvent.click(screen.getByRole('button', { name: /Ajouter un numéro/ }));
        fireEvent.change(screen.getByLabelText('Libellé du numéro 2'), { target: { value: 'Astreinte' } });
        submit();
        expect(screen.getByRole('alert').textContent).toBe('Numéro manquant pour le libellé « Astreinte »');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('Échap ferme, mais pas pendant l\'enregistrement', async () => {
        let release: (r: Response) => void = () => undefined;
        fetchMock = vi.fn(() => new Promise<Response>(resolve => { release = resolve; }));
        global.fetch = fetchMock as unknown as typeof fetch;
        const { onClose } = setup();
        fireEvent.change(screen.getByLabelText('Nom *'), { target: { value: 'X' } });
        fireEvent.change(screen.getByLabelText('Numéro 1'), { target: { value: '0102' } });
        submit();
        await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrement…' })).toBeTruthy());
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).not.toHaveBeenCalled();
        release(new Response(JSON.stringify({ error: 'Erreur serveur' }), { status: 500 }));
        expect((await screen.findByRole('alert')).textContent).toBe('Erreur serveur');
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
    });
});

describe('ContactFormModal — modification et suppression', () => {
    it('PATCH vers /contacts/<id> puis rechargement', async () => {
        respond(200, { success: true });
        const { onSaved } = setup(CONTACT);
        fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Rapide' } });
        submit();
        await waitFor(() => expect(onSaved).toHaveBeenCalledWith());
        const [url, init] = lastCall();
        expect(url).toBe('/api/fleet-tracking/contacts/c-1');
        expect(init.method).toBe('PATCH');
        expect(JSON.parse(String(init.body))).toMatchObject({ name: 'MVR Évolution', notes: 'Rapide', shared: true, email: 'gerant@mvr.fr' });
    });

    it('404 (supprimé ailleurs) : rechargement avec un message', async () => {
        respond(404, { error: 'Contact introuvable' });
        const { onSaved } = setup(CONTACT);
        submit();
        await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.stringMatching(/n.existe plus/)));
    });

    it('DELETE après confirmation', async () => {
        respond(200, { success: true });
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        const { onSaved } = setup(CONTACT);
        fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        const [url, init] = lastCall();
        expect(url).toBe('/api/fleet-tracking/contacts/c-1');
        expect(init.method).toBe('DELETE');
    });

    it('aucune suppression sans confirmation', () => {
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        setup(CONTACT);
        fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
