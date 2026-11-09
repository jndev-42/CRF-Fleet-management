/**
 * Client Cloudflare R2 : PDF scellés de notes de frais, guides et photos de
 * véhicule, référentiels, et médias (photos de trajet, d'incident, de mission,
 * rapport de mission signé — voir `src/lib/media/refs.ts`).
 *
 * S'appuie sur `aws4fetch` (signature SigV4 + `fetch` natif) plutôt que sur
 * `@aws-sdk/client-s3` : le besoin se limite à PUT / GET / HEAD sur des fichiers
 * d'une centaine de kilo-octets, et le SDK AWS pèse plusieurs mégaoctets pour un
 * coût d'initialisation à froid non négligeable sur Vercel.
 *
 * L'INTERFACE de ce module est le contrat ; l'implémentation est réversible. Une
 * bascule vers `@aws-sdk/client-s3` ne changerait aucune ligne appelante.
 *
 * Note : `aws4fetch@1.0.20` date d'août 2024 — stable et sans dépendance, mais
 * peu actif. Risque assumé et documenté.
 */

import { AwsClient } from 'aws4fetch';
import { parisTimestamp, parseMediaFolderRef, sanitizeName, validateMediaKey } from '@/lib/media/refs';

export class R2Error extends Error {}
export class R2ConfigError extends R2Error {}

/** Requête démo ? Import paresseux : ce module reste chargeable hors Next (scripts). */
async function isDemoRequestLazy(): Promise<boolean> {
    const { isDemoRequest } = await import('@/lib/demo/server');
    return isDemoRequest();
}

/**
 * Mode démo : les clés sont transparentes pour l'appelant, mais toute écriture
 * (et suppression) va sous `demo/<clé>` ; une lecture cherche `demo/<clé>` puis
 * retombe sur la vraie clé, en lecture seule. Le préfixe est vidé chaque nuit
 * (`purgeDemoObjects`, cron de 23h59) avec la recopie de la base démo.
 */
export const DEMO_KEY_PREFIX = 'demo/';

export function demoKey(key: string): string {
    return key.startsWith(DEMO_KEY_PREFIX) ? key : `${DEMO_KEY_PREFIX}${key}`;
}

/** Lecture démo : `demo/<clé>` d'abord, puis la vraie clé si absente (`null`/`false`). */
async function readWithDemoFallback<T>(key: string, read: (k: string) => Promise<T>, missing: T): Promise<T> {
    if (!(await isDemoRequestLazy())) return read(key);
    const fromDemo = await read(demoKey(key));
    return fromDemo !== missing ? fromDemo : read(key);
}

let cachedClient: AwsClient | null = null;
let cachedBucketUrl: string | null = null;

function config(): { client: AwsClient; bucketUrl: string } {
    if (cachedClient && cachedBucketUrl) {
        return { client: cachedClient, bucketUrl: cachedBucketUrl };
    }

    const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
    const endpoint = process.env.R2_ENDPOINT?.trim();
    const bucket = process.env.R2_BUCKET?.trim() || 'expenses-reports';

    if (!accessKeyId || !secretAccessKey || !endpoint) {
        throw new R2ConfigError(
            'Configuration R2 incomplète : R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY et R2_ENDPOINT sont requis.'
        );
    }

    cachedClient = new AwsClient({
        accessKeyId,
        secretAccessKey,
        service: 's3',
        region: 'auto',
        // `aws4fetch` embarque son PROPRE retry (10 tentatives par défaut, backoff
        // exponentiel). Combiné au nôtre, cela produirait jusqu'à 30 appels réseau
        // avec des délais cumulés — largement au-delà du maxDuration d'un lambda
        // Vercel, et sans contrôle sur le nombre réel de tentatives.
        // On le désactive : `withRetry` ci-dessous est la seule politique de reprise.
        retries: 0,
    });
    cachedBucketUrl = `${endpoint.replace(/\/+$/, '')}/${bucket}`;
    return { client: cachedClient, bucketUrl: cachedBucketUrl };
}

/**
 * Segment de dossier d'une UL dans les clés R2 des notes de frais : le slug
 * assaini, ou à défaut l'identifiant de l'UL assaini (UL introuvable, slug vide).
 */
