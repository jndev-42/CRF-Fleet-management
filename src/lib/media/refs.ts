/**
 * Références des médias (photos, rapport de mission signé) stockés sur R2.
 *
 * Module PUR (aucun import Node ni réseau) : partagé par le navigateur et les routes.
 *
 * Arborescence : `{type}/{segment UL}/{dossier lisible}/…`
 *   - `trip-photos/{UL}/{véhicule}-{horodatage}-{xxxx}/emprunt|rendu/{fichier}`
 *   - `incident-photos/{UL}/{véhicule}-{horodatage}-{xxxx}/{fichier}`
 *   - `mission-com-photos/{UL}/{mission}-{horodatage}-{xxxx}/{fichier}`
 *   - `mission-report-photo/{UL}/{mission}-{horodatage}-{xxxx}/{fichier}`
 *
 * Les colonnes existantes (`Trip.driveFolderId`, `IncidentReport.driveFolderId`,
 * `mission_reports.drive_folder_id`) reçoivent le PRÉFIXE du dossier (3 segments,
 * sans `/` final) ; `mission_reports.signed_report_drive_id` reçoit la clé
 * complète du fichier. Une référence R2 contient toujours `/` : une valeur sans `/`
 * (id Drive résiduel, `mock-…`) ne désigne aucun fichier.
 */

export const MEDIA_TYPES = ['trip-photos', 'incident-photos', 'mission-com-photos', 'mission-report-photo'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

/** Étapes d'un trajet : sous-dossiers de `trip-photos/…/`. */
export const TRIP_STAGES = ['emprunt', 'rendu'] as const;
export type TripStage = (typeof TRIP_STAGES)[number];

/** Types dont le dossier dépend d'un véhicule (UL = `Vehicle.ulId`). */
export const VEHICLE_MEDIA_TYPES: readonly MediaType[] = ['trip-photos', 'incident-photos'];

export function isMediaType(value: unknown): value is MediaType {
    return typeof value === 'string' && (MEDIA_TYPES as readonly string[]).includes(value);
}

export function isTripStage(value: unknown): value is TripStage {
    return typeof value === 'string' && (TRIP_STAGES as readonly string[]).includes(value);
}

/** Référence R2 (préfixe ou clé) ? Un id Drive ne contient jamais `/`. */
export function isR2Ref(ref: unknown): ref is string {
    return typeof ref === 'string' && ref.includes('/');
}

const NAME_MAX = 60;
const FALLBACK_NAME = 'sans-nom';

/**
 * Nom lisible assaini : accents retirés, minuscules, `[a-z0-9-]` seulement,
 * tirets fusionnés, 60 caractères au plus ; `sans-nom` si rien ne subsiste.
 */
export function sanitizeName(name: unknown, max = NAME_MAX): string {
    const raw = typeof name === 'string' ? name : '';
    const cleaned = raw
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, max)
        .replace(/-+$/g, '');
    return cleaned || FALLBACK_NAME;
}

