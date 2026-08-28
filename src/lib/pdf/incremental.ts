/**
 * Écriture d'un incremental update PDF : pose d'un emplacement de signature dans
 * un champ EXISTANT, règle DocMDP, apparence en calques.
 *
 * ⚠️ POURQUOI NOUS N'UTILISONS PAS `@signpdf/placeholder-plain`. Cette
 * bibliothèque CRÉE un champ de signature à chaque passe, ce qui modifie
 * l'`/AcroForm` et les annotations de la page. Or la signature de certification
 * (DocMDP P=2) n'autorise après elle QUE le remplissage de champs préexistants :
 * Acrobat invalide donc les signatures antérieures dès la deuxième passe
 * (« les signatures 1 et 2 sont invalidées, des modifications ont été
 * apportées »), alors que les condensats sont parfaitement intacts.
 *
 * Les trois champs sont donc créés AVANT le premier scellement (`fields.ts`), et
 * chaque passe se contente d'en remplir un — la seule opération que la
 * certification autorise. Vérifié dans Acrobat.
 *
 * ⚠️ IMMUABILITÉ. Ce module n'écrit QUE des octets ajoutés en fin de fichier.
 * Rien d'antérieur n'est réécrit : c'est ce qui préserve le condensat des
 * signatures déjà posées. `assertIncrementalAppend` le vérifie après coup.
 */

import sharp from 'sharp';

export class IncrementalUpdateError extends Error {}

interface XrefEntry { num: number; offset: number }

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

/**
 * Formate un nombre réel pour un fichier PDF.
 *
 * ⚠️ ISO 32000-1 annexe C.1 fixe la précision d'un réel à CINQ décimales. Une
 * soustraction de coordonnées produit pourtant des valeurs comme
 * `35.400000000000006`, que `String()` écrit telles quelles ; le fichier sort
 * alors des limites d'implémentation documentées d'Adobe.
 */
function pdfNum(n: number): string {
    return String(Math.round(n * 1e5) / 1e5);
}

/**
 * Encode une chaîne de texte PDF.
 *
 * ASCII → chaîne littérale. Sinon → chaîne HEXADÉCIMALE en UTF-16BE avec BOM.
 *
 * ⚠️ L'HEXADÉCIMAL N'EST PAS UN CHOIX DE STYLE. Une chaîne littérale exige
 * d'échapper `(`, `)` et `\` ; sur un flux UTF-16, un échappement en trop ou en
 * moins décale tout le reste d'un demi-caractère et le lecteur affiche des
 * idéogrammes — défaut réellement constaté dans Acrobat avec l'encodeur amont.
 * La forme hexadécimale n'a aucun caractère à échapper : la classe entière de
 * défauts disparaît.
 */
function pdfString(value: string): string {
    if (/^[\x20-\x7e]*$/.test(value)) {
        return `(${value.replace(/[\\()]/g, c => '\\' + c)})`;
    }
    const utf16be = Buffer.from('﻿' + value, 'utf16le').swap16();
    return `<${utf16be.toString('hex').toUpperCase()}>`;
}

