/**
 * Pièces jointes du suivi technique (tâches, puis dossiers au livrable 3) — règles
 * partagées client / serveur : types acceptés, signature binaire, taille, nom de
 * fichier, clé R2 et en-tête `Content-Disposition`.
 *
 * Module SANS dépendance serveur : la modale l'importe pour valider avant l'envoi,
 * les routes pour revalider (la validation client n'est qu'un confort).
 */

/** 4 Mo : sous la limite de corps de requête Vercel (4,5 Mo). */
export const MAX_ATTACHMENT_SIZE = 4 * 1024 * 1024;

export const ATTACHMENT_OWNER_TYPES = ['TASK', 'DOSSIER'] as const;
export type AttachmentOwnerType = typeof ATTACHMENT_OWNER_TYPES[number];

/** Valeur de l'attribut `accept` du sélecteur de fichier. */
export const ATTACHMENT_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp';

export const ATTACHMENT_INVALID_ERROR = 'Le fichier doit être un PDF ou une image (JPEG, PNG, WebP).';
export const ATTACHMENT_TOO_LARGE_ERROR = 'Le fichier est trop volumineux (4 Mo maximum).';

/** Pièces jointes au plus par tâche. */
export const MAX_ATTACHMENTS_PER_TASK = 20;
export const TOO_MANY_ATTACHMENTS_ERROR = `Une tâche compte au plus ${MAX_ATTACHMENTS_PER_TASK} pièces jointes.`;

export interface AttachmentKind {
    contentType: 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp';
    ext: 'pdf' | 'jpg' | 'png' | 'webp';
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
    if (bytes.length < offset + signature.length) return false;
    return signature.every((b, i) => bytes[offset + i] === b);
}

/**
 * Type réel d'après les octets magiques — le type MIME et l'extension déclarés se
 * falsifient trivialement. `null` si le contenu n'est ni PDF, ni JPEG, ni PNG, ni WebP.
 */
export function detectAttachmentKind(bytes: Uint8Array): AttachmentKind | null {
    if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return { contentType: 'application/pdf', ext: 'pdf' };
    if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { contentType: 'image/jpeg', ext: 'jpg' };
    if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { contentType: 'image/png', ext: 'png' };
    if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
        return { contentType: 'image/webp', ext: 'webp' };
    }
    return null;
}

const DECLARED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const DECLARED_EXT = /\.(pdf|jpe?g|png|webp)$/i;

/** Validation côté navigateur avant l'envoi : message d'erreur, ou `null`. */
export function validateAttachmentFile(file: { name: string; type: string; size: number }): string | null {
    if (!DECLARED_TYPES.has(file.type) && !DECLARED_EXT.test(file.name)) return ATTACHMENT_INVALID_ERROR;
    if (file.size === 0) return ATTACHMENT_INVALID_ERROR;
    if (file.size > MAX_ATTACHMENT_SIZE) return ATTACHMENT_TOO_LARGE_ERROR;
    return null;
}

const MAX_FILE_NAME_LENGTH = 150;

/**
 * Nom conservé en base et restitué : sans chemin, sans caractère de contrôle, borné,
 * et terminé par l'extension du type RÉEL (un `.exe` renommé ne garde pas son nom trompeur).
 */
export function sanitizeAttachmentFileName(name: string, ext: AttachmentKind['ext']): string {
    const base = name.split(/[\\/]/).pop() ?? '';
    const cleaned = base.replace(/[\u0000-\u001f\u007f"]/g, '').trim();
    // Seule une vraie extension finale est retirée : « Devis v2.1 » garde son « .1 ».
    const stem = cleaned.replace(/\.(pdf|jpe?g|png|webp)$/i, '').trim();
    const suffix = `.${ext}`;
    const bounded = stem.slice(0, MAX_FILE_NAME_LENGTH - suffix.length).trim();
    return `${bounded || 'piece-jointe'}${suffix}`;
}

/**
 * `Content-Disposition` : `inline` (PDF et images s'affichent dans le navigateur) ou
 * `attachment` ; `filename` ASCII pour les anciens clients, `filename*` (RFC 5987).
 */
export function attachmentContentDisposition(fileName: string, download: boolean): string {
    const asciiName = fileName
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\x20-\x7e]/g, '_')
        .replace(/["\\]/g, '_');
    const encoded = encodeURIComponent(fileName).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    return `${download ? 'attachment' : 'inline'}; filename="${asciiName}"; filename*=UTF-8''${encoded}`;
}

/** Préfixe R2 du module : `fleet-tracking/{UL}/…`. */
export const FLEET_TRACKING_R2_PREFIX = 'fleet-tracking';

const SEGMENT_RE = /^[A-Za-z0-9_][A-Za-z0-9_-]*$/;

/**
 * Clé R2 d'une pièce jointe de tâche :
 * `fleet-tracking/{segment UL}/tasks/{taskId}/{attachmentId}.{ext}`.
 */
export function buildTaskAttachmentKey(ulSegment: string, taskId: string, attachmentId: string, ext: AttachmentKind['ext']): string {
    for (const [what, v] of [['segment UL', ulSegment], ['taskId', taskId], ['attachmentId', attachmentId]] as const) {
        if (!v || !SEGMENT_RE.test(v)) throw new Error(`${what} invalide pour construire une clé de pièce jointe`);
    }
    return `${FLEET_TRACKING_R2_PREFIX}/${ulSegment}/tasks/${taskId}/${attachmentId}.${ext}`;
}

/** Taille lisible en français : « 1,3 Mo », « 850 Ko ». */
export function formatAttachmentSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '';
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}
