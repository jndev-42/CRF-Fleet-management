/**
 * Titre de fiche d'une page du guide pratique.
 *
 * Deux sortes de pages portent un repère de fiche :
 *  - les pages de suite, avec un en-tête courant « <Chapitre> / <Sous-chapitre> / <Code> »
 *    suivi du bandeau de l'émetteur :
 *      « Urgences vitales / Perte de connaissance / IV.B.5 DUOS / Pole santé »
 *      « Conduite à tenir / Affections traumatiques / IV.D.2 DABE / Pole santé »
 *      « Conduite à tenir / Affections circonstancielles / IV-E-13 Version 1.1.1 DUS / Mai 2014 ¢ p.6 »
 *  - la page de couverture de chaque fiche, dont le cartouche (lu en fin de page
 *    par pdf.js) donne le NOM de la fiche juste avant « <Chapitre> Fiche <Code> » :
 *      « Hémorragie externe » / « Urgences vitales Fiche IV – B - 2 »
 * Les pages d'ouverture portent à la place « FORMATION AUX PREMIERS SECOURS… /2 ».
 *
 * Le titre d'une couverture est « <Nom> — <Chapitre> · <Code> » ; `applyFicheNames`
 * le recopie ensuite sur les pages de suite de la même fiche.
 */

/** Se termine par un code de fiche : IV.B.5, IV-E-13, V-C-8… */
const FICHE_CODE_END = /\b([IVX]+[.-][A-Z](?:[.-]\d+)*)$/;
const RUNNING_HEADER = /^FORMATION AUX PREMIERS SECOURS\b.*\/\s*\d+\s*$/i;
/** Cartouche de couverture : « Urgences vitales Fiche IV – B - 2 ». */
const COVER_LINE = /^(.+?)\s+Fiche\s+([IVX]+\s*[–-]\s*[A-Z](?:\s*[–-]\s*\d+)*)\s*$/;
const MAX_FICHE_NAME_LENGTH = 90;

/** Code de fiche normalisé : « IV – B - 2 », « IV-B-2 » et « IV.B.2 » donnent tous « IV.B.2 ». */
export function normalizeFicheCode(raw: string): string {
    return raw.replace(/\s+/g, '').replace(/[–-]/g, '.');
}

/** Le titre d'une ligne d'en-tête courant, ou `''` si la ligne n'en est pas un. */
function titleOfHeaderLine(line: string): string {
    const cleaned = line
        // Bandeau de l'émetteur, quel qu'il soit : « DUOS / Pole santé », « DABE / Pôle santé »…
        .replace(/\s+[A-Z]{2,6}\s*\/\s*P[oô]le sant[eé].*$/i, '')
        .replace(/\s+Version\s+\d.*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
    return cleaned.includes(' / ') && FICHE_CODE_END.test(cleaned) ? cleaned : '';
}

/** Titre de couverture « <Nom> — <Chapitre> · <Code> », ou `''` si la page n'en est pas une. */
function coverTitle(lines: string[]): string {
    for (let i = 1; i < lines.length; i++) {
        const match = COVER_LINE.exec(lines[i]);
        if (!match) continue;
        // Un nom sur deux lignes (« Arrêt cardiaque de l'enfant » / « et du nourrisson ») :
        // une ligne qui commence en minuscule continue la précédente.
        let name = lines[i - 1];
        if (i >= 2 && /^\p{Ll}/u.test(name)) name = `${lines[i - 2]} ${name}`;
        if (name.length > MAX_FICHE_NAME_LENGTH || COVER_LINE.test(name)) continue;
        return `${name} — ${match[1].trim()} · ${normalizeFicheCode(match[2])}`;
    }
    return '';
}

export interface SplitPage {
    /** Titre de fiche, `''` si la page n'en porte pas. */
    title: string;
    /** Lignes de la page sans l'en-tête courant. */
    bodyLines: string[];
}

/** Sépare l'en-tête courant du contenu d'une page (lignes dans l'ordre de lecture). */
export function splitPageHeader(lines: string[]): SplitPage {
    const cleanLines = lines.map(l => l.trim()).filter(Boolean);
    const first = cleanLines[0];
    if (!first) return { title: '', bodyLines: [] };
    if (RUNNING_HEADER.test(first)) {
        // Sans l'en-tête courant : il ressemble à un nom de fiche et ne doit pas être pris pour tel.
        const rest = cleanLines.slice(1);
        return { title: coverTitle(rest), bodyLines: rest };
    }
    const title = titleOfHeaderLine(first);
    if (title) return { title, bodyLines: cleanLines.slice(1) };
    return { title: coverTitle(cleanLines), bodyLines: cleanLines };
}

/** Titre de fiche d'une page, `''` si absent. */
export function pageTitle(lines: string[]): string {
    return splitPageHeader(lines).title;
}

/** Code de fiche normalisé en fin de titre (« IV.B.2 »), ou `null`. */
function ficheCodeOf(title: string): string | null {
    const match = FICHE_CODE_END.exec(title);
    return match ? normalizeFicheCode(match[1]) : null;
}

/**
 * Donne aux pages de suite le titre de la couverture de leur fiche
 * (« Conduite à tenir / Urgences vitales / IV.B.2 » → « Hémorragie externe — Urgences vitales · IV.B.2 »).
 * Renvoie seulement les pages dont le titre change.
 */
export function applyFicheNames(pages: { page: number; title: string }[]): { page: number; title: string }[] {
    const covers = new Map<string, string>();
    for (const { title } of pages) {
        if (!title.includes(' — ')) continue;
        const code = ficheCodeOf(title);
        if (code && !covers.has(code)) covers.set(code, title);
    }
    const changed: { page: number; title: string }[] = [];
    for (const { page, title } of pages) {
        if (!title || title.includes(' — ')) continue;
        const code = ficheCodeOf(title);
        const cover = code ? covers.get(code) : undefined;
        if (cover) changed.push({ page, title: cover });
    }
    return changed;
}