export function expenseUlSegment(slug: unknown, ulId: string): string {
    const clean = (v: string) => v.replace(/[^a-zA-Z0-9_-]/g, '_');
    const fromSlug = typeof slug === 'string' ? clean(slug.trim()) : '';
    return fromSlug || clean(String(ulId ?? '')) || '_';
}

/**
 * Clé R2 d'une révision de PDF, rangée sous `ndf-revisions/{UL}/`.
 *
 * Les clés sont VERSIONNÉES et jamais écrasées : `attempt` (dérivé d'un UUID)
 * rend la clé unique même si deux validations concurrentes calculent le même
 * numéro de révision. Un objet orphelin après échec est inoffensif ; une révision
 * écrasée serait irrécupérable.
 */
export function buildExpenseKey(ulSegment: string, reportId: string, revision: number, attempt: string): string {
    if (!reportId) throw new R2Error('reportId requis pour construire une clé R2');
    if (!ulSegment) throw new R2Error('ulSegment requis pour construire une clé R2');
    const safeAttempt = attempt.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'x';
    return `ndf-revisions/${ulSegment}/${reportId}-v${revision}-${safeAttempt}.pdf`;
}

/**
 * Date SQL (`CURRENT_TIMESTAMP`, UTC sans fuseau) ou ISO → `Date` ; `null` si illisible.
 */
export function parseDbDate(value: unknown): Date | null {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value !== 'string' || !value.trim()) return null;
    const v = value.trim();
    const iso = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(v) ? `${v.replace(' ', 'T')}Z` : v;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Suffixe d'id d'une note dans son dossier publié : ses 4 premiers caractères
 * alphanumériques, en minuscules (`0000` à défaut). Distingue deux homonymes
 * créés à la même seconde et repère les copies périmées d'une même note.
 */
export function expenseIdSuffix(reportId: string): string {
    return String(reportId ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toLowerCase() || '0000';
}

/** Horodatage du dossier publié : `AAAAMMJJ-HHmmss` (Paris) de `createdAt`, ou `sans-date`. */
function expenseFolderStamp(createdAt: unknown): string {
    const date = parseDbDate(createdAt);
    return date ? parisTimestamp(date) : 'sans-date';
}

/**
 * Dossier de la copie publiée d'une note : `{demandeur}-{AAAAMMJJ-HHmmss}-{id4}`
 * (nom du créateur assaini, `createdAt` de la note en heure de Paris, 4 premiers
 * caractères alphanumériques de l'id). Stable entre signatures ; recalculé à
 * chaque scellement (pas de déplacement si le nom change : le rangement et la
 * suppression retrouvent l'ancienne copie par `{horodatage}-{id4}`).
 */
export function expensePublishedFolder(requesterName: unknown, createdAt: unknown, reportId: string): string {
    return `${sanitizeName(requesterName)}-${expenseFolderStamp(createdAt)}-${expenseIdSuffix(reportId)}`;
}

/**
 * Copie publiée de CETTE note, quel que soit le nom de demandeur au moment de son
 * écriture : `ndf/{UL}/{…}-{horodatage}-{id4}/note-de-frais.pdf`.
 */
export function isExpensePublishedKeyOf(key: string, ulSegment: string, createdAt: unknown, reportId: string): boolean {
    const prefix = `ndf/${ulSegment}/`;
    const suffix = `-${expenseFolderStamp(createdAt)}-${expenseIdSuffix(reportId)}/note-de-frais.pdf`;
    if (!key.startsWith(prefix) || !key.endsWith(suffix)) return false;
    const folder = key.slice(prefix.length, key.length - '/note-de-frais.pdf'.length);
    return !folder.includes('/') && folder.length > suffix.length - '/note-de-frais.pdf'.length;
}

/**
 * Clé R2 de la copie publiée d'une note :
 * `ndf/{UL}/{demandeur}-{horodatage}/note-de-frais.pdf`.
 * Écrasée à chaque scellement ; c'est elle que la synchro Drive suit.
 */
export function buildExpensePublishedKey(ulSegment: string, folderName: string): string {
    if (!folderName) throw new R2Error('folderName requis pour construire une clé R2');
    if (!ulSegment) throw new R2Error('ulSegment requis pour construire une clé R2');
    if (folderName.includes('/') || folderName.includes('..')) throw new R2Error('folderName invalide');
    return `ndf/${ulSegment}/${folderName}/note-de-frais.pdf`;
}

/** Ancienne clé de la copie publiée (`ndf/{UL}/{reportId}.pdf`), avant la v5.48.0. */
export function buildLegacyExpensePublishedKey(ulSegment: string, reportId: string): string {
    if (!reportId) throw new R2Error('reportId requis pour construire une clé R2');
    if (!ulSegment) throw new R2Error('ulSegment requis pour construire une clé R2');
    return `ndf/${ulSegment}/${reportId}.pdf`;
}

/** Suffixe unique pour une tentative de scellement. */
export function newAttemptId(): string {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
}

/**
 * Clé R2 d'un justificatif en attente de scellement.
 *
 * Stockage TRANSITOIRE : ces fichiers vivent le temps qu'un brouillon soit
 * complété, puis sont intégrés comme pages du PDF au premier scellement et
 * supprimés — jamais référencés depuis une note soumise.
 */
export function buildExpenseStagingKey(stagingId: string, filename: string): string {
    if (!stagingId) throw new R2Error('stagingId requis pour construire une clé de dépôt R2');
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80) || 'fichier';
    return `expenses-staging/${stagingId}/${crypto.randomUUID()}-${safeName}`;
}

