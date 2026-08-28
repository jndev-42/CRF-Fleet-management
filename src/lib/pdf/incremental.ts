/**
 * Manipulation d'incremental update PDF — DocMDP et flux d'apparence.
 *
 * `node-signpdf` pose un placeholder et le signe, mais ne sait NI injecter une
 * règle DocMDP, NI rendre une image dans le widget de signature. Ce module comble
 * les deux, avec une seule tuyauterie (localisation d'objets + reconstruction de
 * la sous-table xref).
 *
 * ⚠️ ORDRE D'APPLICATION. Ces transformations s'appliquent ENTRE
 * `plainAddPlaceholder()` et `signpdf.sign()`. Toute modification postérieure à
 * `sign()` décalerait les octets et invaliderait le `/ByteRange` déjà calculé.
 *
 * ⚠️ IMMUABILITÉ. Seul le DERNIER incremental update est réécrit. Les octets
 * antérieurs au `%%EOF` précédent ne sont jamais touchés — c'est ce qui préserve
 * le condensat des signatures déjà posées.
 *
 * Ce module n'utilise AUCUN interne de `@signpdf` : pas de deep-import, pas de
 * couplage à des chemins non documentés. Manipulation de chaînes et reconstructeur
 * de xref autonomes.
 */

import sharp from 'sharp';

interface XrefEntry { num: number; offset: number; }

export class IncrementalUpdateError extends Error {}

/** Construit une table xref classique avec ses sous-sections contiguës. */
function buildXrefTable(entries: XrefEntry[]): string {
    const sorted = [...entries].sort((a, b) => a.num - b.num);
    let out = 'xref\n0 1\n0000000000 65535 f \n';
    let i = 0;
    while (i < sorted.length) {
        let j = i;
        while (j + 1 < sorted.length && sorted[j + 1].num === sorted[j].num + 1) j++;
        out += `${sorted[i].num} ${j - i + 1}\n`;
        for (let k = i; k <= j; k++) {
            out += `${String(sorted[k].offset).padStart(10, '0')} 00000 n \n`;
        }
        i = j + 1;
    }
    return out;
}

function lastXrefTableStart(s: string): number {
    const i = s.lastIndexOf('\nxref\n');
    if (i === -1) throw new IncrementalUpdateError('Table xref classique introuvable (xref stream non supporté)');
    return i;
}

function parseTrailer(s: string): { size: number; root: string; info: string | null; prev: number | null } {
    const t = s.slice(s.lastIndexOf('trailer'));
    return {
        size: Number(/\/Size\s+(\d+)/.exec(t)?.[1] ?? 0),
        root: /\/Root\s+(\d+\s+\d+\s+R)/.exec(t)?.[1] ?? '',
        info: /\/Info\s+(\d+\s+\d+\s+R)/.exec(t)?.[1] ?? null,
        prev: /\/Prev\s+(\d+)/.exec(t)?.[1] ? Number(/\/Prev\s+(\d+)/.exec(t)![1]) : null,
    };
}

function maxObjNum(s: string): number {
    let max = 0;
    const re = /(\d+)\s+0\s+obj/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) !== null) max = Math.max(max, Number(m[1]));
    return max;
}

/**
 * Localise l'objet contenant `marker` au-delà de `after`.
 *
 * ⚠️ NE PAS écrire `/(\d+) 0 obj[\s\S]*?MARKER/` : le quantificateur paresseux
 * traverse les frontières d'objets et capture le numéro d'un objet lointain
 * (bug constaté au spike). On cherche le marqueur, puis on remonte vers le
 * `N 0 obj` le plus proche.
 */
function findObjectContaining(
    body: string,
    marker: RegExp,
    after: number
): { num: number; start: number } | null {
    let found: { num: number; start: number } | null = null;
    const re = new RegExp(marker.source, marker.flags.includes('g') ? marker.flags : marker.flags + 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
        if (m.index <= after) continue;
        const head = body.lastIndexOf(' obj', m.index);
        if (head === -1) continue;
        const lineStart = body.lastIndexOf('\n', head) + 1;
        const om = /^(\d+)\s+0\s+obj/.exec(body.slice(lineStart, head + 4));
        if (om) found = { num: Number(om[1]), start: lineStart };
    }
    return found;
}

