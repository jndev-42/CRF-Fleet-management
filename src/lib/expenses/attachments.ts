/**
 * Intégration des justificatifs dans le PDF de note de frais.
 *
 * Remplace le stockage sur Google Drive : chaque justificatif (photo ou PDF)
 * devient une page supplémentaire du document, AVANT le premier scellement — le
 * document final, page(s) comprises, est ce que DocMDP verrouille.
 *
 * ⚠️ ORDRE D'APPEL. `appendJustificatifs` doit s'exécuter sur le PDF du
 * formulaire APRÈS `assertPageGeometry`/le contrôle « une seule page », qui
 * portent sur le formulaire SEUL. Le document fusionné a légitimement plusieurs
 * pages ; ce n'est pas ce que ces gardes-fous vérifient.
 *
 * ⚠️ `useObjectStreams: false` EST OBLIGATOIRE. Par défaut, `pdf-lib` émet un PDF
 * à flux de références croisées (xref stream, PDF 1.5+). Le parseur bas niveau de
 * `@signpdf/placeholder-plain` (`readPdf.js`) cherche littéralement le mot-clé
 * `trailer` — absent d'un tel PDF. Sans ce réglage, la pose du placeholder de
 * signature échoue silencieusement à localiser la structure du document.
 */

import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';

export class AttachmentError extends Error {}

export interface JustificatifFile {
    buffer: Buffer;
    mime: string;
}

/**
 * Plus grande dimension (px) conservée pour un justificatif photo.
 *
 * Un reçu se lit à l'écran ou à l'impression ; au-delà, on ne fait qu'alourdir
 * le PDF sans gagner en lisibilité. Mesuré empiriquement suffisant pour relire
 * un ticket de caisse à l'écran en zoomant.
 */
const MAX_DIMENSION_PX = 1900;

/** Qualité JPEG des justificatifs — mozjpeg, sans perte perceptible à cette taille. */
const JPEG_QUALITY = 72;

/**
 * Compresse un justificatif image pour l'intégration PDF.
 *
 * `rotate()` sans argument applique l'orientation EXIF puis la retire du fichier
 * — indispensable : un PDF n'a pas de notion d'orientation EXIF, une photo prise
 * verticalement au téléphone s'afficherait couchée sans ce redressement.
 */
export async function compressJustificatifImage(input: Buffer): Promise<Buffer> {
    return sharp(input)
        .rotate()
        .resize({
            width: MAX_DIMENSION_PX,
            height: MAX_DIMENSION_PX,
            fit: 'inside',
            withoutEnlargement: true,
        })
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
        .toBuffer();
}

/**
 * Ajoute les justificatifs comme pages supplémentaires à la suite du formulaire.
 *
 * - Image → compressée puis dessinée seule sur une page aux dimensions du
 *   formulaire (A4), centrée, marges conservées.
 * - PDF → ses pages sont copiées telles quelles à la suite : un justificatif déjà
 *   au format PDF (billet électronique, facture) ne perd rien à être recompressé,
 *   la fusion de pages préserve sa qualité d'origine sans y toucher.
 *
 * @throws {AttachmentError} si un fichier n'est ni une image ni un PDF valide.
 */
export async function appendJustificatifs(
    basePdf: Buffer,
    files: JustificatifFile[]
): Promise<Buffer> {
    if (files.length === 0) return basePdf;

    const doc = await PDFDocument.load(basePdf);
    const { width, height } = doc.getPage(0).getSize();

    for (const file of files) {
        if (file.mime === 'application/pdf') {
            let source: PDFDocument;
            try {
                source = await PDFDocument.load(file.buffer, { ignoreEncryption: true });
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                throw new AttachmentError(`Justificatif PDF illisible : ${msg}`);
            }
            const pages = await doc.copyPages(source, source.getPageIndices());
            for (const page of pages) doc.addPage(page);
            continue;
        }

        if (!file.mime.startsWith('image/')) {
            throw new AttachmentError(`Type de justificatif non pris en charge : ${file.mime}`);
        }

        let jpeg: Buffer;
        try {
            jpeg = await compressJustificatifImage(file.buffer);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            throw new AttachmentError(`Justificatif image illisible : ${msg}`);
        }

        const embedded = await doc.embedJpg(jpeg);
        const margin = 28;
        const maxW = width - margin * 2;
        const maxH = height - margin * 2;
        const scale = Math.min(maxW / embedded.width, maxH / embedded.height, 1);
        const w = embedded.width * scale;
        const h = embedded.height * scale;

        const page = doc.addPage([width, height]);
        page.drawImage(embedded, {
            x: (width - w) / 2,
            y: (height - h) / 2,
            width: w,
            height: h,
        });
    }

    const bytes = await doc.save({ useObjectStreams: false });
    return Buffer.from(bytes);
}
