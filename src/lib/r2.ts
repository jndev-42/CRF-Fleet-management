/**
 * Client Cloudflare R2 pour les PDF scellés de notes de frais.
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

export class R2Error extends Error {}
export class R2ConfigError extends R2Error {}

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
 * Clé R2 d'une révision de PDF.
 *
 * Les clés sont VERSIONNÉES et jamais écrasées : `attempt` (dérivé d'un UUID)
 * rend la clé unique même si deux validations concurrentes calculent le même
 * numéro de révision. Un objet orphelin après échec est inoffensif ; une révision
 * écrasée serait irrécupérable.
 */
export function buildExpenseKey(reportId: string, revision: number, attempt: string): string {
    if (!reportId) throw new R2Error('reportId requis pour construire une clé R2');
    const safeAttempt = attempt.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'x';
    return `${reportId}/v${revision}-${safeAttempt}.pdf`;
}

/** Suffixe unique pour une tentative de scellement. */
export function newAttemptId(): string {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
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
    const { client, bucketUrl } = config();
    return withRetry(`HEAD ${key}`, async () => {
        const res = await client.fetch(`${bucketUrl}/${key}`, { method: 'HEAD' });
        if (res.status === 404) return false;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return true;
    });
}

/** Vérifie la configuration au démarrage, pour échouer avec un message lisible. */
export function assertR2Configured(): void {
    config();
}
