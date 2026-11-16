import { promises as fs } from 'fs';
import path from 'path';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

/**
 * Remplissage du PDF modèle officiel « Rapport de mission – Dispositif
 * Prévisionnel de Secours » (CRF, juillet 2009) avec les données d'un compte rendu
 * et les deux signatures saisies dans l'appli.
 *
 * Le modèle n'a pas de champs de formulaire : texte et images sont posés aux
 * coordonnées de ses cases. Les coordonnées ci-dessous sont en points PDF, mesurées
 * DEPUIS LE HAUT de la page A4 (596 x 842) ; `fromTop` les convertit à l'envers de
 * pdf-lib (origine en bas). Le PDF produit n'est jamais régénéré après envoi.
 *
 * Pas de scellement cryptographique : la signature est une image et une date.
 */

const TEMPLATE_PATH = path.join(process.cwd(), 'src', 'lib', 'missions', 'report-template', 'rapport-mission-dps.pdf');

/** Données du compte rendu reportées dans le PDF. */
export interface MissionReportPdfData {
    mission_name: string;
    location: string;
    start_time: string | null;
    end_time: string | null;
    arrival_time: string | null;
    departure_time: string | null;
    mission_lead_name: string | null;
    mission_lead_phone: string | null;
    victim_count: number;
    /** Répartition par type de prise en charge — clés `SOINS`, `DECHARGE`, `DAE`, `EVAC_CRF`, `EVAC_AUTRES`. */
    intervention_types: Record<string, number>;
    /** Répartition par nature clinique — clés `PETITS_SOINS`, `MALAISE`, `TRAUMATISME`, `INCONSCIENCE`, `ARRET_CARDIAQUE`. */
    intervention_natures: Record<string, number>;
    crf_observations: string | null;
    organizer_observations: string | null;
    organizer_name: string | null;
    organizer_function: string | null;
}

/** Une signature : image PNG (data URL), date de signature (ISO) et nom du signataire. */
export interface MissionReportPdfSignature {
    image: string;
    signedAt: string;
    name: string;
    functionTitle?: string | null;
}

export interface MissionReportPdfSignatures {
    /** « Responsable de l'équipe » — le soumetteur. */
    team: MissionReportPdfSignature;
    /** « Responsable de l'organisation » — l'organisateur. */
    organizer: MissionReportPdfSignature;
}

const TEXT_SIZE = 9;
const LABEL_SIZE = 8;
const SMALL_SIZE = 7;
const INK = rgb(0.06, 0.09, 0.16);

/** Cases à une valeur : abscisse, ligne (haut de l'étiquette) et largeur disponible. */
const CELLS = {
    mission_name: { x: 210, y: 171.8, width: 325 },
    location: { x: 210, y: 190.6, width: 325 },
    start_time: { x: 210, y: 209.3, width: 125 },
    end_time: { x: 432, y: 209.3, width: 103 },
    mission_lead_name: { x: 210, y: 228.1, width: 176 },
    mission_lead_phone: { x: 432, y: 228.1, width: 103 },
    arrival_time: { x: 231, y: 276.1, width: 82 },
    departure_time: { x: 451, y: 276.1, width: 84 },
    victim_count: { x: 231, y: 295.6, width: 82 },
    SOINS: { x: 231, y: 314.3, width: 82 },
    DECHARGE: { x: 231, y: 333.1, width: 82 },
    DAE: { x: 231, y: 351.8, width: 82 },
    EVAC_CRF: { x: 231, y: 370.6, width: 82 },
    EVAC_AUTRES: { x: 231, y: 389.3, width: 82 },
    PETITS_SOINS: { x: 451, y: 295.6, width: 84 },
    MALAISE: { x: 451, y: 314.3, width: 84 },
    TRAUMATISME: { x: 451, y: 333.1, width: 84 },
    INCONSCIENCE: { x: 451, y: 351.8, width: 84 },
    ARRET_CARDIAQUE: { x: 451, y: 370.6, width: 84 },
} as const;

/** Décalage entre le haut de l'étiquette d'une case et la ligne de base du texte. */
const BASELINE_OFFSET = 7.5;

/** Zones d'observations : haut, hauteur et ligne de l'étiquette. */
const OBSERVATIONS = {
    x: 70,
    width: 464,
    organizer: { top: 455, height: 88, labelY: 439.2 },
    crf: { top: 569, height: 100 },
} as const;