/**
 * Clé R2 du guide de vérification d'un véhicule.
 *
 * VERSIONNÉE comme les PDF scellés : un remplacement écrit une nouvelle clé, la
 * base bascule dessus, puis seulement l'ancien objet est supprimé. Une lecture
 * concurrente ne tombe donc jamais sur un objet à moitié remplacé.
 */
export function buildVehicleGuideKey(vehicleId: string, attempt: string): string {
    if (!vehicleId) throw new R2Error('vehicleId requis pour construire une clé de guide R2');
    const safeVehicleId = vehicleId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeAttempt = attempt.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'x';
    return `vehicle-guides/${safeVehicleId}/${safeAttempt}.pdf`;
}

/** Clé R2 de la photo d'un véhicule, VERSIONNÉE comme celle du guide. */
export function buildVehiclePhotoKey(vehicleId: string, attempt: string): string {
    if (!vehicleId) throw new R2Error('vehicleId requis pour construire une clé de photo R2');
    const safeVehicleId = vehicleId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeAttempt = attempt.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'x';
    return `vehicle-photos/${safeVehicleId}/${safeAttempt}.jpg`;
}

const MAX_ATTEMPTS = 3;

/**
 * Réessaie avec backoff exponentiel.
 *
 * Obligatoire sur R2 : un échec réseau transitoire sur `putObject` laisserait la
 * transition métier sans artefact, et sur `getObject` empêcherait toute validation
 * comme tout téléchargement.
 */
async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            return await fn();
        } catch (e: unknown) {
            lastError = e;
            if (attempt < MAX_ATTEMPTS) {
                await new Promise(r => setTimeout(r, 200 * 2 ** (attempt - 1)));
            }
        }
    }
    throw new R2Error(
        `${label} a échoué après ${MAX_ATTEMPTS} tentatives : ` +
        (lastError instanceof Error ? lastError.message : String(lastError))
    );
}

/**
 * Écrit un objet. Ne renvoie jamais de détail d'identification dans ses erreurs.
 */