export interface AugmentOptions {
    /**
     * Niveau DocMDP à injecter — signature de CERTIFICATION uniquement (la 1re).
     * P=2 : « remplissage de formulaires et signatures autorisés ».
     */
    docMdpLevel?: 1 | 2 | 3;
    /** Tracé manuscrit à rendre dans le widget de cette signature. */
    appearancePng?: Buffer;
}

/**
 * Enrichit le dernier incremental update d'un PDF porteur d'un placeholder.
 *
 * @throws {IncrementalUpdateError} si la structure attendue est absente.
 */
export async function augmentIncremental(buf: Buffer, opts: AugmentOptions): Promise<Buffer> {
    if (!opts.docMdpLevel && !opts.appearancePng) return buf;

    const original = buf.toString('latin1');
    const xrefStart = lastXrefTableStart(original);
    const trailer = parseTrailer(original);

    let body = original.slice(0, xrefStart);
    const incrementalStart = trailer.prev !== null
        ? original.lastIndexOf('%%EOF', original.indexOf('obj', trailer.prev)) + 5
        : 0;

    const sigObj = findObjectContaining(body, /\/Type\s*\/Sig\b/g, incrementalStart);
    if (!sigObj) throw new IncrementalUpdateError('Dictionnaire /Sig introuvable dans le dernier incremental update');

    let nextObj = maxObjNum(original) + 1;
    const newObjects: string[] = [];

    // ── DocMDP ────────────────────────────────────────────────────────────────
    if (opts.docMdpLevel) {
        // Inséré APRÈS /Contents : signpdf localise /Contents à partir de la fin du
        // /ByteRange, l'ordre des deux clés doit donc être préservé. Les octets
        // insérés tombent dans byteRange[2..3] — ils SONT couverts par la signature.
        const contentsIdx = body.indexOf('/Contents <', sigObj.start);
        if (contentsIdx === -1) throw new IncrementalUpdateError('/Contents introuvable dans le dict /Sig');
        const contentsEnd = body.indexOf('>', contentsIdx) + 1;
        const ref =
            `\n/Reference [<< /Type /SigRef /TransformMethod /DocMDP` +
            ` /TransformParams << /Type /TransformParams /P ${opts.docMdpLevel} /V /1.2 >> >>]`;
        body = body.slice(0, contentsEnd) + ref + body.slice(contentsEnd);

        const catObj = findObjectContaining(body, /\/Type\s*\/Catalog\b/g, incrementalStart);
        if (!catObj) throw new IncrementalUpdateError('Catalogue ré-émis introuvable dans cet incremental update');

        const catDictOpen = body.indexOf('<<', catObj.start) + 2;
        // /Version : DocMDP lui-même est PDF 1.4, mais `/Perms` est PDF 1.5
        // (ISO 32000-1 §7.7.2) alors que @react-pdf/renderer émet un en-tête
        // %PDF-1.3. L'override /Version au catalogue (§7.5.5, PDF 1.4) réconcilie
        // sans réécrire l'en-tête — ce qu'un incremental update ne peut pas faire.
        // Les passes suivantes ne ré-émettent pas le catalogue, donc il survit.
        body = body.slice(0, catDictOpen)
            + `\n/Perms << /DocMDP ${sigObj.num} 0 R >>\n/Version /1.7`
            + body.slice(catDictOpen);
    }

    // ── Flux d'apparence ──────────────────────────────────────────────────────
    if (opts.appearancePng) {
        const widgetObj = findObjectContaining(body, /\/Subtype\s*\/Widget\b/g, incrementalStart);
        if (!widgetObj) throw new IncrementalUpdateError('Widget de signature introuvable');

        const widgetEnd = body.indexOf('endobj', widgetObj.start);
        const rectM = /\/Rect\s*\[([^\]]*)\]/.exec(body.slice(widgetObj.start, widgetEnd));
        if (!rectM) throw new IncrementalUpdateError('/Rect du widget introuvable');
        const rect = rectM[1].trim().split(/\s+/).map(Number);

        const w = rect[2] - rect[0];
        const h = rect[3] - rect[1];
        if (!(w > 0 && h > 0)) {
            throw new IncrementalUpdateError(
                `Apparence demandée sur un widget sans surface : [${rect.join(' ')}]. ` +
                `Une signature invisible ne doit pas recevoir d'image.`
            );
        }

        // JPEG + /DCTDecode : évite d'implémenter le décodage des chunks PNG.
        // La signature est aplatie sur blanc — elle est de toute façon rendue sur
        // le fond blanc du formulaire.
        const meta = await sharp(opts.appearancePng).metadata();
        const jpeg = await sharp(opts.appearancePng)
            .flatten({ background: { r: 255, g: 255, b: 255 } })
            .jpeg({ quality: 90 })
            .toBuffer();

        const imgNum = nextObj++;
        const formNum = nextObj++;

        newObjects.push(
            `${imgNum} 0 obj\n<<\n/Type /XObject\n/Subtype /Image\n/Width ${meta.width}\n/Height ${meta.height}\n` +
            `/ColorSpace /DeviceRGB\n/BitsPerComponent 8\n/Filter /DCTDecode\n/Length ${jpeg.length}\n>>\nstream\n` +
            jpeg.toString('latin1') + `\nendstream\nendobj\n`
        );

        const stream = `q\n${w} 0 0 ${h} 0 0 cm\n/Im0 Do\nQ\n`;
        newObjects.push(
            `${formNum} 0 obj\n<<\n/Type /XObject\n/Subtype /Form\n/FormType 1\n` +
            `/BBox [0 0 ${w} ${h}]\n/Resources << /XObject << /Im0 ${imgNum} 0 R >> >>\n` +
            `/Length ${stream.length}\n>>\nstream\n${stream}endstream\nendobj\n`
        );

        const wDictOpen = body.indexOf('<<', widgetObj.start) + 2;
        body = body.slice(0, wDictOpen) + `\n/AP << /N ${formNum} 0 R >>` + body.slice(wDictOpen);
    }

    // ── Reconstruction de la sous-table xref ──────────────────────────────────
    // Les insertions ont décalé tous les objets situés après elles : on rescanne
    // plutôt que de tenter de corriger les offsets un à un.
    if (newObjects.length) body += '\n' + newObjects.join('\n');

    const entries: XrefEntry[] = [];
    const objRe = /(\d+)\s+0\s+obj/g;
    let om: RegExpExecArray | null;
    while ((om = objRe.exec(body)) !== null) {
        if (om.index <= incrementalStart) continue;
        const num = Number(om[1]);
        const dup = entries.findIndex(e => e.num === num);
        if (dup !== -1) entries.splice(dup, 1);
        entries.push({ num, offset: om.index });
    }

    const newXrefOffset = body.length + 1;
    const trailerStr =
        `trailer\n<<\n/Size ${Math.max(trailer.size, maxObjNum(body) + 1)}\n/Root ${trailer.root}\n` +
        (trailer.info ? `/Info ${trailer.info}\n` : '') +
        (trailer.prev !== null ? `/Prev ${trailer.prev}\n` : '') +
        `>>\nstartxref\n${newXrefOffset}\n%%EOF`;

    return Buffer.from(body + '\n' + buildXrefTable(entries) + trailerStr, 'latin1');
}

/**
 * Garde-fou d'immuabilité : le nouveau buffer doit être une EXTENSION stricte de
 * l'ancien. Lève — jamais un simple avertissement — car un préfixe modifié casse
 * le condensat de toutes les signatures antérieures.
 */
export function assertIncrementalAppend(before: Buffer, after: Buffer): void {
    if (after.length <= before.length || !after.subarray(0, before.length).equals(before)) {
        throw new IncrementalUpdateError(
            'Le scellement a réécrit des octets antérieurs au lieu de les compléter : ' +
            'les signatures précédentes sont invalidées.'
        );
    }
}

/** Nombre de signatures présentes dans un PDF. */
export function countRevisions(pdf: Buffer): number {
    return (pdf.toString('latin1').match(/\/Type\s*\/Sig\b/g) || []).length;
}
