/**
 * Guide de vérification PDF d'un véhicule — règles partagées client / serveur.
 *
 * Module SANS dépendance serveur : les modales l'importent pour valider le
 * fichier avant l'envoi, les routes pour le revalider (la validation client
 * n'est qu'un confort, jamais une garantie).
 */

/** 4 Mo, comme annoncé à l'utilisateur : sous la limite de corps de requête Vercel (4,5 Mo). */
export const MAX_GUIDE_SIZE = 4 * 1024 * 1024;

/** Longueur maximale du nom conservé, extension comprise. */
const MAX_FILE_NAME_LENGTH = 150;
const DEFAULT_FILE_NAME = 'guide-verification.pdf';

export const GUIDE_NOT_PDF_ERROR = 'Le fichier doit être un PDF.';
export const GUIDE_TOO_LARGE_ERROR = 'Le fichier est trop volumineux (4 Mo maximum).';

/** Type MIME ou extension déclarant un PDF — le type seul n'est pas fiable selon les navigateurs. */
export function looksLikePdf(file: { name: string; type: string }): boolean {
    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

/** Octets magiques `%PDF` en tête de fichier : la seule preuve que le contenu est bien un PDF. */
export function hasPdfSignature(bytes: Uint8Array): boolean {
    return bytes.length >= 4
        && bytes[0] === 0x25 // %
        && bytes[1] === 0x50 // P
        && bytes[2] === 0x44 // D
        && bytes[3] === 0x46; // F
}

/**
 * Validation côté navigateur, avant tout envoi. Renvoie le message d'erreur à
 * afficher, ou `null` si le fichier est acceptable.
 */
export function validateGuideFile(file: { name: string; type: string; size: number }): string | null {
    if (!looksLikePdf(file)) return GUIDE_NOT_PDF_ERROR;
    if (file.size > MAX_GUIDE_SIZE) return GUIDE_TOO_LARGE_ERROR;
    if (file.size === 0) return GUIDE_NOT_PDF_ERROR;
    return null;
}

/**
 * Nom de fichier conservé en base et restitué au téléchargement : sans chemin,
 * sans caractère de contrôle, borné en longueur, toujours suffixé `.pdf`.
 */
export function sanitizeGuideFileName(name: string): string {
    const base = name.split(/[\\/]/).pop() ?? '';
    const cleaned = base.replace(/[\u0000-\u001f\u007f"]/g, '').trim();
    const hasExtension = cleaned.toLowerCase().endsWith('.pdf');
    const extension = hasExtension ? cleaned.slice(-4) : '.pdf';
    const stem = (hasExtension ? cleaned.slice(0, -4) : cleaned)
        .slice(0, MAX_FILE_NAME_LENGTH - extension.length)
        .trim();
    return stem ? `${stem}${extension}` : DEFAULT_FILE_NAME;
}

/**
 * En-tête `Content-Disposition` : `filename` en ASCII pour les anciens clients,
 * `filename*` (RFC 5987) pour restituer le nom d'origine avec ses accents.
 */
export function guideContentDisposition(fileName: string, download: boolean): string {
    const safeName = sanitizeGuideFileName(fileName);
    const asciiName = safeName
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\x20-\x7e]/g, '_');
    const encoded = encodeURIComponent(safeName).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    return `${download ? 'attachment' : 'inline'}; filename="${asciiName}"; filename*=UTF-8''${encoded}`;
}

/** Taille lisible en français : « 1,3 Mo », « 850 Ko ». */
export function formatGuideSize(bytes: number | null | undefined): string | null {
    if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return null;
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}
