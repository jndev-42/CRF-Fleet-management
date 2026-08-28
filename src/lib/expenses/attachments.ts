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

import {
    PDFDocument, PDFName, PDFRef, PDFDict, PDFArray, PDFStream, PDFNull,
    type PDFObject, type PDFPage,
} from 'pdf-lib';
import sharp from 'sharp';

export class AttachmentError extends Error {}

const SIG_NAME = PDFName.of('Sig');
const FT_NAME = PDFName.of('FT');

/**
 * Retire d'une page copiée toute annotation de signature numérique préexistante.
 *
 * ⚠️ NÉCESSAIRE. Un justificatif PDF peut déjà être signé (facture électronique,
 * export d'un parapheur électronique…). `copyPages` copie la page TELLE QUELLE, widget de
 * signature compris — le `/ByteRange` et le `/Contents` de cette signature
 * copiée restent ceux du fichier D'ORIGINE et n'ont donc plus aucun sens dans le
 * document fusionné, mais l'octet `/Type /Sig` y reste bel et bien présent.
 *
 * `countRevisions`/`assertRevisionCount` (scellement) comptent CE MARQUEUR
 * littéralement dans tout le fichier : sans ce nettoyage, un justificatif déjà
 * signé fait croire au pipeline de scellement qu'une signature existe déjà,
 * et le validateur suivant refuse de sceller (« Le PDF stocké porte N
 * signature(s) alors que le journal en annonce N-1 »).
 *
 * Détacher l'annotation de la page suffit ici : `collectGarbage` neutralise
 * ensuite tout ce qui n'est plus atteignable, y compris le dictionnaire de
 * signature lui-même.
 */
function stripForeignSignatures(doc: PDFDocument, page: PDFPage): void {
    const annots = page.node.Annots();
    if (!annots) return;

    const toRemove: PDFRef[] = [];
    for (let i = 0; i < annots.size(); i++) {
        const ref = annots.get(i);
        if (!(ref instanceof PDFRef)) continue;
        const dict = doc.context.lookup(ref);
        if (!(dict instanceof PDFDict)) continue;
        if (dict.get(FT_NAME) !== SIG_NAME) continue;
        toRemove.push(ref);
    }

    for (const ref of toRemove) page.node.removeAnnot(ref);
}

/**
 * Supprime tout objet devenu inatteignable depuis le catalogue du document.
 *
 * ⚠️ NÉCESSAIRE APRÈS `copyPages`. `pdf-lib` copie le graphe COMPLET atteignable
 * depuis une page, et sérialise ensuite tout objet enregistré dans son contexte,
 * référencé ou non. Or la signature d'un justificatif déjà scellé porte une règle
 * DocMDP dont le `/Data` désigne le CATALOGUE de son document d'origine : copier
 * la page fait donc entrer ce catalogue étranger — et son `/AcroForm` — dans le
 * nôtre. `stripForeignSignatures` coupe le lien mais laisse ces objets orphelins
 * dans le fichier.
 *
 * Le dégât est silencieux et grave : `@signpdf/placeholder-plain` cherche
 * `/AcroForm N 0 R` dans TOUT le fichier avant de décider s'il doit ré-émettre le
 * catalogue. L'occurrence orpheline le convainc qu'un formulaire existe déjà ; il
 * ne ré-émet donc rien, notre champ de signature n'est rattaché à aucun
 * `/AcroForm`, et le scellement échoue sur « Catalogue ré-émis introuvable ».
 *
 * ⚠️ ON NEUTRALISE, ON NE SUPPRIME PAS. `context.delete()` laisse des TROUS dans
 * la numérotation des objets ; `pdf-lib` émet alors une table de références en
 * plusieurs tronçons sans déclarer libres les numéros manquants. Acrobat répare
 * le fichier à l'ouverture — et sur un document certifié, réparer revient à
 * modifier : les signatures antérieures sont déclarées invalides alors que les
 * condensats sont intacts. Bisecté dans Acrobat : la même note sans cette passe
 * est saine. Remplacer le contenu par `null` conserve la numérotation dense, et
 * le corps de l'objet — donc toute chaîne parasite qu'il contenait — disparaît
 * tout autant.
 *
 * Effet de bord bienvenu : le document perd aussi les signets, arbres de noms et
 * métadonnées des justificatifs, que rien n'affiche — le PDF final s'allège.
 */
function collectGarbage(doc: PDFDocument): void {
    const atteints = new Set<string>();
    const pile: PDFObject[] = [];

    const empiler = (obj: PDFObject | undefined | null): void => {
        if (obj) pile.push(obj);
    };

    empiler(doc.context.trailerInfo.Root ?? doc.catalog);
    empiler(doc.context.trailerInfo.Info);
    empiler(doc.context.trailerInfo.Encrypt);

    while (pile.length) {
        const obj = pile.pop()!;
        if (obj instanceof PDFRef) {
            if (atteints.has(obj.tag)) continue;
            atteints.add(obj.tag);
            empiler(doc.context.lookup(obj));
        } else if (obj instanceof PDFDict) {
            for (const [, valeur] of obj.entries()) empiler(valeur);
        } else if (obj instanceof PDFArray) {
            for (let i = 0; i < obj.size(); i++) empiler(obj.get(i));
        } else if (obj instanceof PDFStream) {
            for (const [, valeur] of obj.dict.entries()) empiler(valeur);
        }
    }

    for (const [ref] of doc.context.enumerateIndirectObjects()) {
        if (!atteints.has(ref.tag)) doc.context.assign(ref, PDFNull);
    }
}

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
            for (const page of pages) {
                stripForeignSignatures(doc, page);
                doc.addPage(page);
            }
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

    collectGarbage(doc);

    const bytes = await doc.save({ useObjectStreams: false });
    return Buffer.from(bytes);
}
