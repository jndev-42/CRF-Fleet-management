// @vitest-environment node
/**
 * Tests unitaires — remplissage du PDF modèle « Rapport de mission DPS/PAPS ».
 */
import { describe, it, expect } from 'vitest';
import path from 'path';
import { pathToFileURL } from 'url';
import { PDFDocument } from 'pdf-lib';
import { fillMissionReportPdf, formatSignatureDate, type MissionReportPdfData } from '@/lib/missions/report-pdf';

/** PNG 1x1 valide (data URL), comme en produit une signature dessinée. */
const PNG_1X1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const DATA: MissionReportPdfData = {
    mission_name: 'Poste de Secours Fête de Quartier',
    location: 'Salle des fêtes Paris 18',
    start_time: '08:30',
    end_time: '19:45',
    arrival_time: '08:00',
    departure_time: '20:15',
    mission_lead_name: 'Alice Martin',
    mission_lead_phone: '06 12 34 56 78',
    victim_count: 7,
    intervention_types: { SOINS: 3, DECHARGE: 1, DAE: 1, EVAC_CRF: 1, EVAC_AUTRES: 1 },
    intervention_natures: { PETITS_SOINS: 4, MALAISE: 2, TRAUMATISME: 1 },
    crf_observations: 'RAS côté équipe.\nBonne coordination.',
    organizer_observations: 'Très satisfait.',
    organizer_name: 'Bob Durand',
    organizer_function: 'Président',
};

const SIGNATURES = {
    team: { image: PNG_1X1, signedAt: '2026-11-16T13:32:00.000Z', name: 'Alice Martin', functionTitle: 'Responsable' },
    organizer: { image: PNG_1X1, signedAt: '2026-11-16T13:35:00.000Z', name: 'Bob Durand', functionTitle: 'Président' },
};

async function extractText(bytes: Uint8Array): Promise<string> {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
        path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs'),
    ).href;
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
    const page = await doc.getPage(1);
    const content = await page.getTextContent();
    return content.items.map(i => ('str' in i ? i.str : '')).join(' ');
}

describe('fillMissionReportPdf', () => {
    it('produit un PDF valide d’une seule page A4', async () => {
        const bytes = await fillMissionReportPdf(DATA, SIGNATURES);
        expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe('%PDF-');
        const doc = await PDFDocument.load(bytes);
        expect(doc.getPageCount()).toBe(1);
        const { width, height } = doc.getPage(0).getSize();
        expect(Math.round(width)).toBe(596);
        expect(Math.round(height)).toBe(842);
    });

    it('reporte les textes du compte rendu et les compteurs dans le modèle', async () => {
        const text = await extractText(await fillMissionReportPdf(DATA, SIGNATURES));
        for (const expected of [
            'Poste de Secours Fête de Quartier', 'Salle des fêtes Paris 18', '08:30', '19:45', '08:00', '20:15',
            'Alice Martin', '06 12 34 56 78', 'RAS côté équipe.', 'Très satisfait.', 'Bob Durand', 'Président',
        ]) {
            expect(text).toContain(expected);
        }
        // Le texte du modèle est conservé.
        expect(text).toContain('Dispositif de Secours');
        // Compteurs : total, soins (3), natures (4, 2, 1).
        expect(text).toMatch(/\b7\b/);
        expect(text).toMatch(/\b3\b/);
    });

    it('date les deux signatures à l’heure de Paris', async () => {
        const text = await extractText(await fillMissionReportPdf(DATA, SIGNATURES));
        expect(text).toContain('Le 16/11/2026 à 14:32');
        expect(text).toContain('Le 16/11/2026 à 14:35');
    });

    it('accepte des champs vides et des caractères hors WinAnsi sans lever', async () => {
        const bytes = await fillMissionReportPdf({
            ...DATA, start_time: null, mission_lead_name: 'Zoë 😀 北京', crf_observations: null, organizer_observations: 'x'.repeat(5000),
        }, SIGNATURES);
        expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
    });

    it('lève si l’image de signature n’est pas un PNG', async () => {
        await expect(fillMissionReportPdf(DATA, {
            ...SIGNATURES, team: { ...SIGNATURES.team, image: 'data:image/png;base64,AAAA' },
        })).rejects.toThrow();
    });
});

describe('formatSignatureDate', () => {
    it('formate en heure de Paris (heure d’été et d’hiver)', () => {
        expect(formatSignatureDate('2026-07-01T10:05:00.000Z')).toBe('01/07/2026 à 12:05');
        expect(formatSignatureDate('2026-01-15T10:05:00.000Z')).toBe('15/01/2026 à 11:05');
    });
    it('renvoie une chaîne vide pour une date invalide', () => {
        expect(formatSignatureDate('nope')).toBe('');
    });
});
