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
    sealPdf, decodeSignatureImage, SIGNATURE_LENGTH, assertSigningCertConfigured, SigningError,
} from '@/lib/pdf/signature';
import { verifySignatures, countPages } from '@/lib/pdf/verify';
import { assertIncrementalAppend, countRevisions, IncrementalUpdateError } from '@/lib/pdf/incremental';
import {
    SIGNATURE_WIDGET_RECTS, assertPageGeometry, MAX_ITEMS_SINGLE_PAGE, PageGeometryError,
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

    it('place les rectangles dans le MediaBox, au-dessus des métadonnées', () => {
        for (const rect of [SIGNATURE_WIDGET_RECTS.demandeur, SIGNATURE_WIDGET_RECTS.valideur]) {
            const [x1, y1, x2, y2] = rect;
            expect(x2).toBeGreaterThan(x1);
            expect(y2).toBeGreaterThan(y1);
            // y1 > 300 : le bas du widget s'arrête au-dessus du bloc nom/date/ID.
            expect(y1).toBeGreaterThan(300);
        }
    });

    it('rejette un PDF dont la géométrie de page diffère', () => {
        const fake = Buffer.from('%PDF-1.3\n/MediaBox [0 0 300 400]\n');
        expect(() => assertPageGeometry(fake)).toThrow(PageGeometryError);
    });

    it('valide la géométrie du rendu réel du composant', async () => {
        const pdf = await buildPdf(3);
        expect(() => assertPageGeometry(pdf)).not.toThrow();
    }, 20_000);

    it('DÉRIVE le seuil de pagination au lieu de le supposer', async () => {
        // Ce test est la source de vérité de MAX_ITEMS_SINGLE_PAGE : si la mise en
        // page du PDF change, il casse et donne la nouvelle valeur — au lieu de
        // laisser passer un document de 2 pages que le scellement casserait.
        expect(countPages(await buildPdf(MAX_ITEMS_SINGLE_PAGE))).toBe(1);
        expect(countPages(await buildPdf(MAX_ITEMS_SINGLE_PAGE + 1))).toBe(2);
    }, 30_000);
});

describe('sealPdf', () => {
    let base: Buffer;
    beforeAll(async () => { base = await buildPdf(4); });

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

    it('refuse une image d\'apparence sans widgetRect', async () => {
        await expect(sealPdf(base, {
            reason: 'x', name: 'x', signingTime: new Date(), appearancePng: await signaturePng(),
        })).rejects.toThrow(SigningError);
    });

    it('enchaîne TROIS scellements dans UN SEUL processus via le sealPdf de production', async () => {
        // Ce test est le garde-fou contre la réutilisation d'une instance P12Signer :
        // `sign()` consomme le ByteBuffer du constructeur, donc un signer mis en
        // cache ferait échouer la 2e passe avec « Too few bytes to parse DER ».
        // La panne n'apparaîtrait qu'en lambda chaud — invisible autrement.
        const png = await signaturePng();
        const s1 = await sealPdf(base, {
            reason: 'Soumission', name: 'Jean Dupont', signingTime: new Date('2026-08-26T09:00:00Z'),
            widgetRect: SIGNATURE_WIDGET_RECTS.demandeur, appearancePng: png, docMdpLevel: 2,
        });
        const s2 = await sealPdf(s1, {
            reason: 'Validation', name: 'Marie Martin', signingTime: new Date('2026-08-26T10:00:00Z'),
            widgetRect: SIGNATURE_WIDGET_RECTS.valideur, appearancePng: png,
        });
        const s3 = await sealPdf(s2, {
            reason: 'Paiement', name: 'Paul Payeur', signingTime: new Date('2026-08-26T11:00:00Z'),
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

        // Les deux premières visibles, la troisième invisible.
        expect(report.rects).toContain('[0 0 0 0]');
        expect(report.rects.filter(r => r !== '[0 0 0 0]')).toHaveLength(2);

        // Les DEUX dates sont réglées ensemble : /M porte bien l'heure demandée.
        expect(report.signatures[0].signingTime).toContain('20260826090000');
        expect(report.signatures[2].signingTime).toContain('20260826110000');
    }, 60_000);

    it('détecte l\'altération d\'un octet du contenu', async () => {
        const sealed = await sealPdf(base, {
            reason: 'Soumission', name: 'Jean Dupont', signingTime: new Date(),
            widgetRect: SIGNATURE_WIDGET_RECTS.demandeur, appearancePng: await signaturePng(), docMdpLevel: 2,
        });
        expect(verifySignatures(sealed).allValid).toBe(true);

        const tampered = Buffer.from(sealed);
        const at = tampered.indexOf('Jean Dupont');
        expect(at).toBeGreaterThan(0);
        tampered[at] ^= 0x01;

        expect(verifySignatures(tampered).allValid).toBe(false);
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
