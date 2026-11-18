import { CONTACT_CATEGORY_LABELS, type ContactCategory, type FleetContact } from '@/lib/fleetTracking/contacts';

export type CategoryFilter = 'ALL' | ContactCategory;

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const digitsOnly = (s: string) => s.replace(/\D/g, '');

/**
 * Filtre par catégorie et par recherche (nom, catégorie, adresse, notes, e-mail,
 * UL), sans accents ni casse ; une saisie de forme téléphone se compare aux numéros
 * chiffres seuls (« 0147 39 » trouve « 01 47 39 00 00 »).
 */
export function filterContacts(list: FleetContact[], query: string, category: CategoryFilter): FleetContact[] {
    const q = normalize(query.trim());
    // Seule une saisie de forme téléphone est comparée aux numéros (« Paris 15 » ne doit pas trouver « …15… »).
    const qDigits = /^[\d\s+().-]+$/.test(query.trim()) ? digitsOnly(query) : '';
    return list.filter(c => {
        if (category !== 'ALL' && c.category !== category) return false;
        if (!q) return true;
        const haystack = [c.name, CONTACT_CATEGORY_LABELS[c.category], c.address ?? '', c.notes ?? '', c.email ?? '', c.ulName ?? ''];
        if (haystack.some(v => normalize(v).includes(q))) return true;
        return qDigits.length > 0 && c.phones.some(p => digitsOnly(p.number).includes(qDigits));
    });
}
