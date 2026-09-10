/**
 * Chiffrement des secrets stockés en base (`BrandCredential.passwordEncrypted`).
 *
 * Format figé par la spec : exactement `iv:authTag:ciphertext`, trois segments
 * base64 non vides. IV de 12 octets, authTag de 16 octets, AES-256-GCM avec une
 * AAD constante liant le chiffré à son usage. Aucun key-id, aucune version dans
 * le payload : un ciphertext corrompu et un ciphertext de l'ancienne clé sont
 * donc indiscernables — c'est précisément pourquoi chaque repli sur
 * `_PREVIOUS` est journalisé.
 *
 * ⚠️ La clé est lue DANS les fonctions, jamais au niveau module. `next build`
 * importe les modules sans les secrets d'exécution : un `throw` au chargement
 * casserait le build (même prudence que l'URL factice de `src/lib/db.ts`).
 *
 * ⚠️ Aucun log de ce module ne contient de clair, de clé, ni de ciphertext.
 *
 * Rotation sans interruption :
 *   1. nouvelle clé en `CREDENTIALS_ENCRYPTION_KEY`, ancienne en
 *      `CREDENTIALS_ENCRYPTION_KEY_PREVIOUS`, redéploiement ;
 *   2. `npx tsx scripts/rewrap-credentials.ts --apply` re-chiffre toutes les
 *      lignes — c'est LUI le mécanisme de sortie, pas le rewrap paresseux ;
 *   3. `_PREVIOUS` supprimée quand le script ne rapporte plus aucune ligne.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

/**
 * AAD constante : lie le chiffré à son usage sans consommer de segment du
 * format à trois champs. Reproductible au déchiffrement, donc compatible avec
 * l'absence de key-id.
 */
const AAD = Buffer.from('BrandCredential.password', 'utf8');

/** Hex imposé pour lever l'ambiguïté base64/hex — `openssl rand -hex 32`. */
const KEY_PATTERN = /^[0-9a-fA-F]{64}$/;

const CURRENT_KEY_ENV = 'CREDENTIALS_ENCRYPTION_KEY';
const PREVIOUS_KEY_ENV = 'CREDENTIALS_ENCRYPTION_KEY_PREVIOUS';

const KEY_ERROR = 'CREDENTIALS_ENCRYPTION_KEY absente ou invalide (64 caractères hexadécimaux attendus)';
const PAYLOAD_ERROR = 'Secret chiffré invalide : format « iv:authTag:ciphertext » attendu (3 segments base64)';
const DECRYPT_ERROR = 'Déchiffrement impossible : le secret ne correspond à aucune clé déclarée';

/** Lit une clé hexadécimale de 32 octets, ou `null` si absente/malformée. */
function readKey(envName: string): Buffer | null {
    const raw = (process.env[envName] || '').trim();
    if (!raw || !KEY_PATTERN.test(raw)) return null;
    return Buffer.from(raw, 'hex');
}

/** Clé courante, ou échec explicite. Aucun repli en clair n'existe. */
function requireCurrentKey(): Buffer {
    const key = readKey(CURRENT_KEY_ENV);
    if (!key) throw new Error(KEY_ERROR);
    return key;
}

interface ParsedPayload {
    iv: Buffer;
    authTag: Buffer;
    ciphertext: Buffer;
}

/** Rejette un payload malformé AVANT tout appel à `node:crypto`. */
function parsePayload(payload: string): ParsedPayload {
    const segments = typeof payload === 'string' ? payload.split(':') : [];
    if (segments.length !== 3 || segments.some(s => s.length === 0)) {
        throw new Error(PAYLOAD_ERROR);
    }

    const iv = Buffer.from(segments[0], 'base64');
    const authTag = Buffer.from(segments[1], 'base64');
    const ciphertext = Buffer.from(segments[2], 'base64');

    if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES || ciphertext.length === 0) {
        throw new Error(PAYLOAD_ERROR);
    }
    return { iv, authTag, ciphertext };
}

function decryptWith(key: Buffer, parsed: ParsedPayload): string {
    const decipher = createDecipheriv(ALGORITHM, key, parsed.iv);
    decipher.setAAD(AAD);
    decipher.setAuthTag(parsed.authTag);
    return Buffer.concat([decipher.update(parsed.ciphertext), decipher.final()]).toString('utf8');
}

/**
 * Au plus DEUX tentatives : clé courante, puis `_PREVIOUS` si elle est déclarée.
 * L'échec des deux est terminal. `verbose` est faux depuis `needsRewrap()` pour
 * ne pas dupliquer le log du repli déjà émis par `decryptSecret()`.
 */
function tryDecrypt(payload: string, verbose: boolean): { plaintext: string; usedPrevious: boolean } {
    const parsed = parsePayload(payload);
    const current = requireCurrentKey();

    try {
        return { plaintext: decryptWith(current, parsed), usedPrevious: false };
    } catch {
        // Volontairement silencieux ici : le message d'origine de node:crypto
        // n'apporte rien et le log utile est celui du repli, ci-dessous.
    }

    const previous = readKey(PREVIOUS_KEY_ENV);
    if (!previous) throw new Error(DECRYPT_ERROR);

    if (verbose) {
        // Sans ce log, une corruption serait indiscernable d'un ancien chiffrement.
        console.error('[crypto] échec de déchiffrement avec la clé courante, tentative avec _PREVIOUS');
    }

    try {
        return { plaintext: decryptWith(previous, parsed), usedPrevious: true };
    } catch {
        throw new Error(DECRYPT_ERROR);
    }
}

/** Chiffre un secret avec la clé courante. Retourne `iv:authTag:ciphertext`. */
export function encryptSecret(plaintext: string): string {
    const key = requireCurrentKey();
    const iv = randomBytes(IV_BYTES);

    const cipher = createCipheriv(ALGORITHM, key, iv);
    cipher.setAAD(AAD);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(':');
}

/** Déchiffre avec la clé courante, puis `_PREVIOUS` si elle est déclarée. */
export function decryptSecret(payload: string): string {
    return tryDecrypt(payload, true).plaintext;
}

/** `true` si le payload n'a pu être lu qu'avec `_PREVIOUS` — il doit être re-chiffré. */
export function needsRewrap(payload: string): boolean {
    return tryDecrypt(payload, false).usedPrevious;
}

/**
 * Empreinte courte (8 hex) de la clé courante, pour les logs et les portes de
 * déploiement : confirme que prod, preview et scripts partagent la même clé
 * sans jamais l'exposer.
 */
export function keyFingerprint(): string {
    const key = requireCurrentKey();
    return createHash('sha256').update(key).digest('hex').slice(0, 8);
}
