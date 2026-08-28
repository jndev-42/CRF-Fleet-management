/**
 * Vérification des signatures d'un PDF scellé.
 *
 * `@signpdf` SIGNE mais NE VÉRIFIE PAS : aucune fonction de vérification n'est
 * exportée par l'écosystème. La chaîne est donc écrite ici :
 *   extraction du DER → recalcul du condensat sur le /ByteRange → comparaison
 *
 * ⚠️ CE MODULE EST UN PROXY DE RÉGRESSION, PAS L'ORACLE. Un vérificateur que nous
 * écrivons nous-mêmes ne peut pas se valider lui-même : s'il oubliait de recalculer
 * le condensat, il renverrait « valide » sur un document altéré. L'oracle de la
 * détection d'altération est Adobe Acrobat Reader ; ce module doit rester calibré
 * contre son verdict.
 */

import forge from 'node-forge';

export interface SignatureInfo {
    index: number;
    byteRange: number[];
    name: string | null;
    reason: string | null;
    /** Date affichée par les lecteurs PDF (`/M` du dictionnaire de signature). */
    signingTime: string | null;
    /** Le condensat du contenu couvert correspond-il à celui qui a été signé ? */
    digestValid: boolean;
    /** Le PKCS#7 est-il structurellement exploitable ? */
    parsed: boolean;
    error?: string;
}

export interface VerifyReport {
    revisions: number;
    docMdp: { present: boolean; level: number | null; permsPresent: boolean };
    catalogVersion: string | null;
    header: string;
    pages: number;
    rects: string[];
    signatures: SignatureInfo[];
    /** Toutes les signatures présentes sont-elles intactes ? */
    allValid: boolean;
}

/**
 * Lit une chaîne de texte PDF, littérale `(…)` ou hexadécimale `<…>`.
 *
 * Les valeurs non-ASCII sont écrites en UTF-16BE hexadécimal (voir `pdfString`
 * dans `incremental.ts`) : sans ce décodage, tout nom accentué serait rendu
 * comme `null` dans le rapport, et une régression d'encodage passerait inaperçue.
 */
function readPdfString(dict: string, key: string): string | null {
    const litteral = new RegExp(`/${key}\\s*\\(([^)]*)\\)`).exec(dict);
    if (litteral) return litteral[1].replace(/\\([\s\S])/g, (_m, c: string) => c);

    const hex = new RegExp(`/${key}\\s*<([0-9A-Fa-f\\s]*)>`).exec(dict);
    if (!hex) return null;
    const buf = Buffer.from(hex[1].replace(/\s/g, ''), 'hex');
    if (buf[0] === 0xfe && buf[1] === 0xff) {
        return Buffer.from(buf.subarray(2)).swap16().toString('utf16le');
    }
    return buf.toString('latin1');
}

function allMatches(s: string, re: RegExp): RegExpExecArray[] {
    const out: RegExpExecArray[] = [];
    const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let m: RegExpExecArray | null;
    while ((m = r.exec(s)) !== null) out.push(m);
    return out;
}

/**
 * Longueur réelle du DER d'après son en-tête ASN.1.
 *
 * ⚠️ NE PAS retirer les zéros finaux caractère par caractère : `/Contents` est
 * bourré de zéros jusqu'à `signatureLength`, mais un DER légitime peut lui-même
 * se terminer par 0x00. Un strip naïf tronque alors la structure et produit un
 * faux « non exploitable » — défaut constaté puis corrigé au spike.
 */
function derLength(buf: Buffer): number {
    if (buf.length < 2) return 0;
    const lenByte = buf[1];
    if (lenByte < 0x80) return 2 + lenByte;
    const n = lenByte & 0x7f;
    if (n === 0 || buf.length < 2 + n) return 0;
    let len = 0;
    for (let i = 0; i < n; i++) len = (len << 8) | buf[2 + i];
    return 2 + n + len;
}

