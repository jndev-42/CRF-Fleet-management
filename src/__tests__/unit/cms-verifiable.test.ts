// @vitest-environment node
/**
 * Vérifie que les signatures produites sont acceptées par un validateur TIERS.
 *
 * ⚠️ POURQUOI OPENSSL ET PAS `verifySignatures`. Notre vérificateur maison
 * contrôle le condensat du document et la signature RSA — et il donnait « valide »
 * sur des PDF qu'Acrobat refusait. Le défaut portait sur le lien entre le
 * `SignerInfo` et le certificat embarqué, que nous ne contrôlions pas. Un
 * vérificateur ne peut pas attester sa propre sortie : il faut une implémentation
 * indépendante.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import forge from 'node-forge';

/** Certificat P12 jetable, sujet paramétrable. */
function makeP12(commonName: string, organization: string): string {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date(Date.now() - 86_400_000);
    cert.validity.notAfter = new Date(Date.now() + 86_400_000 * 365);
    const attrs = [
        { name: 'commonName', value: commonName },
        { name: 'organizationName', value: organization },
        { name: 'countryName', value: 'FR' },
    ];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.setExtensions([
        { name: 'basicConstraints', cA: false },
        { name: 'keyUsage', digitalSignature: true, nonRepudiation: true },
    ]);
    cert.sign(keys.privateKey, forge.md.sha256.create());
    return forge.util.encode64(
        forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], 'p', { algorithm: '3des' })).getBytes()
    );
}

/** Extrait le CMS détaché et les octets couverts de la dernière signature. */
function extractSignature(pdf: Buffer): { der: Buffer; covered: Buffer } {
    const s = pdf.toString('latin1');
    const matches = [...s.matchAll(/\/ByteRange\s*\[([^\]]*)\]/g)];
    const m = matches[matches.length - 1];
    const [o1, l1, o2, l2] = m[1].trim().split(/\s+/).map(Number);
    const cStart = s.indexOf('/Contents <', m.index!) + 11;
    const raw = Buffer.from(s.slice(cStart, s.indexOf('>', cStart)).replace(/[^0-9A-Fa-f]/g, ''), 'hex');
    const len = raw[1] < 0x80 ? 2 + raw[1] : 4 + ((raw[2] << 8) | raw[3]);
    return {
        der: raw.subarray(0, len),
        covered: Buffer.concat([pdf.subarray(o1, o1 + l1), pdf.subarray(o2, o2 + l2)]),
    };
}

/** Verdict d'OpenSSL sur un CMS détaché. `-noverify` ignore la chaîne de confiance. */
function opensslVerdict(der: Buffer, covered: Buffer): string {
    const dir = mkdtempSync(join(tmpdir(), 'cms-'));
    try {
        const derPath = join(dir, 's.der');
        const dataPath = join(dir, 'd.bin');
        writeFileSync(derPath, der);
        writeFileSync(dataPath, covered);
        try {
            execFileSync('openssl', [
                'cms', '-verify', '-binary', '-inform', 'DER',
                '-in', derPath, '-content', dataPath, '-noverify', '-out', '/dev/null',
            ], { stdio: ['ignore', 'ignore', 'pipe'] });
            return 'ok';
        } catch (e: unknown) {
            const err = e as { stderr?: Buffer };
            return err.stderr?.toString() ?? 'échec';
        }
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

async function sealWith(p12Base64: string): Promise<Buffer> {
    process.env.SIGNING_CERT_P12_BASE64 = p12Base64;
    process.env.SIGNING_CERT_PASSPHRASE = 'p';
    // Import tardif : `signature.ts` met le buffer du certificat en cache dès le
    // premier appel, il faut donc le charger après avoir posé l'environnement.
    const { sealPdf } = await import('@/lib/pdf/signature');
    const { SIGNATURE_WIDGET_RECTS } = await import('@/lib/expenses/signature-layout');
    const { renderToBuffer } = await import('@react-pdf/renderer');
    const { createElement } = await import('react');
    const ExpensePdfDocument = (await import('@/components/expenses/ExpensePdfDocument')).default;
    const report = {
        id: 'x', userName: 'Admin', userEmail: 'a@d.l', submittedAt: '2026-08-28T09:00:00Z',
        missionName: 'M', missionDate: '2026-08-20', status: 'soumis', imputation: 'DLUS',
        customImputation: null, requestRefund: true, noReceiptDeclaration: false, total: 10,
        ulId: 'ul-paris-18', ulName: 'P18', ulStampImage: null, userFunction: 'B',
        userSignature: null, validatedAt: null, validatorName: null, validatorSignature: null,
        items: [{ label: 'D1', amount: 10 }],
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- le composant PDF n'exporte pas ses props
    const el = createElement(ExpensePdfDocument as any, { report, logoSrc: '', forSealing: true }) as any;
    const base = Buffer.from(await renderToBuffer(el));

    return sealPdf(base, {
        reason: 'Test', name: 'Admin', signingTime: new Date(),
        widgetRect: SIGNATURE_WIDGET_RECTS.demandeur, docMdpLevel: 2,
    });
}

describe('vérifiabilité par un tiers (OpenSSL)', () => {
    it('produit un CMS qu\'OpenSSL accepte, avec un sujet de certificat ASCII', async () => {
        const sealed = await sealWith(makeP12('CRF Notes de frais', 'Croix-Rouge francaise'));
        const { der, covered } = extractSignature(sealed);
        expect(opensslVerdict(der, covered)).toBe('ok');
    }, 60_000);
});
