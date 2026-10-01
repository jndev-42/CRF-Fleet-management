import { describe, it, expect } from 'vitest';
import {
    MAX_GUIDE_SIZE,
    GUIDE_NOT_PDF_ERROR,
    GUIDE_TOO_LARGE_ERROR,
    formatGuideSize,
    guideContentDisposition,
    hasPdfSignature,
    looksLikePdf,
    sanitizeGuideFileName,
    validateGuideFile,
} from '@/lib/vehicleGuide';

describe('looksLikePdf', () => {
    it('accepte le type MIME ou l\'extension .pdf', () => {
        expect(looksLikePdf({ name: 'guide.bin', type: 'application/pdf' })).toBe(true);
        expect(looksLikePdf({ name: 'GUIDE.PDF', type: '' })).toBe(true);
    });

    it('refuse une image', () => {
        expect(looksLikePdf({ name: 'photo.png', type: 'image/png' })).toBe(false);
    });
});

describe('hasPdfSignature', () => {
    it('reconnaît les octets %PDF', () => {
        expect(hasPdfSignature(new TextEncoder().encode('%PDF-1.7'))).toBe(true);
    });

    it('refuse tout autre contenu, y compris trop court', () => {
        expect(hasPdfSignature(new TextEncoder().encode('PK\u0003\u0004'))).toBe(false);
        expect(hasPdfSignature(new TextEncoder().encode('%PD'))).toBe(false);
    });
});

describe('validateGuideFile', () => {
    it('accepte un PDF sous la limite', () => {
        expect(validateGuideFile({ name: 'VPSP 182.pdf', type: 'application/pdf', size: 1_300_000 })).toBeNull();
    });

    it('refuse un fichier trop gros', () => {
        expect(validateGuideFile({ name: 'a.pdf', type: 'application/pdf', size: MAX_GUIDE_SIZE + 1 })).toBe(GUIDE_TOO_LARGE_ERROR);
    });

    it('refuse un fichier qui n\'est pas un PDF, ou vide', () => {
        expect(validateGuideFile({ name: 'a.png', type: 'image/png', size: 10 })).toBe(GUIDE_NOT_PDF_ERROR);
        expect(validateGuideFile({ name: 'a.pdf', type: 'application/pdf', size: 0 })).toBe(GUIDE_NOT_PDF_ERROR);
    });
});

describe('sanitizeGuideFileName', () => {
    it('conserve un nom ordinaire, accents compris', () => {
        expect(sanitizeGuideFileName('Vérification VPSP 182.pdf')).toBe('Vérification VPSP 182.pdf');
    });

    it('retire le chemin, les guillemets et les caractères de contrôle', () => {
        expect(sanitizeGuideFileName('C:\\docs\\a"b\n.pdf')).toBe('ab.pdf');
        expect(sanitizeGuideFileName('../../etc/guide.pdf')).toBe('guide.pdf');
    });

    it('ajoute l\'extension et fournit un nom par défaut', () => {
        expect(sanitizeGuideFileName('guide')).toBe('guide.pdf');
        expect(sanitizeGuideFileName('')).toBe('guide-verification.pdf');
    });

    it('borne la longueur à 150 caractères, extension comprise', () => {
        const withExt = sanitizeGuideFileName(`${'a'.repeat(400)}.pdf`);
        expect(withExt).toHaveLength(150);
        expect(withExt.endsWith('.pdf')).toBe(true);
        const withoutExt = sanitizeGuideFileName('b'.repeat(400));
        expect(withoutExt).toHaveLength(150);
        expect(withoutExt.endsWith('.pdf')).toBe(true);
    });

    it("reconnaît l'extension sans tenir compte de la casse", () => {
        expect(sanitizeGuideFileName('Guide.PDF')).toBe('Guide.PDF');
        expect(sanitizeGuideFileName('.PDF')).toBe('guide-verification.pdf');
    });
});

describe('guideContentDisposition', () => {
    it('inline ou attachment selon le mode', () => {
        expect(guideContentDisposition('VPSP 182.pdf', false)).toMatch(/^inline; filename="VPSP 182.pdf"/);
        expect(guideContentDisposition('VPSP 182.pdf', true)).toMatch(/^attachment; filename="VPSP 182.pdf"/);
    });

    it('fournit un repli ASCII et le nom UTF-8 encodé', () => {
        const header = guideContentDisposition('Vérification.pdf', true);
        expect(header).toContain('filename="Verification.pdf"');
        expect(header).toContain("filename*=UTF-8''V%C3%A9rification.pdf");
    });
});

describe('formatGuideSize', () => {
    it('formate en Ko ou Mo à la française', () => {
        expect(formatGuideSize(850 * 1024)).toBe('850 Ko');
        expect(formatGuideSize(1.3 * 1024 * 1024)).toBe('1,3 Mo');
    });

    it('renvoie null sans taille exploitable', () => {
        expect(formatGuideSize(null)).toBeNull();
        expect(formatGuideSize(0)).toBeNull();
    });
});