function extractSignatures(buf: Buffer): { der: Buffer; byteRange: number[]; dict: string }[] {
    const s = buf.toString('latin1');
    const out: { der: Buffer; byteRange: number[]; dict: string }[] = [];

    for (const m of allMatches(s, /\/ByteRange\s*\[([^\]]*)\]/g)) {
        const byteRange = m[1].trim().split(/\s+/).map(Number);
        if (byteRange.length !== 4 || byteRange.some(Number.isNaN)) continue;

        const cStart = s.indexOf('/Contents <', m.index);
        if (cStart === -1) continue;
        const hexStart = cStart + '/Contents <'.length;
        let hex = s.slice(hexStart, s.indexOf('>', hexStart));
        if (hex.length % 2) hex = hex.slice(0, -1);

        const raw = Buffer.from(hex, 'hex');
        const len = derLength(raw);
        const der = len > 0 && len <= raw.length ? raw.subarray(0, len) : raw;
        if (!der.length) continue;

        out.push({ der, byteRange, dict: s.slice(s.lastIndexOf('obj', m.index), s.indexOf('endobj', m.index)) });
    }
    return out;
}

/**
 * Nombre réel de pages.
 *
 * ⚠️ NE PAS compter les `/Type /Page` : chaque incremental update RÉ-ÉMET l'objet
 * page, donc le compte gonfle à chaque scellement (un document mono-page scellé
 * 3 fois en afficherait 4). On lit le `/Count` du nœud `/Pages` le plus récent.
 */
function realPageCount(s: string): number {
    const counts = allMatches(s, /\/Type\s*\/Pages\b[\s\S]{0,400}?\/Count\s+(\d+)/g);
    if (counts.length) return Number(counts[counts.length - 1][1]);
    const alt = allMatches(s, /\/Count\s+(\d+)[\s\S]{0,400}?\/Type\s*\/Pages\b/g);
    return alt.length ? Number(alt[alt.length - 1][1]) : 0;
}

export function verifySignatures(pdf: Buffer): VerifyReport {
    const s = pdf.toString('latin1');
    const sigs = extractSignatures(pdf);

    const signatures: SignatureInfo[] = sigs.map((sig, i) => {
        const info: SignatureInfo = {
            index: i + 1,
            byteRange: sig.byteRange,
            name: readPdfString(sig.dict, 'Name'),
            reason: readPdfString(sig.dict, 'Reason'),
            signingTime: /\/M\s*\(([^)]*)\)/.exec(sig.dict)?.[1] ?? null,
            digestValid: false,
            parsed: false,
        };

        try {
            // Les octets réellement couverts : tout le fichier sauf le trou du /Contents.
            const [o1, l1, o2, l2] = sig.byteRange;
            const covered = Buffer.concat([pdf.subarray(o1, o1 + l1), pdf.subarray(o2, o2 + l2)]);

            const p7 = forge.pkcs7.messageFromAsn1(
                forge.asn1.fromDer(forge.util.createBuffer(sig.der.toString('latin1')))
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- node-forge ne type pas rawCapture
            ) as any;
            info.parsed = true;

            const authAttrs = p7.rawCapture?.authenticatedAttributes;
            if (authAttrs) {
                let expected: string | null = null;
                for (const attr of authAttrs) {
                    if (forge.asn1.derToOid(attr.value[0].value) === forge.pki.oids.messageDigest) {
                        expected = attr.value[1].value[0].value;
                    }
                }
                if (expected !== null) {
                    const md = forge.md.sha256.create();
                    md.update(covered.toString('latin1'));
                    info.digestValid = md.digest().getBytes() === expected;
                }
            }
        } catch (e: unknown) {
            info.error = e instanceof Error ? e.message : String(e);
        }
        return info;
    });

    const docMdpM = /\/TransformMethod\s*\/DocMDP[\s\S]{0,120}?\/P\s+(\d)/.exec(s);
    return {
        revisions: sigs.length,
        docMdp: {
            present: /\/TransformMethod\s*\/DocMDP/.test(s),
            level: docMdpM ? Number(docMdpM[1]) : null,
            permsPresent: /\/Perms\s*<<[^>]*\/DocMDP/.test(s),
        },
        catalogVersion: /\/Version\s*\/([\d.]+)/.exec(s)?.[1] ?? null,
        header: pdf.subarray(0, 8).toString('latin1'),
        pages: realPageCount(s),
        rects: allMatches(s, /\/Rect\s*\[([^\]]*)\]/g).map(m => `[${m[1].trim()}]`),
        signatures,
        allValid: signatures.length > 0 && signatures.every(x => x.digestValid),
    };
}

/** Nombre de pages d'un PDF — utilisé par le garde-fou D6 avant scellement. */
export function countPages(pdf: Buffer): number {
    return realPageCount(pdf.toString('latin1'));
}