/** Date au format PDF (`D:YYYYMMDDHHmmSSZ`), en UTC. */
function pdfDate(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
        `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

/** Objet indirect à écrire : son numéro et son corps, sans en-tête ni `endobj`. */
interface IndirectObject { num: number; body: string }

export interface PlaceholderOptions {
    /** Nom (`/T`) du champ de signature à remplir — il doit déjà exister. */
    fieldName: string;
    /** Motif affiché dans le panneau Signatures. */
    reason: string;
    /** Nom du signataire. */
    name: string;
    location: string;
    contactInfo: string;
    /** Horodatage écrit dans `/M` — la date qu'affichent les lecteurs. */
    signingTime: Date;
    /** Octets réservés au PKCS#7 dans `/Contents`. */
    signatureLength: number;
    /** Niveau DocMDP — signature de CERTIFICATION (la 1re) uniquement. */
    docMdpLevel?: 1 | 2 | 3;
    /** Tracé manuscrit à rendre dans le widget du champ. */
    appearancePng?: Buffer;
}

/** Localise la dernière ré-émission d'un objet indirect donné. */
function lastRevisionOf(src: string, num: number): string {
    const start = src.lastIndexOf(`\n${num} 0 obj`);
    if (start === -1) throw new IncrementalUpdateError(`Objet ${num} introuvable dans le document`);
    return src.slice(start, src.indexOf('endobj', start));
}

/** Extrait le dictionnaire externe (`<< … >>`) d'un objet. */
function outerDict(text: string): string {
    const open = text.indexOf('<<');
    const close = text.lastIndexOf('>>');
    if (open === -1 || close === -1 || close < open) {
        throw new IncrementalUpdateError('Objet sans dictionnaire exploitable');
    }
    return text.slice(open, close + 2);
}

/**
 * Construit les cinq objets d'une apparence de signature.
 *
 * ⚠️ EMPILEMENT IMPOSÉ PAR ACROBAT (PDF Reference §8.7.1). Une apparence « à
 * plat » — un seul XObject dessinant l'image — s'affiche correctement dans tous
 * les lecteurs, mais Acrobat la RECONSTRUIT à l'ouverture ; sur un document
 * certifié, cette reconstruction est comptabilisée comme une modification et le
 * panneau annonce « Des modifications ont été apportées » sur un fichier
 * pourtant intact. Bisecté dans Acrobat : certification seule → sain ;
 * apparence seule → saine ; les deux ensemble → fautif.
 *
 *   /AP /N  →  dessine /FRM
 *   /FRM    →  dessine /n0 (fond) puis /n2 (le tracé)
 */
async function buildAppearance(
    png: Buffer,
    width: number,
    height: number,
    firstNum: number
): Promise<{ objects: IndirectObject[]; apNum: number }> {
    // JPEG + /DCTDecode : évite d'implémenter le décodage des chunks PNG. Le
    // tracé est aplati sur blanc — il est de toute façon rendu sur le fond blanc
    // du formulaire.
    const meta = await sharp(png).metadata();
    const jpeg = await sharp(png)
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .jpeg({ quality: 90 })
        .toBuffer();

    let num = firstNum;
    const imgNum = num++, n0Num = num++, n2Num = num++, frmNum = num++, apNum = num++;
    const box = `/BBox [0 0 ${pdfNum(width)} ${pdfNum(height)}]`;

    const form = (bbox: string, resources: string, stream: string) =>
        `<<\n/Type /XObject\n/Subtype /Form\n/FormType 1\n${bbox}\n${resources}\n` +
        `/Length ${stream.length}\n>>\nstream\n${stream}endstream`;

    // Le fond est un carré vide de 100×100 : convention d'Adobe, cette couche
    // n'est jamais mise à l'échelle du widget.
    const blank = '% DSBlank\n';
    const n2 = `q\n${pdfNum(width)} 0 0 ${pdfNum(height)} 0 0 cm\n/Im0 Do\nQ\n`;
    const frm = 'q\n/n0 Do\nQ\nq\n/n2 Do\nQ\n';
    const ap = 'q\n/FRM Do\nQ\n';

    return {
        apNum,
        objects: [
            { num: imgNum, body:
                `<<\n/Type /XObject\n/Subtype /Image\n/Width ${meta.width}\n/Height ${meta.height}\n` +
                `/ColorSpace /DeviceRGB\n/BitsPerComponent 8\n/Filter /DCTDecode\n` +
                `/Length ${jpeg.length}\n>>\nstream\n${jpeg.toString('latin1')}\nendstream` },
            { num: n0Num, body: form('/BBox [0 0 100 100]', '/Resources << /ProcSet [/PDF] >>', blank) },
            { num: n2Num, body: form(box,
                `/Resources << /ProcSet [/PDF /ImageC] /XObject << /Im0 ${imgNum} 0 R >> >>`, n2) },
            { num: frmNum, body: form(box,
                `/Resources << /ProcSet [/PDF] /XObject << /n0 ${n0Num} 0 R /n2 ${n2Num} 0 R >> >>`, frm) },
            { num: apNum, body: form(box,
                `/Resources << /ProcSet [/PDF] /XObject << /FRM ${frmNum} 0 R >> >>`, ap) },
        ],
    };
}

/**
 * Ajoute au PDF un incremental update qui remplit un champ de signature existant
 * d'un emplacement prêt à signer (`/ByteRange` et `/Contents` en réserve).
 *
 * Le buffer produit est destiné à `SignPdf.sign()`, qui remplace l'emplacement
 * sans changer la longueur du fichier.
 *
 * @throws {IncrementalUpdateError} si le champ est absent, déjà signé, ou si une
 * apparence est demandée sur un champ sans surface.
 */
export async function addPlaceholderToField(
    pdf: Buffer,
    opts: PlaceholderOptions
): Promise<Buffer> {
    const src = pdf.toString('latin1');

    const xrefM = /startxref\s+(\d+)\s*%%EOF\s*$/.exec(src);
    if (!xrefM) throw new IncrementalUpdateError('Le document ne se termine pas par startxref/%%EOF');
    const prevXref = Number(xrefM[1]);

    const trailer = src.slice(src.lastIndexOf('trailer'));
    const rootRef = /\/Root\s+(\d+\s+\d+\s+R)/.exec(trailer)?.[1];
    if (!rootRef) throw new IncrementalUpdateError('/Root introuvable dans le trailer');
    const infoRef = /\/Info\s+(\d+\s+\d+\s+R)/.exec(trailer)?.[1] ?? null;
    // /ID identifie le document ; il doit être reconduit dans CHAQUE trailer,
    // faute de quoi plus rien ne relie les révisions au même fichier.
    const id = /\/ID\s*\[([^\]]*)\]/.exec(trailer)?.[1] ?? null;
    const prevSize = Number(/\/Size\s+(\d+)/.exec(trailer)?.[1] ?? 0);
    if (!prevSize) throw new IncrementalUpdateError('/Size introuvable dans le trailer');

    // ── Champ ciblé ───────────────────────────────────────────────────────────
    const marker = src.lastIndexOf(`/T (${opts.fieldName})`);
    if (marker === -1) {
        throw new IncrementalUpdateError(
            `Champ de signature « ${opts.fieldName} » introuvable. Les trois champs doivent ` +
            `être créés avant le premier scellement (addSignatureFields).`
        );
    }
    const fieldStart = src.lastIndexOf('\n', src.lastIndexOf(' obj', marker)) + 1;
    const fieldText = src.slice(fieldStart, src.indexOf('endobj', fieldStart));
    const fieldNum = Number(/^(\d+)\s+0\s+obj/.exec(fieldText)?.[1]);
    if (!fieldNum) {
        throw new IncrementalUpdateError(`En-tête d'objet illisible pour « ${opts.fieldName} »`);
    }
    if (/\/V\s+\d+\s+0\s+R/.test(fieldText)) {
        throw new IncrementalUpdateError(`Le champ « ${opts.fieldName} » porte déjà une signature.`);
    }

    let nextNum = prevSize;
    const sigNum = nextNum++;
    const objects: IndirectObject[] = [];

    // ── Apparence ─────────────────────────────────────────────────────────────
    let apEntry = '';
    if (opts.appearancePng) {
        const rectM = /\/Rect\s*\[([^\]]*)\]/.exec(fieldText);
        if (!rectM) throw new IncrementalUpdateError(`/Rect introuvable sur « ${opts.fieldName} »`);
        const rect = rectM[1].trim().split(/\s+/).map(Number);
        const w = rect[2] - rect[0];
        const h = rect[3] - rect[1];
        if (!(w > 0 && h > 0)) {
            throw new IncrementalUpdateError(
                `Apparence demandée sur un champ sans surface : [${rect.join(' ')}]. ` +
                `Une signature invisible ne doit pas recevoir d'image.`
            );
        }
        const { objects: apObjects, apNum } = await buildAppearance(opts.appearancePng, w, h, nextNum);
        nextNum += apObjects.length;
        objects.push(...apObjects);
        apEntry = `\n/AP << /N ${apNum} 0 R >>`;
    }

    // ── Dictionnaire de signature ─────────────────────────────────────────────
    // `/Reference` porte la règle DocMDP ; son `/Data` désigne l'objet sur lequel
    // porte la transformation — le catalogue — faute de quoi Acrobat signale
    // « une erreur est survenue lors de la validation de la signature ».
    const catalogNum = Number(rootRef.split(' ')[0]);
    const reference = opts.docMdpLevel
        ? `\n/Reference [<< /Type /SigRef /TransformMethod /DocMDP` +
          ` /TransformParams << /Type /TransformParams /P ${opts.docMdpLevel} /V /1.2 >>` +
          ` /Data ${catalogNum} 0 R /DigestMethod /SHA256 >>]`
        : '';

    objects.unshift({ num: sigNum, body:
        `<<\n/Type /Sig\n/Filter /Adobe.PPKLite\n/SubFilter /adbe.pkcs7.detached\n` +
        // Emplacement reconnu par `SignPdf.sign`, qui le remplace par les valeurs
        // réelles sans modifier la longueur du fichier.
        `/ByteRange [0 /********** /********** /**********]\n` +
        `/Contents <${'0'.repeat(opts.signatureLength * 2)}>${reference}\n` +
        `/Reason ${pdfString(opts.reason)}\n` +
        `/M (${pdfDate(opts.signingTime)})\n` +
        `/ContactInfo ${pdfString(opts.contactInfo)}\n` +
        `/Name ${pdfString(opts.name)}\n` +
        `/Location ${pdfString(opts.location)}\n>>` });

    // ── Champ rempli ──────────────────────────────────────────────────────────
    // Ré-émis à l'identique, `/V` (et l'apparence) en plus : c'est la seule
    // modification qu'une certification P=2 autorise.
    objects.push({ num: fieldNum, body:
        `<<\n/V ${sigNum} 0 R${apEntry}` + outerDict(fieldText).slice(2) });

    // ── Catalogue — certification uniquement ──────────────────────────────────
    if (opts.docMdpLevel) {
        // /Version : DocMDP lui-même est PDF 1.4, mais `/Perms` est PDF 1.5
        // (ISO 32000-1 §7.7.2) alors que @react-pdf/renderer émet un en-tête
        // %PDF-1.3. L'override /Version au catalogue (§7.5.5) réconcilie sans
        // réécrire l'en-tête — ce qu'un incremental update ne peut pas faire.
        objects.push({ num: catalogNum, body:
            `<<\n/Perms << /DocMDP ${sigNum} 0 R >>\n/Version /1.7` +
            outerDict(lastRevisionOf(src, catalogNum)).slice(2) });
    }

    // ── Assemblage ────────────────────────────────────────────────────────────
    let body = src;
    const entries: XrefEntry[] = [];
    for (const obj of objects) {
        body += '\n';
        entries.push({ num: obj.num, offset: body.length });
        body += `${obj.num} 0 obj\n${obj.body}\nendobj\n`;
    }

    const xrefOffset = body.length + 1;
    const maxEntry = entries.reduce((m, e) => Math.max(m, e.num), 0);
    const newTrailer =
        `trailer\n<<\n/Size ${Math.max(prevSize, maxEntry + 1)}\n/Root ${rootRef}\n` +
        (infoRef ? `/Info ${infoRef}\n` : '') +
        (id ? `/ID [${id}]\n` : '') +
        `/Prev ${prevXref}\n>>\nstartxref\n${xrefOffset}\n%%EOF`;

    return Buffer.from(body + '\n' + buildXrefTable(entries) + newTrailer, 'latin1');
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
