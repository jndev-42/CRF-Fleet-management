/**
 * Démonstration de bout en bout de la chaîne de scellement.
 *
 * Produit un jeu de PDF dans `spike/` (ignoré par git) permettant de rejouer à
 * tout moment le contrôle visuel sous Adobe Acrobat Reader — le seul oracle de la
 * détection d'altération et de l'acceptation de la règle DocMDP.
 *
 * ⚠️ Utilise les MODULES DE PRODUCTION, jamais une copie : le prototype jetable
 * de la phase d'exploration a été promu dans `src/lib/pdf/`, et le dupliquer ici
 * ferait diverger deux implémentations cryptographiques.
 *
 * Prérequis : SIGNING_CERT_P12_BASE64 et SIGNING_CERT_PASSPHRASE dans .env.local
 * (voir `scripts/generate-signing-cert.ts`).
 *
 * Usage : npx tsx scripts/spike-signature.ts
 */

import fs from 'fs';
import path from 'path';
import { createElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import sharp from 'sharp';
import dotenv from 'dotenv';
import ExpensePdfDocument from '../src/components/expenses/ExpensePdfDocument';
import { sealPdf, assertSigningCertConfigured } from '../src/lib/pdf/signature';
import { verifySignatures } from '../src/lib/pdf/verify';
import { SIGNATURE_FIELDS, assertPageGeometry } from '../src/lib/expenses/signature-layout';
import { addSignatureFields } from '../src/lib/pdf/fields';

dotenv.config({ path: '.env.local' });

const OUT = path.join(process.cwd(), 'spike');

async function buildBasePdf(itemCount: number): Promise<Buffer> {
    const report = {
        id: 'spike-0001',
        userName: 'Jean Dupont',
        userEmail: 'jean.dupont@dev.local',
        submittedAt: new Date().toISOString(),
        missionName: 'Maraude sociale — secteur Nord',
        missionDate: '2026-08-20',
        status: 'soumis',
        imputation: 'DLUS',
        customImputation: null,
        requestRefund: true,
        noReceiptDeclaration: false,
        total: itemCount * 12.5,
        ulId: 'ul-paris-18',
        ulName: 'Paris 18',
        ulStampImage: null,
        userFunction: 'Bénévole local',
        userSignature: null,
        validatorName: null,
        validatedAt: null,
        validatorSignature: null,
        items: Array.from({ length: itemCount }, (_, i) => ({
            label: `Frais de déplacement n°${i + 1}`,
            amount: 12.5,
        })),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- script de démonstration
    const el = createElement(ExpensePdfDocument as any, { report, logoSrc: '', forSealing: true }) as any;
    return Buffer.from(await renderToBuffer(el));
}

/** Simule le PNG produit par ElectronicSignatureModal. */
async function handwritten(text: string): Promise<Buffer> {
    return sharp(Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="140">
           <text x="20" y="85" font-family="cursive" font-size="34" font-style="italic" fill="#1a1a8c">${text}</text>
           <path d="M18 100 Q 80 118, 140 96 T 262 104" stroke="#1a1a8c" stroke-width="2.5" fill="none"/>
         </svg>`
    )).png().toBuffer();
}

async function main(): Promise<void> {
    assertSigningCertConfigured();
    fs.mkdirSync(OUT, { recursive: true });

    const form = await buildBasePdf(6);
    assertPageGeometry(form);
    // Les trois champs sont posés avant tout scellement : la certification qui
    // suit n'autorise plus que le remplissage de champs existants.
    const base = await addSignatureFields(form, [...SIGNATURE_FIELDS]);
    fs.writeFileSync(path.join(OUT, '00-base.pdf'), base);
    console.log(`00-base       ${base.length} o  (3 champs de signature)`);

    const s1 = await sealPdf(base, {
        reason: 'Soumission de la note de frais par le demandeur',
        name: 'Jean Dupont',
        signingTime: new Date('2026-08-26T09:00:00Z'),
        fieldName: SIGNATURE_FIELDS[0].name,
        appearancePng: await handwritten('J. Dupont'),
        docMdpLevel: 2,
    });
    fs.writeFileSync(path.join(OUT, '01-sealed.pdf'), s1);
    console.log(`01-sealed     ${s1.length} o  (#1 visible + DocMDP P=2)`);

    const s2 = await sealPdf(s1, {
        reason: 'Validation de la note de frais',
        name: 'Marie Martin',
        signingTime: new Date('2026-08-26T10:00:00Z'),
        fieldName: SIGNATURE_FIELDS[1].name,
        appearancePng: await handwritten('M. Martin'),
    });
    fs.writeFileSync(path.join(OUT, '02-sealed.pdf'), s2);
    console.log(`02-sealed     ${s2.length} o  (#2 visible)`);

    // Champ de surface nulle : la signature existe sans rien rendre sur la page.
    const s3 = await sealPdf(s2, {
        reason: 'Paiement de la note de frais',
        name: 'Paul Payeur',
        signingTime: new Date('2026-08-26T11:00:00Z'),
        fieldName: SIGNATURE_FIELDS[2].name,
    });
    fs.writeFileSync(path.join(OUT, '03-sealed.pdf'), s3);
    console.log(`03-sealed     ${s3.length} o  (#3 invisible)`);

    // Document altéré, pour vérifier la détection sous Acrobat.
    const tampered = Buffer.from(s3);
    const at = tampered.indexOf('Jean Dupont');
    if (at > 0) {
        tampered[at] ^= 0x01;
        fs.writeFileSync(path.join(OUT, '04-tampered.pdf'), tampered);
        console.log(`04-tampered   1 octet inversé à l'offset ${at}`);
    }

    const r = verifySignatures(s3);
    console.log(`\nrévisions ${r.revisions} · pages ${r.pages} · DocMDP P=${r.docMdp.level} · /Perms ${r.docMdp.permsPresent} · /Version ${r.catalogVersion}`);
    console.log(`/Rect  ${r.rects.join('  ')}`);
    for (const s of r.signatures) {
        console.log(`  #${s.index} ${String(s.name).padEnd(14)} ${s.signingTime} → ${s.digestValid ? 'DIGEST OK' : 'INVALIDE'}`);
    }
    console.log(`\nPréfixes immuables  : ${s2.subarray(0, s1.length).equals(s1) && s3.subarray(0, s2.length).equals(s2)}`);
    console.log(`Altération détectée : ${at > 0 ? !verifySignatures(tampered).allValid : 'n/a'}`);
    console.log('\nContrôle manuel : ouvrir spike/03-sealed.pdf et spike/04-tampered.pdf dans Adobe Acrobat Reader.');
}

main().catch(e => { console.error('Échec :', e); process.exit(1); });
