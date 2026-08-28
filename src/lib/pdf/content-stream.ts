/**
 * Lecture du flux de contenu d'un PDF.
 *
 * Sert à MESURER la mise en page rendue plutôt qu'à la supposer : les
 * rectangles des widgets de signature (`signature-layout.ts`) sont relevés ici,
 * puis figés par un test. Un widget mal placé est verrouillé par DocMDP dès le
 * premier scellement et n'est plus corrigeable — la mesure ne peut donc pas
 * reposer sur une estimation à l'œil.
 */

import zlib from 'zlib';

type Matrice = [number, number, number, number, number, number];

const IDENTITE: Matrice = [1, 0, 0, 1, 0, 0];

/** Composition `m` puis `n` — convention PDF : `cm` pré-multiplie la matrice courante. */
function composer(m: Matrice, n: Matrice): Matrice {
    return [
        m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
        m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
        m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
    ];
}

function appliquer(m: Matrice, x: number, y: number): [number, number] {
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Concatène les flux de contenu d'un PDF, décompressés quand ils le sont. */
export function contentStreams(pdf: Buffer): string {
    const src = pdf.toString('latin1');
    const out: string[] = [];
    // `(?<!end)` : « endstream » contient « stream », et sans cette garde chaque
    // fin de flux serait prise pour un début.
    const re = /(?<!end)stream\r?\n/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
        const fin = src.indexOf('endstream', m.index);
        const brut = Buffer.from(src.slice(m.index + m[0].length, fin), 'latin1');
        try {
            out.push(zlib.inflateSync(brut).toString('latin1'));
        } catch {
            // Flux non compressé (ou image) : on le garde tel quel, il ne fera
            // simplement correspondre aucun opérateur.
            out.push(brut.toString('latin1'));
        }
    }
    return out.join('\n');
}

/**
 * Rectangle peint avec la couleur donnée, en coordonnées de PAGE
 * (`[x1, y1, x2, y2]`, origine en bas à gauche).
 *
 * ⚠️ SUIVRE LA MATRICE COURANTE EST INDISPENSABLE. `@react-pdf/renderer` imbrique
 * chaque bloc dans un `q … cm … Q` : deux colonnes voisines émettent des
 * coordonnées locales IDENTIQUES, seule la translation englobante les distingue.
 * Lire les nombres de l'opérateur `re` sans composer les transformations
 * renverrait deux fois le même rectangle.
 *
 * @param couleur composantes de l'opérateur `scn`, p. ex. `'1 0 0'`. react-pdf
 * écrit les couleurs avec `scn` (espace nommé), jamais `rg`.
 */
export function filledRect(pdf: Buffer, couleur: string): number[] | null {
    const jetons = contentStreams(pdf).split(/\s+/);
    let ctm: Matrice = [...IDENTITE] as Matrice;
    const pile: Matrice[] = [];
    let courante = '';

    for (let i = 0; i < jetons.length; i++) {
        const op = jetons[i];
        if (op === 'q') {
            pile.push([...ctm] as Matrice);
        } else if (op === 'Q') {
            ctm = pile.pop() ?? ([...IDENTITE] as Matrice);
        } else if (op === 'cm' && i >= 6) {
            ctm = composer(jetons.slice(i - 6, i).map(Number) as Matrice, ctm);
        } else if (op === 'scn' && i >= 3) {
            courante = jetons.slice(i - 3, i).join(' ');
        } else if (op === 're' && i >= 4 && courante === couleur) {
            const [x, y, l, h] = jetons.slice(i - 4, i).map(Number);
            const [x1, y1] = appliquer(ctm, x, y);
            const [x2, y2] = appliquer(ctm, x + l, y + h);
            return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)]
                .map(v => Math.round(v * 10) / 10);
        }
    }
    return null;
}
