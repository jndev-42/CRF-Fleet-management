// @vitest-environment node
/**
 * Tests de la chaîne de scellement cryptographique.
 *
 * Environnement `node` explicite : `vitest.config.ts` impose `jsdom` globalement,
 * or Buffer, crypto et le rendu PDF exigent le vrai runtime Node.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import sharp from 'sharp';
import { installTestCert, testSigningCert } from '../fixtures/signing-cert';
import ExpensePdfDocument from '@/components/expenses/ExpensePdfDocument';

import {
    sealPdf, decodeSignatureImage, SIGNATURE_LENGTH, assertSigningCertConfigured,
} from '@/lib/pdf/signature';
import { verifySignatures } from '@/lib/pdf/verify';
import { assertIncrementalAppend, countRevisions, IncrementalUpdateError } from '@/lib/pdf/incremental';
import { addSignatureFields, SignatureFieldError } from '@/lib/pdf/fields';
import {
    SIGNATURE_WIDGET_RECTS, SIGNATURE_FIELDS, assertPageGeometry,
    PageGeometryError, PAGE_WIDTH, PAGE_HEIGHT,
} from '@/lib/expenses/signature-layout';

// Les modules lisent l'environnement À L'APPEL (pas au chargement) : installer le
// certificat ici suffit, les imports statiques restent valides.
installTestCert();

async function buildPdf(itemCount: number, forSealing = true): Promise<Buffer> {
    const report = {
        id: 'test-1',
        userName: 'Jean Dupont',
        userEmail: 'jean@dev.local',
        submittedAt: '2026-08-26T09:00:00.000Z',
        missionName: 'Mission test',
        missionDate: '2026-08-20',
        status: 'soumis',
        imputation: 'DLUS',
        customImputation: null,
        requestRefund: true,
        noReceiptDeclaration: false,
        total: itemCount * 10,
        ulId: 'ul-paris-18',
        ulName: 'Paris 18',
        ulStampImage: null,
        userFunction: 'Bénévole',
        userSignature: null,
        validatorName: null,
        validatedAt: null,
        validatorSignature: null,
        items: Array.from({ length: itemCount }, (_, i) => ({ label: `Frais ${i + 1}`, amount: 10 })),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- le composant PDF n'expose pas de type props exportable
    const el = createElement(ExpensePdfDocument as any, { report, logoSrc: '', forSealing }) as any;
    return Buffer.from(await renderToBuffer(el));
}

/**
 * Document prêt à sceller : les trois champs posés, comme le fait `sealStep1`.
 * Sceller un document sans champs est désormais une erreur — c'est le sens même
 * du correctif : aucun champ ne doit apparaître après la certification.
 */
async function buildSignable(itemCount: number): Promise<Buffer> {
    return addSignatureFields(await buildPdf(itemCount), [...SIGNATURE_FIELDS]);
}

