/**
 * Vérification des signatures d'un PDF scellé — outil d'exploitation.
 *
 * `@signpdf` SIGNE mais NE VÉRIFIE PAS (fait F8 du plan) : il n'expose aucune
 * fonction de vérification. Cette chaîne est donc écrite à la main :
 *   extractSignature -> recalcul du digest sur le /ByteRange -> forge.pkcs7.verify
 *
 * ⚠️ Cet outil est un PROXY DE RÉGRESSION, pas l'oracle. L'oracle du critère de
 * détection d'altération est Adobe Acrobat Reader (un vérificateur que nous
 * écrivons nous-mêmes ne peut pas se valider lui-même). Il doit être calibré
 * contre le verdict d'Acrobat avant d'être considéré comme fiable.
 *
 * Usage :
 *   npx tsx scripts/verify-signed-pdf.ts <fichier.pdf>
 */

import fs from 'fs';
import forge from 'node-forge';

export interface SignatureInfo {
    index: number;
    byteRange: number[];
    name: string | null;
    reason: string | null;
    signingTime: string | null;
    /** Le condensat du document couvert correspond-il à celui signé ? */
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
}

function allMatches(s: string, re: RegExp): RegExpExecArray[] {
    const out: RegExpExecArray[] = [];
    const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let m: RegExpExecArray | null;
    while ((m = r.exec(s)) !== null) out.push(m);
    return out;
}

/**
 * Longueur réelle du DER à partir de son en-tête ASN.1.
 *
 * ⚠️ NE PAS retirer les zéros finaux caractère par caractère : `/Contents` est
 * bourré de zéros jusqu'à `signatureLength`, mais un DER légitime peut lui aussi
 * se terminer par 0x00 — un strip naïf tronque alors la structure et produit un
 * faux « NON EXPLOITABLE ». On lit tag + longueur pour connaître la taille exacte.
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

/** Extrait le DER PKCS#7 et le /ByteRange de chaque signature. */
function extractSignatures(buf: Buffer): { der: Buffer; byteRange: number[]; dict: string }[] {
    const s = buf.toString('latin1');
    const out: { der: Buffer; byteRange: number[]; dict: string }[] = [];

    for (const m of allMatches(s, /\/ByteRange\s*\[([^\]]*)\]/g)) {
        const byteRange = m[1].trim().split(/\s+/).map(Number);
        if (byteRange.length !== 4 || byteRange.some(Number.isNaN)) continue;

        const cStart = s.indexOf('/Contents <', m.index);
        if (cStart === -1) continue;
        const hexStart = cStart + '/Contents <'.length;
        const hexEnd = s.indexOf('>', hexStart);
        let hex = s.slice(hexStart, hexEnd);
        if (hex.length % 2) hex = hex.slice(0, -1);
        const raw = Buffer.from(hex, 'hex');
        const len = derLength(raw);
        const der = len > 0 && len <= raw.length ? raw.subarray(0, len) : raw;
        if (!der.length) continue;

        const dictEnd = s.indexOf('endobj', m.index);
        out.push({
            der,
            byteRange,
            dict: s.slice(s.lastIndexOf('obj', m.index), dictEnd),
        });
    }
    return out;
}

/**
 * Nombre réel de pages.
 *
 * ⚠️ NE PAS compter les occurrences de `/Type /Page` : chaque incremental update
 * RÉ-ÉMET l'objet page, donc le compte gonfle à chaque scellement (un document
 * mono-page scellé 3 fois en afficherait 4). On lit le `/Count` du nœud `/Pages`,
 * en prenant la DERNIÈRE version ré-émise.
 */
function realPageCount(s: string): number {
    const counts = allMatches(s, /\/Type\s*\/Pages\b[\s\S]{0,400}?\/Count\s+(\d+)/g);
    if (counts.length) return Number(counts[counts.length - 1][1]);
    const alt = allMatches(s, /\/Count\s+(\d+)[\s\S]{0,400}?\/Type\s*\/Pages\b/g);
    return alt.length ? Number(alt[alt.length - 1][1]) : 0;
}

export function verifySignedPdf(buf: Buffer): VerifyReport {
    const s = buf.toString('latin1');
    const sigs = extractSignatures(buf);

    const signatures: SignatureInfo[] = sigs.map((sig, i) => {
        const info: SignatureInfo = {
            index: i + 1,
            byteRange: sig.byteRange,
            name: /\/Name\s*\(([^)]*)\)/.exec(sig.dict)?.[1] ?? null,
            reason: /\/Reason\s*\(([^)]*)\)/.exec(sig.dict)?.[1] ?? null,
            signingTime: /\/M\s*\(([^)]*)\)/.exec(sig.dict)?.[1] ?? null,
            digestValid: false,
            parsed: false,
        };

        try {
            // Les octets réellement couverts par la signature : tout sauf le trou
            // du /Contents.
            const [o1, l1, o2, l2] = sig.byteRange;
            const covered = Buffer.concat([
                buf.subarray(o1, o1 + l1),
                buf.subarray(o2, o2 + l2),
            ]);

            const p7 = forge.pkcs7.messageFromAsn1(
                forge.asn1.fromDer(forge.util.createBuffer(sig.der.toString('latin1')))
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- l'API forge n'expose pas ce type
            ) as any;
            info.parsed = true;

            // Comparer le condensat du contenu couvert à celui des attributs signés.
            const signerInfo = p7.rawCapture?.signature !== undefined ? p7.rawCapture : null;
            const authAttrs = p7.rawCapture?.authenticatedAttributes;
            if (authAttrs && signerInfo) {
                let expected: string | null = null;
                for (const attr of authAttrs) {
                    const oid = forge.asn1.derToOid(attr.value[0].value);
                    if (oid === forge.pki.oids.messageDigest) {
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
        header: buf.subarray(0, 8).toString('latin1'),
        pages: realPageCount(s),
        rects: allMatches(s, /\/Rect\s*\[([^\]]*)\]/g).map(m => `[${m[1].trim()}]`),
        signatures,
    };
}

function main(): void {
    const file = process.argv[2];
    if (!file) {
        console.error('Usage : npx tsx scripts/verify-signed-pdf.ts <fichier.pdf>');
        process.exit(1);
    }
    const r = verifySignedPdf(fs.readFileSync(file));

    console.log(`\n── ${file} ──`);
    console.log(`en-tête           : ${r.header.trim()}`);
    console.log(`/Version catalogue: ${r.catalogVersion ?? 'ABSENT'}`);
    console.log(`pages             : ${r.pages}`);
    console.log(`révisions signées : ${r.revisions}`);
    console.log(`DocMDP            : ${r.docMdp.present ? `présent, P=${r.docMdp.level}` : 'ABSENT'} · /Perms ${r.docMdp.permsPresent ? 'présent' : 'ABSENT'}`);
    console.log(`/Rect             : ${r.rects.join(' ')}`);
    for (const s of r.signatures) {
        const verdict = s.digestValid ? 'DIGEST OK' : s.parsed ? 'DIGEST INVALIDE' : 'NON EXPLOITABLE';
        console.log(`  #${s.index} ${String(s.name ?? '?').padEnd(14)} ${String(s.signingTime ?? '').padEnd(20)} ByteRange[${s.byteRange.join(' ')}] → ${verdict}${s.error ? ` (${s.error})` : ''}`);
    }
}

if (process.argv[1] && process.argv[1].endsWith('verify-signed-pdf.ts')) main();
