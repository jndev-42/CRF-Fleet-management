import { z } from 'zod';

/**
 * Contacts prestataires du suivi technique : catégories, schémas de validation,
 * type exposé par l'API et générateur vCard.
 *
 * Module pur (aucun accès base, aucune session) : importé à la fois par les routes
 * et par les composants client (libellés, types).
 */

export const CONTACT_CATEGORIES = ['GARAGE', 'CARROSSERIE', 'ASSURANCE', 'DEPANNAGE', 'AUTRE'] as const;
export type ContactCategory = typeof CONTACT_CATEGORIES[number];

export const CONTACT_CATEGORY_LABELS: Record<ContactCategory, string> = {
    GARAGE: 'Garage',
    CARROSSERIE: 'Carrosserie',
    ASSURANCE: 'Assurance',
    DEPANNAGE: 'Dépannage',
    AUTRE: 'Autre',
};

export const MAX_CONTACT_NAME = 120;
export const MAX_PHONE_LABEL = 40;
export const MAX_PHONE_NUMBER = 30;
export const MAX_PHONES = 5;
export const MAX_CONTACT_TEXT = 500;

export interface ContactPhone {
    label: string;
    number: string;
}

/** Contact tel que renvoyé par l'API. `ulName` n'est renseigné que pour un contact partagé par une autre UL. */
export interface FleetContact {
    id: string;
    ulId: string;
    name: string;
    category: ContactCategory;
    phones: ContactPhone[];
    email: string | null;
    address: string | null;
    notes: string | null;
    shared: boolean;
    updatedAt: string;
    ulName?: string;
}

const phoneSchema = z.object({
    label: z.string().trim().max(MAX_PHONE_LABEL).default(''),
    number: z.string().trim().min(1, 'Numéro requis').max(MAX_PHONE_NUMBER)
        .regex(/^\+?[\d\s().-]+$/, 'Numéro invalide')
        .refine(v => /\d/.test(v), 'Numéro invalide'),
}).strict();

/** Vide → `null` ; absent reste absent (une modification partielle ne l'efface pas). */
const emptyToNull = (v: string | null | undefined) => (v === undefined ? undefined : v || null);

/** Champ texte facultatif. */
const optionalText = (max: number) => z.string().trim().max(max)
    .nullable().optional()
    .transform(emptyToNull);

const contactFields = {
    name: z.string().trim().min(1, 'Nom requis').max(MAX_CONTACT_NAME),
    category: z.enum(CONTACT_CATEGORIES),
    phones: z.array(phoneSchema).min(1, 'Au moins un téléphone').max(MAX_PHONES),
    email: z.union([z.literal(''), z.string().trim().max(254).email('E-mail invalide')])
        .nullable().optional()
        .transform(emptyToNull),
    address: optionalText(MAX_CONTACT_TEXT),
    notes: optionalText(MAX_CONTACT_TEXT),
    shared: z.boolean(),
};

export const createContactSchema = z.object({
    ...contactFields,
    shared: contactFields.shared.default(false),
}).strict();

export const updateContactSchema = z.object(contactFields).partial().strict()
    .refine(v => Object.values(v).some(x => x !== undefined), 'Aucune modification');

export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;

/** Lit la colonne JSON `phones` ; une valeur illisible donne une liste vide. */
export function parsePhones(raw: unknown): ContactPhone[] {
    if (typeof raw !== 'string') return [];
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((p): p is { label?: unknown; number: unknown } => !!p && typeof p === 'object' && 'number' in p)
            .map(p => ({ label: typeof p.label === 'string' ? p.label : '', number: String(p.number) }));
    } catch {
        return [];
    }
}

// ── vCard 3.0 (RFC 2426) ─────────────────────────────────────────

/** Échappe une valeur texte vCard : `\`, `,`, `;` et retours ligne (RFC 2426 §4). */
export function escapeVCardText(value: string): string {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/,/g, '\\,')
        .replace(/;/g, '\\;')
        .replace(/\r\n|\r|\n/g, '\\n');
}

/** Numéro composable : chiffres et `+` uniquement. */
export function cleanPhoneNumber(number: string): string {
    return number.replace(/[^\d+]/g, '');
}

function contactToVCard(contact: FleetContact, suffix: string): string {
    const name = contact.name + suffix;
    const lines = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        // UID stable : un nouvel import met à jour le contact au lieu de le dupliquer.
        `UID:${escapeVCardText(contact.id)}`,
        `REV:${escapeVCardText(contact.updatedAt)}`,
        `FN:${escapeVCardText(name)}`,
        // Prestataire = organisation, pas une personne : N vide, nom dans ORG.
        'N:;;;;',
        `ORG:${escapeVCardText(name)}`,
        `CATEGORIES:${escapeVCardText(CONTACT_CATEGORY_LABELS[contact.category] ?? contact.category)}`,
    ];
    for (const phone of contact.phones) {
        const number = cleanPhoneNumber(phone.number);
        if (number) lines.push(`TEL;TYPE=WORK,VOICE:${number}`);
    }
    if (contact.email) lines.push(`EMAIL;TYPE=INTERNET:${escapeVCardText(contact.email)}`);
    if (contact.address) lines.push(`ADR;TYPE=WORK:;;${escapeVCardText(contact.address)};;;;`);
    if (contact.notes) lines.push(`NOTE:${escapeVCardText(contact.notes)}`);
    lines.push('END:VCARD');
    return lines.join('\r\n');
}

/**
 * Fichier `.vcf` : contacts de l'UL d'abord, puis contacts partagés par d'autres UL,
 * ces derniers suffixés « (UL <nom>) » dans le nom pour les reconnaître dans le téléphone.
 */
export function buildContactsVCard(own: FleetContact[], shared: FleetContact[]): string {
    const cards = [
        ...own.map(c => contactToVCard(c, '')),
        ...shared.map(c => contactToVCard(c, c.ulName ? ` (UL ${c.ulName})` : '')),
    ];
    return cards.length ? `${cards.join('\r\n')}\r\n` : '';
}

/** Nom de fichier ASCII sûr pour `Content-Disposition` : `Prestataires_<UL>.vcf`. */
export function contactsVCardFileName(ulName: string | null | undefined): string {
    const slug = (ulName ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Za-z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return `Prestataires_${slug || 'UL'}.vcf`;
}