async function signaturePng(): Promise<Buffer> {
    return sharp(Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
           <text x="10" y="60" font-size="28" fill="#1a1a8c">Signature</text></svg>`
    )).png().toBuffer();
}

describe('signature-layout', () => {
    it('expose trois zones : demandeur et valideur visibles, payeur invisible', () => {
        expect(SIGNATURE_WIDGET_RECTS.demandeur).toHaveLength(4);
        expect(SIGNATURE_WIDGET_RECTS.valideur).toHaveLength(4);
        // Le payeur n'a AUCUN widget — l'invisibilité est native côté placeholder.
        expect(SIGNATURE_WIDGET_RECTS.payeur).toBeNull();
    });

    it('place les rectangles dans le MediaBox, sans chevauchement', () => {
        const [, dy1, dx2, dy2] = SIGNATURE_WIDGET_RECTS.demandeur;
        const [vx1, vy1, , vy2] = SIGNATURE_WIDGET_RECTS.valideur;

        for (const [x1, y1, x2, y2] of [SIGNATURE_WIDGET_RECTS.demandeur, SIGNATURE_WIDGET_RECTS.valideur]) {
            expect(x2).toBeGreaterThan(x1);
            expect(y2).toBeGreaterThan(y1);
            expect(x1).toBeGreaterThanOrEqual(0);
            expect(y1).toBeGreaterThanOrEqual(0);
            expect(x2).toBeLessThanOrEqual(PAGE_WIDTH);
            expect(y2).toBeLessThanOrEqual(PAGE_HEIGHT);
        }

        // Les deux colonnes sont côte à côte, jamais superposées.
        expect(dx2).toBeLessThanOrEqual(vx1);

        // Même bande verticale : la hauteur du bloc de métadonnées étant figée en
        // mode scellement, les deux zones image sont alignées. Une divergence
        // signalerait que `sigMetaFixed` n'est plus appliqué à l'une des colonnes.
        expect(dy1).toBe(vy1);
        expect(dy2).toBe(vy2);
    });

    it('rejette un PDF dont la géométrie de page diffère', () => {
        const fake = Buffer.from('%PDF-1.3\n/MediaBox [0 0 300 400]\n');
        expect(() => assertPageGeometry(fake)).toThrow(PageGeometryError);
    });

    it('valide la géométrie du rendu réel du composant', async () => {
        const pdf = await buildPdf(3);
        expect(() => assertPageGeometry(pdf)).not.toThrow();
    }, 20_000);

});

describe('sealPdf', () => {
    let base: Buffer;
    beforeAll(async () => { base = await buildSignable(4); });

    it('valide la configuration du certificat sans conserver le signer', () => {
        expect(() => assertSigningCertConfigured()).not.toThrow();
    });

    it('DÉTECTE un certificat tronqué — cas d\'une variable copiée incomplètement', async () => {
        // Construire un P12Signer ne suffit pas : son constructeur enveloppe le
        // buffer sans le parser, donc un certificat coupé passerait le contrôle
        // et n'échouerait qu'au premier scellement réel, en production.
        const { p12Base64 } = testSigningCert();
        const full = Buffer.from(p12Base64, 'base64');
        const truncated = full.subarray(0, full.length - 1);

        vi.resetModules();
        const saved = process.env.SIGNING_CERT_P12_BASE64;
        process.env.SIGNING_CERT_P12_BASE64 = truncated.toString('base64');
        try {
            const mod = await import('@/lib/pdf/signature');
            expect(() => mod.assertSigningCertConfigured()).toThrow(/TRONQUÉ/);
        } finally {
            process.env.SIGNING_CERT_P12_BASE64 = saved;
            vi.resetModules();
        }
    });

    it('DÉTECTE une passphrase incorrecte', async () => {
        vi.resetModules();
        const saved = process.env.SIGNING_CERT_PASSPHRASE;
        process.env.SIGNING_CERT_PASSPHRASE = 'mauvaise-passphrase';
        try {
            const mod = await import('@/lib/pdf/signature');
            expect(() => mod.assertSigningCertConfigured()).toThrow(/PASSPHRASE/);
        } finally {
            process.env.SIGNING_CERT_PASSPHRASE = saved;
            vi.resetModules();
        }
    });

    it('réserve une longueur de signature avec marge', () => {
        expect(SIGNATURE_LENGTH).toBeGreaterThanOrEqual(8192);
    });

    it('refuse une apparence sur le champ invisible du payeur', async () => {
        await expect(sealPdf(base, {
            reason: 'x', name: 'x', signingTime: new Date(),
            fieldName: SIGNATURE_FIELDS[2].name, appearancePng: await signaturePng(),
        })).rejects.toThrow(IncrementalUpdateError);
    });

    it('refuse de sceller un document sans champ de signature', async () => {
        await expect(sealPdf(await buildPdf(2), {
            reason: 'x', name: 'x', signingTime: new Date(), fieldName: 'Signature1',
        })).rejects.toThrow(/introuvable/);
    }, 20_000);

    it('refuse de re-signer un champ déjà rempli', async () => {
        const signe = await sealPdf(base, {
            reason: 'Soumission', name: 'Jean Dupont', signingTime: new Date(),
            fieldName: SIGNATURE_FIELDS[0].name, docMdpLevel: 2,
        });
        await expect(sealPdf(signe, {
            reason: 'Doublon', name: 'Jean Dupont', signingTime: new Date(),
            fieldName: SIGNATURE_FIELDS[0].name,
        })).rejects.toThrow(/déjà une signature/);
    }, 30_000);

    it('enchaîne TROIS scellements dans UN SEUL processus via le sealPdf de production', async () => {
        // Ce test est le garde-fou contre la réutilisation d'une instance P12Signer :
        // `sign()` consomme le ByteBuffer du constructeur, donc un signer mis en
        // cache ferait échouer la 2e passe avec « Too few bytes to parse DER ».
        // La panne n'apparaîtrait qu'en lambda chaud — invisible autrement.
        const png = await signaturePng();
        const s1 = await sealPdf(base, {
            reason: 'Soumission', name: 'Jean Dupont', signingTime: new Date('2026-08-26T09:00:00Z'),
            fieldName: SIGNATURE_FIELDS[0].name, appearancePng: png, docMdpLevel: 2,
        });
        const s2 = await sealPdf(s1, {
            reason: 'Validation', name: 'Marie Martin', signingTime: new Date('2026-08-26T10:00:00Z'),
            fieldName: SIGNATURE_FIELDS[1].name, appearancePng: png,
        });
        const s3 = await sealPdf(s2, {
            reason: 'Paiement', name: 'Paul Payeur', signingTime: new Date('2026-08-26T11:00:00Z'),
            fieldName: SIGNATURE_FIELDS[2].name,
        });

        expect(countRevisions(s3)).toBe(3);

        // Immuabilité stricte des préfixes : c'est ce qui préserve les condensats.
        expect(s2.subarray(0, s1.length).equals(s1)).toBe(true);
        expect(s3.subarray(0, s2.length).equals(s2)).toBe(true);

        const report = verifySignatures(s3);
        expect(report.revisions).toBe(3);
        expect(report.allValid).toBe(true);
        expect(report.pages).toBe(1);

        // DocMDP P=2 posé par la seule signature de certification.
        expect(report.docMdp.present).toBe(true);
        expect(report.docMdp.level).toBe(2);
        expect(report.docMdp.permsPresent).toBe(true);
        // /Perms est PDF 1.5 alors que react-pdf émet un en-tête 1.3 : l'override
        // /Version au catalogue réconcilie les deux.
        expect(report.catalogVersion).toBe('1.7');

        // TROIS champs en tout, ni plus ni moins : deux visibles, un invisible.
        // Chacun est ré-émis quand il est rempli, d'où les doublons — ce qui
        // compte est qu'aucun QUATRIÈME rectangle n'apparaisse, signe d'un champ
        // ajouté après la certification.
        const rectsDistincts = [...new Set(report.rects)];
        expect(rectsDistincts).toHaveLength(3);
        expect(rectsDistincts).toContain('[0 0 0 0]');

        // Les DEUX dates sont réglées ensemble : /M porte bien l'heure demandée.
        expect(report.signatures[0].signingTime).toContain('20260826090000');
        expect(report.signatures[2].signingTime).toContain('20260826110000');
    }, 60_000);

    it('détecte l\'altération d\'un octet du contenu', async () => {
        const sealed = await sealPdf(base, {
            reason: 'Soumission', name: 'Jean Dupont', signingTime: new Date(),
            fieldName: SIGNATURE_FIELDS[0].name, appearancePng: await signaturePng(), docMdpLevel: 2,
        });
        expect(verifySignatures(sealed).allValid).toBe(true);

        const tampered = Buffer.from(sealed);
        const at = tampered.indexOf('Jean Dupont');
        expect(at).toBeGreaterThan(0);
        tampered[at] ^= 0x01;

        expect(verifySignatures(tampered).allValid).toBe(false);
    }, 30_000);

    // Régression : `/Perms` était inséré à un offset mesuré AVANT l'insertion de
    // `/Reference`, donc périmé de ~150 octets — il atterrissait dans le
    // dictionnaire /AcroForm qui précède le catalogue. Aucun lecteur ne signale
    // rien, mais Acrobat n'y voit plus de signature de certification et
    // n'applique aucune restriction DocMDP. `permsPresent` ne suffit donc pas :
    // il faut vérifier DANS QUEL OBJET la clé se trouve.
    it('place /Perms et /Version dans le catalogue, pas dans l\'AcroForm', async () => {
        const sealed = await sealPdf(base, {
            reason: 'Soumission', name: 'Jean Dupont', signingTime: new Date(),
            fieldName: SIGNATURE_FIELDS[0].name, docMdpLevel: 2,
        });
        const texte = sealed.toString('latin1');

        const debut = texte.lastIndexOf('/Perms');
        expect(debut).toBeGreaterThan(0);
        const objet = texte.slice(
            texte.lastIndexOf('\n', texte.lastIndexOf(' obj', debut)) + 1,
            texte.indexOf('endobj', debut)
        );
        expect(objet).toContain('/Type /Catalog');
        expect(objet).toContain('/Version /1.7');
        expect(objet).not.toContain('/Type /AcroForm');
    }, 30_000);

    // Régression : une apparence « à plat » (un seul XObject dessinant l'image)
    // s'affiche partout, mais Acrobat la RECONSTRUIT à l'ouverture. Sur un
    // document certifié cette reconstruction compte comme une modification :
    // « Des modifications ont été apportées », fichier pourtant intact.
    // Bisecté en preview : certification seule → sain ; apparence seule → saine ;
    // les deux ensemble → fautif. Seul l'empilement du §8.7.1 satisfait Acrobat.
    it('empile l\'apparence en /FRM → /n0 + /n2 comme l\'exige Acrobat', async () => {
        const sealed = await sealPdf(base, {
            reason: 'Soumission', name: 'Jean Dupont', signingTime: new Date(),
            fieldName: SIGNATURE_FIELDS[0].name, appearancePng: await signaturePng(),
            docMdpLevel: 2,
        });
        const texte = sealed.toString('latin1');
        const objet = (num: string) => {
            const debut = texte.lastIndexOf(`\n${num} 0 obj`);
            return texte.slice(debut, texte.indexOf('stream', debut));
        };

        const ap = /\/AP << \/N (\d+) 0 R >>/.exec(texte);
        expect(ap).not.toBeNull();

        const frm = /\/FRM (\d+) 0 R/.exec(objet(ap![1]));
        expect(frm).not.toBeNull();

        const couches = objet(frm![1]);
        const n2 = /\/n2 (\d+) 0 R/.exec(couches);
        expect(couches).toContain('/n0');
        expect(n2).not.toBeNull();

        // Le tracé manuscrit vit dans la couche n2, pas directement dans /AP.
        expect(objet(n2![1])).toContain('/Im0');
    }, 30_000);
});

describe('assertIncrementalAppend', () => {
    it('accepte une extension stricte', () => {
        const before = Buffer.from('abc');
        expect(() => assertIncrementalAppend(before, Buffer.from('abcdef'))).not.toThrow();
    });

    it('lève — jamais un simple avertissement — si le préfixe a changé', () => {
        expect(() => assertIncrementalAppend(Buffer.from('abc'), Buffer.from('Xbcdef')))
            .toThrow(IncrementalUpdateError);
    });

    it('lève si le buffer a rétréci', () => {
        expect(() => assertIncrementalAppend(Buffer.from('abcdef'), Buffer.from('abc')))
            .toThrow(IncrementalUpdateError);
    });
});

describe('decodeSignatureImage', () => {
    it('décode un data URI', () => {
        const png = Buffer.from('89504e470d0a1a0a', 'hex');
        expect(decodeSignatureImage(`data:image/png;base64,${png.toString('base64')}`)?.equals(png)).toBe(true);
    });

    it('accepte du base64 nu', () => {
        expect(decodeSignatureImage(Buffer.from('hello').toString('base64'))?.toString()).toBe('hello');
    });

    it('renvoie null sur entrée vide ou absente', () => {
        expect(decodeSignatureImage(null)).toBeNull();
        expect(decodeSignatureImage(undefined)).toBeNull();
        expect(decodeSignatureImage('')).toBeNull();
    });
});

describe('encodage du texte des signatures', () => {
    /**
     * Décode une chaîne PDF comme le ferait un lecteur, SANS réutiliser le code de
     * production : un décodeur maison qui partagerait le bogue de l'encodeur
     * validerait n'importe quoi.
     */
    function lireChaine(pdf: Buffer, cle: string): string[] {
        const corps = pdf.toString('latin1');
        const out: string[] = [];
        const re = new RegExp(`/${cle}\\s*(?:\\(((?:[^()\\\\]|\\\\[\\s\\S])*)\\)|<([0-9A-Fa-f]*)>)`, 'g');
        let m: RegExpExecArray | null;
        while ((m = re.exec(corps)) !== null) {
            if (m[1] !== undefined) {
                out.push(m[1].replace(/\\([\s\S])/g, (_x, c: string) => c));
                continue;
            }
            const buf = Buffer.from(m[2], 'hex');
            expect(buf[0], `chaîne /${cle} hexadécimale sans BOM UTF-16`).toBe(0xfe);
            expect(buf[1]).toBe(0xff);
            // Une longueur impaire décalerait tout le texte d'un demi-caractère —
            // c'est ainsi qu'Acrobat affichait des idéogrammes.
            expect(buf.length % 2, `chaîne /${cle} de longueur impaire`).toBe(0);
            out.push(Buffer.from(buf.subarray(2)).swap16().toString('utf16le'));
        }
        return out;
    }

    it('restitue accents et parenthèses tels quels dans /Reason et /Name', async () => {
        const motif = 'Validation (scellée rétroactivement) — coût 12 €';
        const nom = 'Aurélie Nguyễn-Lévêque';

        const sealed = await sealPdf(await buildSignable(2), {
            reason: motif,
            name: nom,
            signingTime: new Date('2026-08-28T10:00:00.000Z'),
            fieldName: SIGNATURE_FIELDS[0].name,
            docMdpLevel: 2,
        });

        expect(lireChaine(sealed, 'Reason')).toContain(motif);
        expect(lireChaine(sealed, 'Name')).toContain(nom);
    }, 30_000);

    it('laisse une chaîne purement ASCII en littéral, sans BOM inutile', async () => {
        const motif = 'Soumission de la note de frais par le demandeur';
        const sealed = await sealPdf(await buildSignable(1), {
            reason: motif, name: 'Jean Dupont',
            signingTime: new Date('2026-08-28T10:00:00.000Z'),
            fieldName: SIGNATURE_FIELDS[0].name,
        });
        expect(/\/Name\s*\(Jean Dupont\)/.test(sealed.toString('latin1'))).toBe(true);
        expect(lireChaine(sealed, 'Reason')).toContain(motif);
    }, 30_000);

    it('échappe une parenthèse dans une chaîne ASCII', async () => {
        const motif = 'Refus (motif : justificatif manquant)';
        const sealed = await sealPdf(await buildSignable(1), {
            reason: motif, name: 'Jean Dupont', signingTime: new Date(),
            fieldName: SIGNATURE_FIELDS[1].name,
        });
        expect(lireChaine(sealed, 'Reason')).toContain(motif);
    }, 30_000);

    it('injecte /Data dans la référence DocMDP', async () => {
        const sealed = await sealPdf(await buildSignable(2), {
            reason: 'Soumission', name: 'Admin', signingTime: new Date(),
            fieldName: SIGNATURE_FIELDS[0].name, appearancePng: await signaturePng(),
            docMdpLevel: 2,
        });
        const raw = sealed.toString('latin1');
        expect(raw).toMatch(/\/TransformMethod\s*\/DocMDP/);
        expect(raw).toMatch(/\/Data\s+\d+\s+0\s+R/);
    }, 30_000);
});

describe('addSignatureFields', () => {
    it('pose les trois champs sur le document non signé', async () => {
        const prepared = await buildSignable(2);
        const texte = prepared.toString('latin1');
        for (const { name } of SIGNATURE_FIELDS) expect(texte).toContain(`/T (${name})`);
        expect(texte).toContain('/SigFlags 3');
        // Le champ du payeur existe mais n'a aucune surface.
        expect(texte).toContain('/Rect [ 0 0 0 0 ]');
    }, 20_000);

    it('refuse un document portant déjà un formulaire', async () => {
        const prepared = await buildSignable(1);
        await expect(addSignatureFields(prepared, [...SIGNATURE_FIELDS]))
            .rejects.toThrow(SignatureFieldError);
    }, 20_000);

    it('refuse deux champs de même nom', async () => {
        await expect(addSignatureFields(await buildPdf(1), [
            { name: 'Signature1', rect: SIGNATURE_WIDGET_RECTS.demandeur },
            { name: 'Signature1', rect: SIGNATURE_WIDGET_RECTS.valideur },
        ])).rejects.toThrow(SignatureFieldError);
    }, 20_000);
});
