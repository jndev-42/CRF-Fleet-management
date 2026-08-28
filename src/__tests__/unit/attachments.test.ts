// @vitest-environment node
/**
 * Tests de l'intégration des justificatifs comme pages du PDF.
 *
 * `useObjectStreams: false` est vérifié structurellement : sans ce réglage,
 * `plainAddPlaceholder` (recherche littérale du mot-clé `trailer`) échouerait à
 * poser le placeholder de signature sur le document fusionné — régression
 * silencieuse jusqu'au premier scellement en production.
 */

import { describe, it, expect } from 'vitest';
import { PDFDocument, rgb } from 'pdf-lib';
import sharp from 'sharp';
import { installTestCert } from '../fixtures/signing-cert';
import { sealPdf } from '@/lib/pdf/signature';
import { countRevisions } from '@/lib/pdf/incremental';
import {
    appendJustificatifs, compressJustificatifImage, AttachmentError,
} from '@/lib/expenses/attachments';

installTestCert();

async function makeBasePdf(): Promise<Buffer> {
    const doc = await PDFDocument.create();
    doc.addPage([595.28, 841.89]);
    return Buffer.from(await doc.save({ useObjectStreams: false }));
}

async function makeSourcePdf(pageCount = 1): Promise<Buffer> {
    const doc = await PDFDocument.create();
    for (let i = 0; i < pageCount; i++) {
        const page = doc.addPage([300, 200]);
        page.drawText(`Facture ${i + 1}`, { x: 20, y: 100, size: 14, color: rgb(0, 0, 0) });
    }
    return Buffer.from(await doc.save());
}

/** Simule un justificatif déjà signé numériquement par son émetteur (facture électronique). */
async function makeSignedReceipt(): Promise<Buffer> {
    const doc = await PDFDocument.create();
    const page = doc.addPage([300, 200]);
    page.drawText('Facture 2026-042 — 55,00 €', { x: 20, y: 100, size: 14, color: rgb(0, 0, 0) });
    const unsigned = Buffer.from(await doc.save({ useObjectStreams: false }));
    return sealPdf(unsigned, {
        reason: 'Signature électronique de la facture',
        name: 'Émetteur Facture',
        signingTime: new Date('2026-01-01T00:00:00.000Z'),
    });
}

async function makeJpeg(width: number, height: number): Promise<Buffer> {
    return sharp({ create: { width, height, channels: 3, background: { r: 180, g: 40, b: 40 } } })
        .jpeg({ quality: 100 })
        .toBuffer();
}

describe('compressJustificatifImage', () => {
    it('produit un JPEG valide', async () => {
        const input = await makeJpeg(500, 400);
        const out = await compressJustificatifImage(input);
        const meta = await sharp(out).metadata();
        expect(meta.format).toBe('jpeg');
    });

    it('réduit une image surdimensionnée sous la limite', async () => {
        const input = await makeJpeg(4000, 3000);
        const out = await compressJustificatifImage(input);
        const meta = await sharp(out).metadata();
        expect(meta.width).toBeLessThanOrEqual(1900);
        expect(meta.height).toBeLessThanOrEqual(1900);
    });

    it('n\'agrandit jamais une petite image', async () => {
        const input = await makeJpeg(200, 150);
        const out = await compressJustificatifImage(input);
        const meta = await sharp(out).metadata();
        expect(meta.width).toBe(200);
        expect(meta.height).toBe(150);
    });

    it('allège nettement un fichier non compressé', async () => {
        const input = await makeJpeg(3000, 2000); // qualité 100, non compressée
        const out = await compressJustificatifImage(input);
        expect(out.length).toBeLessThan(input.length / 2);
    });
});

