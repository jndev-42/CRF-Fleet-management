/**
 * Tests d'intégration — suivi technique, contacts prestataires :
 *   GET/POST /api/fleet-tracking/contacts
 *   PATCH/DELETE /api/fleet-tracking/contacts/[id]
 *   GET /api/fleet-tracking/contacts/vcard
 *
 * `canManageVehicles`, cloisonné à l'UL de session ; un contact partagé est lisible
 * et exportable par toutes les UL mais modifiable par son UL seulement.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { GET as listContacts, POST as postContact } from '@/app/api/fleet-tracking/contacts/route';
import { PATCH as patchContact, DELETE as deleteContact } from '@/app/api/fleet-tracking/contacts/[id]/route';
import { GET as exportVCard } from '@/app/api/fleet-tracking/contacts/vcard/route';
import { auth } from '@/auth';
import { db, seedUniteLocale } from './setup';

const mockedAuth = vi.mocked(auth);

const session = (roles: string[], ulId = 'ul-a', id = 'u-x') =>
    ({ user: { id, email: `${id}@test.com`, name: id, ulId, roles } }) as never;

const RESP_A = session(['RESP_VEHICULE'], 'ul-a', 'u-resp-a');
const RESP_B = session(['RESP_VEHICULE'], 'ul-b', 'u-resp-b');
const ADMIN_A = session(['ADMIN'], 'ul-a', 'u-admin-a');
const SUPER_A = session(['SUPER_ADMIN'], 'ul-a', 'u-super');

const URL_BASE = 'http://localhost/api/fleet-tracking/contacts';

function req(method: string, body?: unknown, url = URL_BASE): Request {
    return new Request(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
}
const withId = (id: string) => ({ params: Promise.resolve({ id }) });

async function seedContact(o: { id: string; ulId: string; name: string; shared?: boolean; category?: string }) {
    await db.execute({
        sql: `INSERT INTO "FleetContact" (id, ulId, name, category, phones, email, shared, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, '2026-11-01T10:00:00.000Z', '2026-11-01T10:00:00.000Z')`,
        args: [o.id, o.ulId, o.name, o.category ?? 'GARAGE', JSON.stringify([{ label: 'Atelier', number: '01 02 03 04 05' }]), `${o.id}@exemple.fr`, o.shared ? 1 : 0],
    });
}

async function row(id: string) {
    return (await db.execute({ sql: `SELECT * FROM "FleetContact" WHERE id = ?`, args: [id] })).rows[0];
}

const VALID = {
    name: 'Garage Renault Clichy',
    category: 'GARAGE',
    phones: [{ label: 'Atelier', number: '01 47 39 00 00' }],
    email: 'atelier@exemple.fr',
};

beforeEach(async () => {
    mockedAuth.mockReset();
    await seedUniteLocale({ id: 'ul-a', name: 'Paris 18', slug: 'paris-18' });
    await seedUniteLocale({ id: 'ul-b', name: 'Paris 15', slug: 'paris-15' });
    await seedContact({ id: 'a-shared', ulId: 'ul-a', name: 'Zeta garage', shared: true });
    await seedContact({ id: 'a-private', ulId: 'ul-a', name: 'Alpha carrosserie', category: 'CARROSSERIE' });
    await seedContact({ id: 'b-shared', ulId: 'ul-b', name: 'Assureur flotte', shared: true, category: 'ASSURANCE' });
    await seedContact({ id: 'b-private', ulId: 'ul-b', name: 'Garage privé B' });
});

describe('accès', () => {
    it('401 sans session sur toutes les routes', async () => {
        mockedAuth.mockResolvedValue(null as never);
        expect((await listContacts()).status).toBe(401);
        expect((await postContact(req('POST', VALID))).status).toBe(401);
        expect((await patchContact(req('PATCH', { shared: true }), withId('a-private'))).status).toBe(401);
        expect((await deleteContact(req('DELETE'), withId('a-private'))).status).toBe(401);
        expect((await exportVCard()).status).toBe(401);
    });

    it.each([['CHVL'], ['INACTIF'], ['CADRE']])('403 pour %s sur toutes les routes', async (role) => {
        mockedAuth.mockResolvedValue(session([role]));
        expect((await listContacts()).status).toBe(403);
        expect((await postContact(req('POST', VALID))).status).toBe(403);
        expect((await patchContact(req('PATCH', { shared: true }), withId('a-private'))).status).toBe(403);
        expect((await deleteContact(req('DELETE'), withId('a-private'))).status).toBe(403);
        expect((await exportVCard()).status).toBe(403);
    });

    it('403 pour un RESP_VEHICULE également INACTIF', async () => {
        mockedAuth.mockResolvedValue(session(['RESP_VEHICULE', 'INACTIF']));
        expect((await listContacts()).status).toBe(403);
    });

    it('400 sans UL active', async () => {
        mockedAuth.mockResolvedValue(session(['ADMIN'], 'default'));
        expect((await listContacts()).status).toBe(400);
        expect((await postContact(req('POST', VALID))).status).toBe(400);
    });
});

describe('GET /api/fleet-tracking/contacts', () => {
    it('own = contacts de l\'UL ; shared = partagés des autres UL avec ulName', async () => {
        mockedAuth.mockResolvedValue(RESP_A);
        const res = await listContacts();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.own.map((c: { id: string }) => c.id)).toEqual(['a-private', 'a-shared']);
        expect(body.shared).toHaveLength(1);
        expect(body.shared[0]).toMatchObject({ id: 'b-shared', ulName: 'Paris 15', shared: true, category: 'ASSURANCE' });
        expect(body.shared[0].phones).toEqual([{ label: 'Atelier', number: '01 02 03 04 05' }]);
    });

    it('ignore les contacts partagés d\'une UL supprimée', async () => {
        await seedContact({ id: 'ghost', ulId: 'ul-disparue', name: 'Orphelin', shared: true });
        mockedAuth.mockResolvedValue(RESP_A);
        const body = await (await listContacts()).json();
        expect(body.shared.map((c: { id: string }) => c.id)).toEqual(['b-shared']);
    });

    it('SUPER_ADMIN de l\'UL A voit comme un responsable de A', async () => {
        mockedAuth.mockResolvedValue(SUPER_A);
        const body = await (await listContacts()).json();
        expect(body.own).toHaveLength(2);
        expect(body.shared.map((c: { id: string }) => c.id)).toEqual(['b-shared']);
    });

    it('un partage retiré disparaît de la liste et de l\'export de l\'autre UL', async () => {
        mockedAuth.mockResolvedValue(RESP_B);
        expect((await patchContact(req('PATCH', { shared: false }), withId('b-shared'))).status).toBe(200);

        mockedAuth.mockResolvedValue(RESP_A);
        expect((await (await listContacts()).json()).shared).toEqual([]);
        expect(await (await exportVCard()).text()).not.toContain('Assureur flotte');
    });
});

describe('POST /api/fleet-tracking/contacts', () => {
    it('201 : contact créé dans l\'UL de session, non partagé par défaut', async () => {
        mockedAuth.mockResolvedValue(ADMIN_A);
        const res = await postContact(req('POST', { ...VALID, address: '  ', notes: 'Atelier VL' }));
        expect(res.status).toBe(201);
        const { id } = await res.json();
        const r = await row(id);
        expect(r.ulId).toBe('ul-a');
        expect(r.shared).toBe(0);
        expect(r.address).toBeNull();
        expect(r.notes).toBe('Atelier VL');
        expect(r.createdBy).toBe('u-admin-a');
        expect(JSON.parse(String(r.phones))).toEqual(VALID.phones);
    });

    it.each([
        ['sans téléphone', { ...VALID, phones: [] }],
        ['catégorie inconnue', { ...VALID, category: 'BOULANGERIE' }],
        ['champ inconnu', { ...VALID, ulId: 'ul-b' }],
        ['nom vide', { ...VALID, name: '  ' }],
        ['nom trop long', { ...VALID, name: 'x'.repeat(121) }],
        ['e-mail invalide', { ...VALID, email: 'pas-un-mail' }],
        ['6 téléphones', { ...VALID, phones: Array.from({ length: 6 }, () => ({ label: '', number: '0102' })) }],
        ['numéro sans chiffre', { ...VALID, phones: [{ label: 'x', number: '+' }] }],
        ['notes trop longues', { ...VALID, notes: 'x'.repeat(501) }],
    ])('400 %s', async (_label, body) => {
        mockedAuth.mockResolvedValue(RESP_A);
        const res = await postContact(req('POST', body));
        expect(res.status).toBe(400);
        expect(typeof (await res.json()).error).toBe('string');
    });

    it('400 sur un corps illisible', async () => {
        mockedAuth.mockResolvedValue(RESP_A);
        const bad = new Request(URL_BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
        expect((await postContact(bad)).status).toBe(400);
    });
});

describe('PATCH/DELETE /api/fleet-tracking/contacts/[id]', () => {
    it('PATCH partiel par l\'UL propriétaire (partage compris), sans effacer le reste', async () => {
        mockedAuth.mockResolvedValue(RESP_A);
        const res = await patchContact(req('PATCH', { shared: true, notes: 'Rapide' }), withId('a-private'));
        expect(res.status).toBe(200);
        const r = await row('a-private');
        expect(r.shared).toBe(1);
        expect(r.notes).toBe('Rapide');
        expect(r.email).toBe('a-private@exemple.fr');
        expect(r.name).toBe('Alpha carrosserie');
        expect(r.updatedAt).not.toBe('2026-11-01T10:00:00.000Z');
    });

    it('400 sur un PATCH vide ou avec un champ inconnu', async () => {
        mockedAuth.mockResolvedValue(RESP_A);
        expect((await patchContact(req('PATCH', {}), withId('a-private'))).status).toBe(400);
        expect((await patchContact(req('PATCH', { ulId: 'ul-b' }), withId('a-private'))).status).toBe(400);
        expect((await patchContact(req('PATCH', { phones: [] }), withId('a-private'))).status).toBe(400);
    });

    it.each([['b-shared'], ['b-private']])('403 sur un contact d\'une autre UL (%s)', async (id) => {
        mockedAuth.mockResolvedValue(RESP_A);
        expect((await patchContact(req('PATCH', { name: 'Piraté' }), withId(id))).status).toBe(403);
        expect((await deleteContact(req('DELETE'), withId(id))).status).toBe(403);
        expect((await row(id)).name).not.toBe('Piraté');
    });

    it('403 aussi pour un SUPER_ADMIN dont l\'UL active n\'est pas propriétaire', async () => {
        mockedAuth.mockResolvedValue(SUPER_A);
        expect((await patchContact(req('PATCH', { shared: false }), withId('b-shared'))).status).toBe(403);
        expect((await patchContact(req('PATCH', { shared: true }), withId('a-private'))).status).toBe(200);
    });

    it('404 sur un id inconnu', async () => {
        mockedAuth.mockResolvedValue(RESP_A);
        expect((await patchContact(req('PATCH', { shared: true }), withId('nope'))).status).toBe(404);
        expect((await deleteContact(req('DELETE'), withId('nope'))).status).toBe(404);
    });

    it('DELETE par l\'UL propriétaire', async () => {
        mockedAuth.mockResolvedValue(RESP_A);
        expect((await deleteContact(req('DELETE'), withId('a-shared'))).status).toBe(200);
        expect(await row('a-shared')).toBeUndefined();
    });
});

describe('GET /api/fleet-tracking/contacts/vcard', () => {
    it('text/vcard en pièce jointe : contacts de l\'UL puis partagés suffixés, échappement correct', async () => {
        await db.execute({
            sql: `UPDATE "FleetContact" SET name = ?, notes = ? WHERE id = 'a-private'`,
            args: ['Dupont, Fils; & Cie', 'Ligne 1\nLigne 2'],
        });
        mockedAuth.mockResolvedValue(RESP_A);
        const res = await exportVCard();
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('text/vcard; charset=utf-8');
        expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="Prestataires_Paris_18.vcf"');

        const text = await res.text();
        expect(text.match(/BEGIN:VCARD/g)).toHaveLength(3);
        expect(text).toContain('FN:Dupont\\, Fils\\; & Cie\r\n');
        expect(text).toContain('NOTE:Ligne 1\\nLigne 2\r\n');
        expect(text).toContain('FN:Assureur flotte (UL Paris 15)\r\n');
        expect(text).toContain('CATEGORIES:Assurance\r\n');
        expect(text).toContain('TEL;TYPE=WORK,VOICE:0102030405\r\n');
        expect(text).toContain('EMAIL;TYPE=INTERNET:b-shared@exemple.fr\r\n');
        expect(text).not.toContain('Garage privé B');
        // Contacts de l'UL d'abord, partagés ensuite.
        expect(text.indexOf('Zeta garage')).toBeLessThan(text.indexOf('Assureur flotte'));
    });
});
