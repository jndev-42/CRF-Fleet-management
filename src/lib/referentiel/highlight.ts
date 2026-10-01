/**
 * Découpe un extrait de recherche sur ses marqueurs de surlignage.
 *
 * Le serveur encadre les termes trouvés de \u0002 … \u0003. On les transforme
 * en segments que React rend en `<mark>` : jamais de HTML injecté, donc rien
 * à échapper même si le texte du PDF contient des chevrons.
 */
export interface HighlightSegment {
    text: string;
    mark: boolean;
}

const START = '\u0002';
const END = '\u0003';

export function splitHighlight(excerpt: string): HighlightSegment[] {
    const segments: HighlightSegment[] = [];
    let rest = excerpt;
    while (rest.length > 0) {
        const start = rest.indexOf(START);
        if (start === -1) {
            segments.push({ text: rest, mark: false });
            break;
        }
        if (start > 0) segments.push({ text: rest.slice(0, start), mark: false });
        const end = rest.indexOf(END, start + 1);
        if (end === -1) {
            // Marqueur ouvrant sans fermant : on garde le texte, sans surlignage.
            segments.push({ text: rest.slice(start + 1), mark: false });
            break;
        }
        const marked = rest.slice(start + 1, end);
        if (marked) segments.push({ text: marked, mark: true });
        rest = rest.slice(end + 1);
    }
    return segments;
}
