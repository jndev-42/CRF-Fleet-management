/**
 * Justificatifs en attente d'une note de frais : identifiant de dépôt signé et
 * validation des clés envoyées par le client.
 *
 * Le `stagingId` est émis par `POST /api/expenses/upload` sous la forme
 * `{nonce}-{signature}` : HMAC-SHA256 (`AUTH_SECRET`) de l'id du déposant et du
 * nonce. Une clé `expenses-staging/{UL}/{stagingId}/…` n'est acceptée que pour une
 * note de cette UL ET si son `stagingId` est signé pour le créateur de la note :
 * un justificatif déposé par quelqu'un d'autre est refusé, sans table de suivi.
 *
 * Une clé déjà enregistrée dans `pendingReceiptKeys` de CETTE note (ancienne forme
 * `expenses-staging/{x}/…`, ou rangée par `scripts/move-r2-objects-to-ul-folders.ts`)
 * reste acceptée si elle a la forme d'une clé de dépôt : un brouillon existant doit
 * rester soumettable. Jamais pour une nouvelle note.
 *
 * Toute clé refusée l'est AVANT lecture : une clé arbitraire serait lue, intégrée
 * au PDF scellé puis SUPPRIMÉE.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { parseExpenseStagingKey } from '@/lib/r2';

const NONCE_BYTES = 12;
const SIG_HEX = 32;
const SIGNED_RE = /^([0-9a-f]{24})-([0-9a-f]{32})$/;

/** Lu à l'appel, jamais au chargement : `next build` importe les modules sans secrets. */
function secret(): string {
    const value = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
    if (!value) throw new Error('AUTH_SECRET absent : dépôt de justificatifs impossible');
    return value;
}

function signature(userId: string, nonce: string): string {
    return createHmac('sha256', secret())
        .update(`crf-expense-staging:${userId}:${nonce}`)
        .digest('hex')
        .slice(0, SIG_HEX);
}

/** Nouvel identifiant de dépôt signé pour `userId`. */
export function issueStagingId(userId: string): string {
    if (!userId) throw new Error('userId requis pour émettre un identifiant de dépôt');
    const nonce = randomBytes(NONCE_BYTES).toString('hex');
    return `${nonce}-${signature(userId, nonce)}`;
}

/** Le `stagingId` a-t-il été émis par le serveur pour `userId` ? */
export function isStagingIdSignedFor(stagingId: unknown, userId: unknown): boolean {
    if (typeof stagingId !== 'string' || typeof userId !== 'string' || !userId) return false;
    const match = SIGNED_RE.exec(stagingId);
    if (!match) return false;
    const expected = Buffer.from(signature(userId, match[1]), 'utf8');
    const actual = Buffer.from(match[2], 'utf8');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Message 400 de `POST /api/expenses` et `PATCH /api/expenses/[id]` : `count` justificatifs refusés. */
export function receiptKeysError(count: number): string {
    return count === 1
        ? '1 justificatif a été refusé : ajoutez-le de nouveau puis réessayez.'
        : `${count} justificatifs ont été refusés : ajoutez-les de nouveau puis réessayez.`;
}

/**
 * Valide les clés d'une note et renvoie la liste à enregistrer (`keys`) et les
 * clés refusées (`rejected`, vide : tout est accepté).
 *
 * Une ancienne clé `expenses-staging/{sid}/{fichier}` envoyée par un formulaire
 * ouvert avant le rangement, alors que la note stocke déjà sa forme rangée
 * `expenses-staging/{UL}/{sid}/{fichier}`, est remplacée par la clé stockée.
 *
 * @param ulSegment  segment UL de la NOTE (`ulSegmentOf(report.ulId)`)
 * @param ownerId    créateur de la note
 * @param storedKeys `pendingReceiptKeys` actuels de la note (`[]` pour une nouvelle note)
 */
export function normalizeReceiptKeys(
    keys: readonly string[],
    opts: { ulSegment: string; ownerId: string; storedKeys: readonly string[] },
): { keys: string[]; rejected: string[] } {
    const stored = new Set(opts.storedKeys);
    const relocated = new Map<string, string>();
    for (const key of opts.storedKeys) {
        const parsed = parseExpenseStagingKey(key);
        if (parsed?.ulSegment) relocated.set(`${parsed.stagingId}/${parsed.file}`, key);
    }

    const accepted: string[] = [];
    const rejected: string[] = [];
    for (const key of keys) {
        const parsed = parseExpenseStagingKey(key);
        let kept: string | undefined;
        if (!parsed) kept = undefined;
        else if (stored.has(key)) kept = key;
        else if (parsed.ulSegment === opts.ulSegment && isStagingIdSignedFor(parsed.stagingId, opts.ownerId)) kept = key;
        else if (parsed.ulSegment === null) kept = relocated.get(`${parsed.stagingId}/${parsed.file}`);
        if (kept === undefined) rejected.push(key);
        else if (!accepted.includes(kept)) accepted.push(kept);
    }
    return { keys: accepted, rejected };
}

/** `pendingReceiptKeys` stockés (JSON) → liste de clés ; `[]` si vide ou illisible. */
export function parseStoredReceiptKeys(value: unknown): string[] {
    if (typeof value !== 'string' || !value.trim()) return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
    } catch {
        return [];
    }
}