/** Cases de signature : abscisse, largeur, haut et bas de la zone vierge. */
const SIGNATURE_BOXES = {
    team: { x: 68, width: 156 },
    organizer: { x: 229, width: 158 },
    top: 716,
    bottom: 784,
} as const;

/** Chaîne affichable avec la police Helvetica (WinAnsi) : le reste devient « ? ». */
function toWinAnsi(text: string, font: PDFFont): string {
    const supported = new Set(font.getCharacterSet());
    let out = '';
    for (const ch of text.replace(/\r\n?/g, '\n')) {
        const code = ch.codePointAt(0) ?? 0;
        if (ch === '\n') out += ch;
        else if (code === 0x09) out += ' ';
        else if (code === 0x202f || code === 0x00a0 || code === 0x2009) out += ' ';
        else if (supported.has(code)) out += ch;
        else out += '?';
    }
    return out;
}

/** Tronque une ligne unique à la largeur disponible. */
function fitLine(text: string, font: PDFFont, size: number, maxWidth: number): string {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (font.widthOfTextAtSize(clean, size) <= maxWidth) return clean;
    let out = clean;
    while (out.length > 0 && font.widthOfTextAtSize(`${out}...`, size) > maxWidth) out = out.slice(0, -1);
    return `${out.trimEnd()}...`;
}

/** Retour à la ligne par mots, mots trop longs coupés. */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const lines: string[] = [];
    for (const paragraph of text.split('\n')) {
        if (paragraph.trim() === '') { lines.push(''); continue; }
        let current = '';
        for (const word of paragraph.split(/\s+/).filter(Boolean)) {
            let piece = word;
            while (font.widthOfTextAtSize(piece, size) > maxWidth) {
                // Plus grand préfixe qui tient (recherche dichotomique), au moins un caractère.
                let lo = 1;
                let hi = piece.length - 1;
                while (lo < hi) {
                    const mid = Math.ceil((lo + hi) / 2);
                    if (font.widthOfTextAtSize(piece.slice(0, mid), size) <= maxWidth) lo = mid;
                    else hi = mid - 1;
                }
                const cut = lo;
                if (current) { lines.push(current); current = ''; }
                lines.push(piece.slice(0, cut));
                piece = piece.slice(cut);
            }
            const candidate = current ? `${current} ${piece}` : piece;
            if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
                current = candidate;
            } else {
                lines.push(current);
                current = piece;
            }
        }
        lines.push(current);
    }
    return lines;
}