describe('appendJustificatifs', () => {
    it('sans fichier, renvoie le PDF de base inchangé', async () => {
        const base = await makeBasePdf();
        const out = await appendJustificatifs(base, []);
        expect(out).toBe(base);
    });

    it('ajoute une page par justificatif image', async () => {
        const base = await makeBasePdf();
        const jpeg = await makeJpeg(800, 600);
        const out = await appendJustificatifs(base, [{ buffer: jpeg, mime: 'image/jpeg' }]);
        const merged = await PDFDocument.load(out);
        expect(merged.getPageCount()).toBe(2);
    });

    it('copie toutes les pages d\'un justificatif PDF', async () => {
        const base = await makeBasePdf();
        const receipt = await makeSourcePdf(2);
        const out = await appendJustificatifs(base, [{ buffer: receipt, mime: 'application/pdf' }]);
        const merged = await PDFDocument.load(out);
        expect(merged.getPageCount()).toBe(3); // 1 formulaire + 2 pages du justificatif
    });

    it('combine plusieurs justificatifs, images et PDF, dans l\'ordre', async () => {
        const base = await makeBasePdf();
        const jpeg = await makeJpeg(400, 300);
        const receipt = await makeSourcePdf(1);
        const out = await appendJustificatifs(base, [
            { buffer: jpeg, mime: 'image/jpeg' },
            { buffer: receipt, mime: 'application/pdf' },
        ]);
        const merged = await PDFDocument.load(out);
        expect(merged.getPageCount()).toBe(3);
    });

    it('émet un PDF à table xref classique — jamais de flux de références croisées', async () => {
        // @signpdf/placeholder-plain (readPdf.js) cherche littéralement le mot-clé
        // `trailer` : un xref stream (défaut pdf-lib) le rend introuvable.
        const base = await makeBasePdf();
        const jpeg = await makeJpeg(400, 300);
        const out = await appendJustificatifs(base, [{ buffer: jpeg, mime: 'image/jpeg' }]);
        const text = out.toString('latin1');
        expect(text).toContain('\ntrailer');
        expect(text).not.toContain('/Type /XRef');
    });

    it('rejette un type MIME non pris en charge', async () => {
        const base = await makeBasePdf();
        await expect(appendJustificatifs(base, [
            { buffer: Buffer.from('x'), mime: 'application/zip' },
        ])).rejects.toThrow(AttachmentError);
    });

    it('rejette une image illisible', async () => {
        const base = await makeBasePdf();
        await expect(appendJustificatifs(base, [
            { buffer: Buffer.from('pas une image'), mime: 'image/jpeg' },
        ])).rejects.toThrow(AttachmentError);
    });

    it('rejette un PDF illisible', async () => {
        const base = await makeBasePdf();
        await expect(appendJustificatifs(base, [
            { buffer: Buffer.from('pas un pdf'), mime: 'application/pdf' },
        ])).rejects.toThrow(AttachmentError);
    });

    it('centre l\'image dans les dimensions de la page du formulaire', async () => {
        const base = await makeBasePdf();
        const jpeg = await makeJpeg(800, 600);
        const out = await appendJustificatifs(base, [{ buffer: jpeg, mime: 'image/jpeg' }]);
        const merged = await PDFDocument.load(out);
        const [formPage, imagePage] = merged.getPages();
        expect(imagePage.getSize()).toEqual(formPage.getSize());
    });

    // Régression : une facture déjà signée par son émetteur, jointe comme
    // justificatif, faisait échouer la validation par le responsable — le
    // scellement comptait la signature étrangère copiée par `copyPages` en plus
    // de la nôtre et refusait (« Le PDF stocké porte 2 signature(s) alors que
    // le journal en annonce 1 »).
    it('retire les signatures déjà présentes dans un justificatif PDF', async () => {
        const base = await makeBasePdf();
        const signedReceipt = await makeSignedReceipt();
        expect(countRevisions(signedReceipt)).toBe(1); // la fixture est bien signée

        const out = await appendJustificatifs(base, [{ buffer: signedReceipt, mime: 'application/pdf' }]);

        expect(countRevisions(out)).toBe(0);
        const merged = await PDFDocument.load(out);
        expect(merged.getPageCount()).toBe(2); // le contenu visuel du justificatif reste intact
    });
});