export async function putObject(key: string, body: Buffer, contentType = 'application/pdf'): Promise<void> {
    // Mode démo : écriture sous `demo/`, jamais sur une vraie clé.
    if (await isDemoRequestLazy()) key = demoKey(key);
    const { client, bucketUrl } = config();
    await withRetry(`PUT ${key}`, async () => {
        const res = await client.fetch(`${bucketUrl}/${key}`, {
            method: 'PUT',
            body: new Uint8Array(body),
            headers: { 'Content-Type': contentType, 'Content-Length': String(body.length) },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
    });
}

/** Lit un objet. `null` si absent (404) ; lève sur toute autre erreur. */
export async function getObject(key: string): Promise<Buffer | null> {
    return readWithDemoFallback(key, rawGetObject, null);
}

async function rawGetObject(key: string): Promise<Buffer | null> {
    const { client, bucketUrl } = config();
    return withRetry(`GET ${key}`, async () => {
        const res = await client.fetch(`${bucketUrl}/${key}`, { method: 'GET' });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return Buffer.from(await res.arrayBuffer());
    });
}

/** Teste l'existence d'un objet. */
export async function headObject(key: string): Promise<boolean> {
    return readWithDemoFallback(key, rawHeadObject, false);
}

async function rawHeadObject(key: string): Promise<boolean> {
    const { client, bucketUrl } = config();
    return withRetry(`HEAD ${key}`, async () => {
        const res = await client.fetch(`${bucketUrl}/${key}`, { method: 'HEAD' });
        if (res.status === 404) return false;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return true;
    });
}

/**
 * Supprime un objet. Un 404 n'est PAS une erreur : la suppression est idempotente,
 * appelée après intégration d'un justificatif dans le PDF scellé — le rejouer sur
 * un objet déjà absent ne doit jamais faire échouer la suppression.
 */
export async function deleteObject(key: string): Promise<void> {
    // Mode démo : seule la copie `demo/<clé>` peut être supprimée, jamais la vraie clé.
    if (await isDemoRequestLazy()) key = demoKey(key);
    await rawDeleteObject(key);
}

async function rawDeleteObject(key: string): Promise<void> {
    const { client, bucketUrl } = config();
    await withRetry(`DELETE ${key}`, async () => {
        const res = await client.fetch(`${bucketUrl}/${key}`, { method: 'DELETE' });
        if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
    });
}

/** Vérifie la configuration au démarrage, pour échouer avec un message lisible. */
export function assertR2Configured(): void {
    config();
}

/**
 * Clé R2 d'un référentiel PDF (guide pratique, plusieurs centaines de Mo).
 *
 * VERSIONNÉE : un nouvel import écrit une nouvelle clé, la base bascule dessus
 * une fois l'indexation terminée, puis seulement l'ancien objet est supprimé.
 */
export function buildReferentielKey(attempt: string): string {
    const safeAttempt = attempt.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'x';
    return `referentiels/${crypto.randomUUID()}-${safeAttempt}.pdf`;
}

/**
 * URL signée (query string SigV4) vers un objet R2.
 *
 * Sert à ce que le navigateur envoie et lise les gros PDF DIRECTEMENT vers R2 :
 * un fichier de plusieurs centaines de Mo ne peut pas transiter par une fonction
 * Vercel (corps limité à 4,5 Mo). `signQuery` met la signature dans l'URL, sans
 * en-tête `Authorization` — indispensable pour un `fetch` ou un `<a>` navigateur.
 * L'URL expire au bout de `expiresSec` secondes.
 */
export async function presignUrl(key: string, method: 'GET' | 'PUT' | 'HEAD', expiresSec: number): Promise<string> {
    // Mode démo : pas d'URL d'écriture vers le bucket de production (la lecture reste permise).
    if (await isDemoRequestLazy()) {
        if (method === 'PUT') throw new R2Error('Envoi de fichier indisponible en mode démo');
        if (await rawHeadObject(demoKey(key))) key = demoKey(key);
    }
    const { client, bucketUrl } = config();
    const url = new URL(`${bucketUrl}/${key}`);
    url.searchParams.set('X-Amz-Expires', String(expiresSec));
    const signed = await client.sign(url.toString(), { method, aws: { signQuery: true } });
    return signed.url;
}

/** Taille d'un objet en octets (HEAD). `null` si absent. */
export async function getObjectSize(key: string): Promise<number | null> {
    return readWithDemoFallback(key, rawGetObjectSize, null);
}

async function rawGetObjectSize(key: string): Promise<number | null> {
    const { client, bucketUrl } = config();
    return withRetry(`HEAD ${key}`, async () => {
        const res = await client.fetch(`${bucketUrl}/${key}`, { method: 'HEAD' });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const size = Number(res.headers.get('content-length'));
        if (!Number.isFinite(size)) throw new Error('Content-Length manquant');
        return size;
    });
}

/** Lit les octets `start`..`end` (inclus) d'un objet (requête `Range`). `null` si absent. */
export async function getObjectRange(key: string, start: number, end: number): Promise<Uint8Array | null> {
    return readWithDemoFallback(key, (k) => rawGetObjectRange(k, start, end), null);
}

async function rawGetObjectRange(key: string, start: number, end: number): Promise<Uint8Array | null> {
    const { client, bucketUrl } = config();
    return withRetry(`GET ${key} [${start}-${end}]`, async () => {
        const res = await client.fetch(`${bucketUrl}/${key}`, {
            method: 'GET',
            headers: { Range: `bytes=${start}-${end}` },
        });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return new Uint8Array(await res.arrayBuffer());
    });
}

function decodeXml(value: string): string {
    return value
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

/** Liste une page de clés sous `prefix` (ListObjectsV2). */
async function listKeys(prefix: string, continuationToken?: string): Promise<{ keys: string[]; next?: string }> {
    const { client, bucketUrl } = config();
    const url = new URL(bucketUrl);
    url.searchParams.set('list-type', '2');
    url.searchParams.set('prefix', prefix);
    if (continuationToken) url.searchParams.set('continuation-token', continuationToken);
    return withRetry(`LIST ${prefix}`, async () => {
        const res = await client.fetch(url.toString(), { method: 'GET' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const xml = await res.text();
        const keys = [...xml.matchAll(/<Key>([\s\S]*?)<\/Key>/g)].map((m) => decodeXml(m[1]));
        const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
        const next = xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1];
        return { keys, next: truncated && next ? decodeXml(next) : undefined };
    });
}

async function listAllKeys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;
    do {
        const page = await listKeys(prefix, token);
        keys.push(...page.keys);
        token = page.next;
    } while (token);
    return keys;
}

/**
 * Liste toutes les clés sous `prefix` (toutes les pages).
 *
 * Mode démo : réunit les objets écrits en démo (`demo/<prefix>…`, rendus sans le
 * préfixe `demo/`, donc transparents pour l'appelant) et les vrais objets, sans
 * doublon — la lecture d'une clé retombe ensuite d'elle-même sur la bonne copie.
 */
export async function listObjects(prefix: string): Promise<string[]> {
    if (!prefix) throw new R2Error('prefix requis pour lister des objets R2');
    if (!(await isDemoRequestLazy())) return listAllKeys(prefix);
    const fromDemo = (await listAllKeys(demoKey(prefix))).map((k) => k.slice(DEMO_KEY_PREFIX.length));
    const real = await listAllKeys(prefix);
    return [...new Set([...fromDemo, ...real])];
}

/**
 * Supprime tous les objets d'un dossier média (`prefix` + `/`). Seul un préfixe
 * de dossier COMPLET est accepté (`{type}/{UL}/{dossier}`, `parseMediaFolderRef`) :
 * ni `trip-photos/paris-18` (toute une UL), ni une clé de fichier. Le `/` final est
 * imposé : `a/b/c` n'emporte jamais `a/b/cd/…`. Mode démo : seuls les objets sous
 * `demo/` sont supprimés, jamais les vrais. Renvoie le nombre d'objets supprimés.
 */
export async function deletePrefix(prefix: string): Promise<number> {
    if (!parseMediaFolderRef(prefix)) throw new R2Error('Préfixe R2 refusé : un dossier média complet est attendu');
    const listed = `${prefix}/`;
    const target = (await isDemoRequestLazy()) ? demoKey(listed) : listed;
    const keys = await listAllKeys(target);
    let deleted = 0;
    for (const key of keys) {
        if (!key.startsWith(target)) continue;
        await rawDeleteObject(key);
        deleted++;
    }
    return deleted;
}

/** Supprime un fichier média par sa clé validée (rapport de mission signé). */
export async function deleteMediaKey(key: string): Promise<void> {
    if (!validateMediaKey(key)) throw new R2Error('Clé média invalide');
    await deleteObject(key);
}

/**
 * Supprime tous les objets écrits en mode démo (préfixe `demo/`), page par page.
 * Ne touche jamais une clé hors de ce préfixe. Renvoie le nombre d'objets supprimés.
 * Appelée par le cron de 23h59 (hors requête démo), avec la recopie de la base démo.
 */
export async function purgeDemoObjects(): Promise<number> {
    let deleted = 0;
    let token: string | undefined;
    do {
        const page = await listKeys(DEMO_KEY_PREFIX, token);
        for (const key of page.keys) {
            if (!key.startsWith(DEMO_KEY_PREFIX)) continue;
            await rawDeleteObject(key);
            deleted++;
        }
        token = page.next;
    } while (token);
    return deleted;
}