/** Date et heure de signature, à l'heure de Paris : « 16/11/2026 à 14:32 ». */
export function formatSignatureDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const parts = new Intl.DateTimeFormat('fr-FR', {
        timeZone: 'Europe/Paris',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(d);
    const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
    return `${get('day')}/${get('month')}/${get('year')} à ${get('hour')}:${get('minute')}`;
}

function decodePngDataUrl(dataUrl: string): Uint8Array {
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    return new Uint8Array(Buffer.from(base64, 'base64'));
}

interface DrawContext {
    page: PDFPage;
    font: PDFFont;
    height: number;
}

function drawCell(ctx: DrawContext, cell: { x: number; y: number; width: number }, value: string | number | null | undefined, size = TEXT_SIZE) {
    if (value === null || value === undefined || value === '') return;
    const text = fitLine(toWinAnsi(String(value), ctx.font), ctx.font, size, cell.width);
    ctx.page.drawText(text, { x: cell.x, y: ctx.height - (cell.y + BASELINE_OFFSET), size, font: ctx.font, color: INK });
}

function drawParagraph(ctx: DrawContext, text: string | null, zone: { top: number; height: number }) {
    if (!text || !text.trim()) return;
    const lineHeight = TEXT_SIZE + 2.5;
    const maxLines = Math.floor(zone.height / lineHeight);
    // Plafond de lecture : seules quelques lignes tiennent dans la case de toute façon.
    const lines = wrapText(toWinAnsi(text.slice(0, 3000), ctx.font), ctx.font, TEXT_SIZE, OBSERVATIONS.width - 6);
    const shown = lines.slice(0, maxLines);
    if (lines.length > maxLines && shown.length > 0) {
        shown[shown.length - 1] = fitLine(`${shown[shown.length - 1]} ...`, ctx.font, TEXT_SIZE, OBSERVATIONS.width - 6);
    }
    shown.forEach((line, i) => {
        if (!line) return;
        ctx.page.drawText(line, {
            x: OBSERVATIONS.x + 2,
            y: ctx.height - (zone.top + TEXT_SIZE + i * lineHeight),
            size: TEXT_SIZE,
            font: ctx.font,
            color: INK,
        });
    });
}

async function drawSignature(
    ctx: DrawContext,
    pdf: PDFDocument,
    box: { x: number; width: number },
    signature: MissionReportPdfSignature,
) {
    const imageBottom = SIGNATURE_BOXES.bottom - 20;
    const areaHeight = imageBottom - SIGNATURE_BOXES.top;
    const png = await pdf.embedPng(decodePngDataUrl(signature.image));
    const scale = Math.min(box.width / png.width, areaHeight / png.height);
    const w = png.width * scale;
    const h = png.height * scale;
    ctx.page.drawImage(png, {
        x: box.x + (box.width - w) / 2,
        y: ctx.height - (SIGNATURE_BOXES.top + (areaHeight - h) / 2 + h),
        width: w,
        height: h,
    });

    const who = signature.functionTitle ? `${signature.name} (${signature.functionTitle})` : signature.name;
    const whoLine = fitLine(toWinAnsi(who, ctx.font), ctx.font, SMALL_SIZE, box.width - 2);
    ctx.page.drawText(whoLine, { x: box.x + 1, y: ctx.height - (SIGNATURE_BOXES.bottom - 11), size: SMALL_SIZE, font: ctx.font, color: INK });
    const dateLine = `Le ${formatSignatureDate(signature.signedAt)}`;
    ctx.page.drawText(toWinAnsi(dateLine, ctx.font), { x: box.x + 1, y: ctx.height - (SIGNATURE_BOXES.bottom - 3), size: SMALL_SIZE, font: ctx.font, color: INK });
}

/**
 * Remplit le PDF modèle et renvoie le document (une page A4).
 * Lève si le modèle est introuvable ou si une image de signature n'est pas un PNG valide.
 */
export async function fillMissionReportPdf(
    data: MissionReportPdfData,
    signatures: MissionReportPdfSignatures,
): Promise<Uint8Array> {
    const template = await fs.readFile(TEMPLATE_PATH);
    const pdf = await PDFDocument.load(new Uint8Array(template));
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const page = pdf.getPages()[0];
    const ctx: DrawContext = { page, font, height: page.getHeight() };

    drawCell(ctx, CELLS.mission_name, data.mission_name);
    drawCell(ctx, CELLS.location, data.location);
    drawCell(ctx, CELLS.start_time, data.start_time);
    drawCell(ctx, CELLS.end_time, data.end_time);
    drawCell(ctx, CELLS.mission_lead_name, data.mission_lead_name);
    drawCell(ctx, CELLS.mission_lead_phone, data.mission_lead_phone);
    drawCell(ctx, CELLS.arrival_time, data.arrival_time);
    drawCell(ctx, CELLS.departure_time, data.departure_time);
    drawCell(ctx, CELLS.victim_count, data.victim_count);

    for (const key of ['SOINS', 'DECHARGE', 'DAE', 'EVAC_CRF', 'EVAC_AUTRES'] as const) {
        drawCell(ctx, CELLS[key], data.intervention_types[key] ?? 0);
    }
    for (const key of ['PETITS_SOINS', 'MALAISE', 'TRAUMATISME', 'INCONSCIENCE', 'ARRET_CARDIAQUE'] as const) {
        drawCell(ctx, CELLS[key], data.intervention_natures[key] ?? 0);
    }

    // Organisateur : nom et fonction à droite de l'étiquette, puis observations.
    const organizerWho = [
        data.organizer_name ? `Nom : ${data.organizer_name}` : null,
        data.organizer_function ? `Fonction : ${data.organizer_function}` : null,
    ].filter(Boolean).join('  -  ');
    drawCell(ctx, { x: 130, y: OBSERVATIONS.organizer.labelY, width: 400 }, organizerWho, LABEL_SIZE);
    drawParagraph(ctx, data.organizer_observations, OBSERVATIONS.organizer);
    drawParagraph(ctx, data.crf_observations, OBSERVATIONS.crf);

    await drawSignature(ctx, pdf, SIGNATURE_BOXES.team, signatures.team);
    await drawSignature(ctx, pdf, SIGNATURE_BOXES.organizer, signatures.organizer);

    return pdf.save();
}