/** Horodatage `AAAAMMJJ-HHmmss` en heure de Paris. */
export function parisTimestamp(date: Date): string {
    const parts = new Intl.DateTimeFormat('fr-FR', {
        timeZone: 'Europe/Paris',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
    return `${get('year')}${get('month')}${get('day')}-${get('hour')}${get('minute')}${get('second')}`;
}

/** 4 caractères hexadécimaux aléatoires (anti-collision du dossier lisible). */
export function randomSuffix(): string {
    const bytes = new Uint8Array(2);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Dossier lisible daté, SANS suffixe aléatoire : `{nom}-{AAAAMMJJ-HHmmss}`.
 * Sert tel quel au dossier publié d'une note de frais (stable entre signatures).
 */
export function datedSegment(name: unknown, date: Date): string {
    return `${sanitizeName(name)}-${parisTimestamp(date)}`;
}

/** Dossier lisible d'un média : `{nom}-{AAAAMMJJ-HHmmss}-{xxxx}`. */
export function readableSegment(name: unknown, date: Date, rand: string = randomSuffix()): string {
    const safeRand = rand.toLowerCase().replace(/[^0-9a-f]/g, '').slice(0, 4).padEnd(4, '0');
    return `${datedSegment(name, date)}-${safeRand}`;
}

/** Préfixe d'un dossier média : `{type}/{segment UL}/{dossier lisible}`. */
export function buildMediaFolderRef(type: MediaType, ulSegment: string, readable: string): string {
    if (!isMediaType(type)) throw new Error(`Type de média inconnu : ${String(type)}`);
    if (!SEGMENT_RE.test(ulSegment)) throw new Error('Segment UL invalide');
    if (!SEGMENT_RE.test(readable)) throw new Error('Dossier lisible invalide');
    return `${type}/${ulSegment}/${readable}`;
}

/** Nom de fichier assaini, extension conservée : `{nom assaini}.{ext}`. */
export function sanitizeFileName(fileName: unknown): string {
    const raw = typeof fileName === 'string' ? fileName : '';
    const match = raw.match(/^(.*?)(?:\.([A-Za-z0-9]{1,8}))?$/);
    const base = sanitizeName(match?.[1] ?? raw);
    const ext = match?.[2]?.toLowerCase();
    return ext ? `${base}.${ext}` : base;
}

/** 8 caractères hexadécimaux d'un UUID aléatoire. */
export function uuid8(): string {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
}

/**
 * Clé d'un fichier : `{préfixe}[/{étape}]/{uuid8}-{nom assaini}`.
 * L'étape n'existe que pour `trip-photos` (`emprunt` | `rendu`).
 */
export function buildMediaFileKey(folderRef: string, fileName: unknown, opts: { stage?: TripStage | null; id?: string } = {}): string {
    const parsed = parseMediaFolderRef(folderRef);
    if (!parsed) throw new Error('Préfixe média invalide');
    if (parsed.type === 'trip-photos' && !isTripStage(opts.stage)) {
        throw new Error('Étape requise (emprunt | rendu) pour une photo de trajet');
    }
    if (parsed.type !== 'trip-photos' && opts.stage) {
        throw new Error('Étape réservée aux photos de trajet');
    }
    const id = (opts.id ?? uuid8()).toLowerCase().replace(/[^0-9a-z]/g, '').slice(0, 8) || uuid8();
    const file = `${id}-${sanitizeFileName(fileName)}`;
    return opts.stage ? `${folderRef}/${opts.stage}/${file}` : `${folderRef}/${file}`;
}

const SEGMENT_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;
const MAX_KEY_LENGTH = 512;

function splitSafe(ref: unknown): string[] | null {
    if (typeof ref !== 'string' || ref.length === 0 || ref.length > MAX_KEY_LENGTH) return null;
    if (ref.includes('..') || ref.includes('\\')) return null;
    const segments = ref.split('/');
    if (!segments.every((s) => SEGMENT_RE.test(s))) return null;
    return segments;
}

/** Préfixe de dossier valide (3 segments, type connu) → ses parties ; sinon `null`. */
export function parseMediaFolderRef(ref: unknown): { type: MediaType; ulSegment: string; folder: string } | null {
    const segments = splitSafe(ref);
    if (!segments || segments.length !== 3) return null;
    const [type, ulSegment, folder] = segments;
    if (!isMediaType(type)) return null;
    return { type, ulSegment, folder };
}

export interface ValidatedMediaKey {
    type: MediaType;
    folderRef: string;
    stage: TripStage | null;
    fileName: string;
}

/**
 * Valide une clé de fichier média : pas de `..`, segments sûrs, type connu, forme
 * attendue (`trip-photos` : 5 segments dont l'étape ; les autres : 4 segments).
 * Renvoie `null` si la clé est invalide.
 */
export function validateMediaKey(key: unknown): ValidatedMediaKey | null {
    const segments = splitSafe(key);
    if (!segments) return null;
    const type = segments[0];
    if (!isMediaType(type)) return null;
    const folderRef = segments.slice(0, 3).join('/');
    if (type === 'trip-photos') {
        if (segments.length !== 5 || !isTripStage(segments[3])) return null;
        return { type, folderRef, stage: segments[3], fileName: segments[4] };
    }
    if (segments.length !== 4) return null;
    return { type, folderRef, stage: null, fileName: segments[3] };
}

/** Préfixe du dossier (3 premiers segments) d'une clé de fichier valide ; sinon `null`. */
export function folderRefOfKey(key: unknown): string | null {
    return validateMediaKey(key)?.folderRef ?? null;
}

/** Nom affichable d'un fichier : dernier segment, sans le préfixe `{uuid8}-`. */
export function displayNameOfKey(key: string): string {
    const last = key.split('/').pop() ?? key;
    return last.replace(/^[0-9a-z]{8}-/, '');
}

const MIME_BY_EXT: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
    bmp: 'image/bmp',
    tif: 'image/tiff',
    tiff: 'image/tiff',
    avif: 'image/avif',
    pdf: 'application/pdf',
};

/** Content-Type déduit de l'extension (`application/octet-stream` à défaut). */
export function mimeTypeOfKey(key: string): string {
    const ext = key.split('.').pop()?.toLowerCase() ?? '';
    return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

/** Extension d'un type MIME connu (pour nommer un fichier migré sans extension). */
export function extensionOfMimeType(mimeType: string | null | undefined): string | null {
    if (!mimeType) return null;
    const found = Object.entries(MIME_BY_EXT).find(([, m]) => m === mimeType.toLowerCase());
    return found ? found[0] : null;
}

/**
 * Nom de fichier dont l'extension est connue : celle du nom si elle l'est, sinon
 * celle du type MIME (sans quoi le fichier serait servi en `octet-stream`).
 */
export function fileNameWithMimeExtension(name: string, mimeType: string | null | undefined): string {
    const ext = name.match(/\.([A-Za-z0-9]{1,8})$/)?.[1]?.toLowerCase();
    if (ext && MIME_BY_EXT[ext]) return name;
    const fromMime = extensionOfMimeType(mimeType);
    return fromMime ? `${name}.${fromMime}` : name;
}

/**
 * Segment UL d'une clé média à partir de `expenseUlSegment` : les caractères
 * initiaux hors `[A-Za-z0-9_]` sont retirés (un slug `-x` ferait échouer la
 * validation des segments) ; `_` si rien ne subsiste.
 */
export function toMediaUlSegment(segment: string): string {
    return segment.replace(/^[^A-Za-z0-9_]+/, '') || '_';
}

/**
 * Valeur de colonne acceptable pour un type : une valeur sans `/` (id Drive résiduel,
 * qui ne désigne aucun fichier)
 * ou une référence R2 de ce type — préfixe de dossier, ou clé de fichier pour
 * `mission-report-photo` (`kind: 'file'`).
 */
export function isAcceptableMediaRef(ref: string, type: MediaType, kind: 'folder' | 'file' = 'folder'): boolean {
    if (!isR2Ref(ref)) return true;
    if (kind === 'file') return validateMediaKey(ref)?.type === type;
    return parseMediaFolderRef(ref)?.type === type;
}
