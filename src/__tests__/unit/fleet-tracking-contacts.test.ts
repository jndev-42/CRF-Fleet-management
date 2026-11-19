/**
 * Tests unitaires — contacts prestataires du suivi technique : échappement et
 * génération vCard 3.0, nom de fichier, lecture des téléphones, schémas Zod,
 * filtre client.
 */
import { describe, it, expect } from 'vitest';
import {
    buildContactsVCard,
    cleanPhoneNumber,
    contactsVCardFileName,
    createContactSchema,
    escapeVCardText,
    parsePhones,
    updateContactSchema,
    type FleetContact,
} from '@/lib/fleetTracking/contacts';
import { filterContacts } from '@/components/fleetTracking/filterContacts';

const contact = (o: Partial<FleetContact> = {}): FleetContact => ({
    id: 'c1',
    ulId: 'ul-a',
    name: 'Garage',
    category: 'GARAGE',
    phones: [{ label: 'Atelier', number: '01 47 39 00 00' }],
    email: null,
    address: null,
    notes: null,
    shared: false,
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...o,
});

describe('escapeVCardText', () => {
    it('échappe la barre oblique inverse en premier, puis virgule et point-virgule', () => {
        expect(escapeVCardText('a\\b,c;d')).toBe('a\\\\b\\,c\\;d');
    });
    it('remplace chaque forme de retour ligne par \\n', () => {
        expect(escapeVCardText('a\nb\r\nc\rd')).toBe('a\\nb\\nc\\nd');
    });
    it('laisse un texte simple intact', () => {
        expect(escapeVCardText('Dépannage Nord 24/7')).toBe('Dépannage Nord 24/7');
    });
});

describe('cleanPhoneNumber', () => {
    it('ne garde que les chiffres et le +', () => {
        expect(cleanPhoneNumber('+33 (0)1.47-39 00 00')).toBe('+330147390000');
    });
});

describe('buildContactsVCard', () => {
    it('produit une vCard 3.0 par contact, en CRLF, UL puis partagés suffixés', () => {
        const text = buildContactsVCard(
            [contact({ name: 'A; B', email: 'a@b.fr', address: '1 rue X, Paris', notes: 'n1\nn2' })],
            [contact({ id: 'c2', name: 'Assureur', category: 'ASSURANCE', ulName: 'Paris 15', shared: true })],
        );
        const cards = text.split('END:VCARD\r\n').filter(Boolean);
        expect(cards).toHaveLength(2);
        expect(cards[0]).toBe([
            'BEGIN:VCARD', 'VERSION:3.0', 'UID:c1', 'REV:2026-11-01T00:00:00.000Z',
            'FN:A\\; B', 'N:;;;;', 'ORG:A\\; B', 'CATEGORIES:Garage',
            'TEL;TYPE=WORK,VOICE:0147390000', 'EMAIL;TYPE=INTERNET:a@b.fr',
            'ADR;TYPE=WORK:;;1 rue X\\, Paris;;;;', 'NOTE:n1\\nn2', '',
        ].join('\r\n'));
        expect(cards[1]).toContain('FN:Assureur (UL Paris 15)\r\n');
        expect(cards[1]).toContain('ORG:Assureur (UL Paris 15)\r\n');
        expect(cards[1]).toContain('UID:c2\r\n');
        expect(cards[1]).toContain('CATEGORIES:Assurance\r\n');
        expect(text.endsWith('END:VCARD\r\n')).toBe(true);
    });

    it('un fichier vide quand aucun contact', () => {
        expect(buildContactsVCard([], [])).toBe('');
    });

    it('ignore un numéro vide après nettoyage', () => {
        const text = buildContactsVCard([contact({ phones: [{ label: '', number: '()' }] })], []);
        expect(text).not.toContain('TEL');
    });
});

describe('contactsVCardFileName', () => {
    it('nom ASCII sans accents ni espaces', () => {
        expect(contactsVCardFileName('Paris XVIII — Épinettes')).toBe('Prestataires_Paris_XVIII_Epinettes.vcf');
        expect(contactsVCardFileName(null)).toBe('Prestataires_UL.vcf');
    });
});

describe('parsePhones', () => {
    it('lit la colonne JSON et tolère une valeur illisible', () => {
        expect(parsePhones('[{"label":"A","number":"01"}]')).toEqual([{ label: 'A', number: '01' }]);
        expect(parsePhones('{oops')).toEqual([]);
        expect(parsePhones(null)).toEqual([]);
    });
});

describe('schémas', () => {
    it('création : partage faux par défaut, champs vides → null', () => {
        const r = createContactSchema.parse({ name: ' X ', category: 'AUTRE', phones: [{ number: '01' }], email: '' });
        expect(r).toMatchObject({ name: 'X', shared: false, email: null });
    });
    it('modification partielle : un champ absent reste absent', () => {
        expect(updateContactSchema.parse({ shared: true })).toEqual({ shared: true });
        expect(updateContactSchema.safeParse({}).success).toBe(false);
    });
});

describe('filterContacts', () => {
    const list = [
        contact({ id: '1', name: 'Garage Renault', category: 'GARAGE' }),
        contact({ id: '2', name: 'MVR Évolution', category: 'CARROSSERIE', address: 'Saint-Ouen', email: 'gerant@mvr.fr', phones: [{ label: '', number: '06 12 34 56 78' }] }),
    ];
    it('trouve par e-mail et par numéro comparé chiffres seuls', () => {
        expect(filterContacts(list, 'gerant@', 'ALL').map(c => c.id)).toEqual(['2']);
        expect(filterContacts(list, '0612 34', 'ALL').map(c => c.id)).toEqual(['2']);
        expect(filterContacts(list, '01.47.39', 'ALL').map(c => c.id)).toEqual(['1']);
        // Une saisie textuelle contenant des chiffres n'est pas comparée aux numéros.
        expect(filterContacts(list, 'garage 06', 'ALL')).toEqual([]);
    });
    it('filtre par catégorie et par recherche sans accents', () => {
        expect(filterContacts(list, '', 'CARROSSERIE').map(c => c.id)).toEqual(['2']);
        expect(filterContacts(list, 'evolution', 'ALL').map(c => c.id)).toEqual(['2']);
        expect(filterContacts(list, 'saint', 'ALL').map(c => c.id)).toEqual(['2']);
        expect(filterContacts(list, 'garage', 'ALL').map(c => c.id)).toEqual(['1']);
    });
});
