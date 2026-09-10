// @vitest-environment node
/**
 * Chiffrement des secrets `BrandCredential.passwordEncrypted`.
 *
 * Ce module est le seul point de passage d'un mot de passe constructeur vers la
 * base. Trois propriétés y sont non négociables et testées ici :
 *   — un payload altéré est REJETÉ, jamais déchiffré partiellement (AES-GCM) ;
 *   — une clé absente ou malformée échoue explicitement, sans repli en clair ;
 *   — aucun log n'expose le clair, y compris sur les chemins d'erreur.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { encryptSecret, decryptSecret, needsRewrap, keyFingerprint } from '@/lib/crypto';

/** Deux clés valides distinctes — 64 caractères hexadécimaux, comme `openssl rand -hex 32`. */
const KEY_CURRENT = '3f8a1c9d2b4e6f0a7c5d3e1b9f8a6c4d2e0b7f5a3c1d9e8b6f4a2c0d8e6b4f2a';
const KEY_PREVIOUS = 'b1d3f5a7c9e0b2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a2c4e6b8d0f2a4c6e8b0d2';

const PASSWORD = 'MotDeP4sse-MyRenault!2026';

const ENV_CURRENT = 'CREDENTIALS_ENCRYPTION_KEY';
const ENV_PREVIOUS = 'CREDENTIALS_ENCRYPTION_KEY_PREVIOUS';

const KEY_ERROR = 'CREDENTIALS_ENCRYPTION_KEY absente ou invalide (64 caractères hexadécimaux attendus)';

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
    saved[ENV_CURRENT] = process.env[ENV_CURRENT];
    saved[ENV_PREVIOUS] = process.env[ENV_PREVIOUS];
    process.env[ENV_CURRENT] = KEY_CURRENT;
    delete process.env[ENV_PREVIOUS];
});

afterEach(() => {
    for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    }
    vi.restoreAllMocks();
});

/** Inverse le premier octet du segment demandé (0 = iv, 1 = authTag, 2 = ciphertext). */
function tamper(payload: string, segment: number): string {
    const parts = payload.split(':');
    const buf = Buffer.from(parts[segment], 'base64');
    buf[0] ^= 0xff;
    parts[segment] = buf.toString('base64');
    return parts.join(':');
}

describe('crypto — chiffrement des secrets constructeur', () => {
    it('effectue un round-trip et respecte le format iv:authTag:ciphertext', () => {
        const payload = encryptSecret(PASSWORD);

        const segments = payload.split(':');
        expect(segments).toHaveLength(3);
        expect(segments.every(s => s.length > 0)).toBe(true);
        expect(Buffer.from(segments[0], 'base64')).toHaveLength(12);
        expect(Buffer.from(segments[1], 'base64')).toHaveLength(16);
        expect(payload).not.toContain(PASSWORD);

        expect(decryptSecret(payload)).toBe(PASSWORD);
    });

    it('tire un IV aléatoire : deux chiffrements du même clair diffèrent', () => {
        const first = encryptSecret(PASSWORD);
        const second = encryptSecret(PASSWORD);

        expect(first).not.toBe(second);
        expect(first.split(':')[0]).not.toBe(second.split(':')[0]);
        // Les deux restent déchiffrables : c'est ce qui rend le rewrap
        // concurrent redondant plutôt que corrompant.
        expect(decryptSecret(first)).toBe(PASSWORD);
        expect(decryptSecret(second)).toBe(PASSWORD);
    });

    it('rejette un authTag altéré', () => {
        const altered = tamper(encryptSecret(PASSWORD), 1);
        expect(() => decryptSecret(altered)).toThrow('Déchiffrement impossible');
    });

    it('rejette un ciphertext altéré', () => {
        const altered = tamper(encryptSecret(PASSWORD), 2);
        expect(() => decryptSecret(altered)).toThrow('Déchiffrement impossible');
    });

    it('rejette un payload dont un segment manque ou est vide', () => {
        const payload = encryptSecret(PASSWORD);
        const [iv, authTag, ciphertext] = payload.split(':');

        expect(() => decryptSecret(`${iv}:${ciphertext}`)).toThrow('Secret chiffré invalide');
        expect(() => decryptSecret(`${iv}::${ciphertext}`)).toThrow('Secret chiffré invalide');
        expect(() => decryptSecret(`${iv}:${authTag}:${ciphertext}:extra`)).toThrow('Secret chiffré invalide');
        expect(() => decryptSecret('')).toThrow('Secret chiffré invalide');
    });

    it('échoue explicitement quand la clé est absente, sans jamais dégrader', () => {
        const payload = encryptSecret(PASSWORD);
        delete process.env[ENV_CURRENT];

        expect(() => encryptSecret(PASSWORD)).toThrow(KEY_ERROR);
        expect(() => decryptSecret(payload)).toThrow(KEY_ERROR);
        expect(() => keyFingerprint()).toThrow(KEY_ERROR);
    });

    it('rejette une clé de 63 caractères', () => {
        process.env[ENV_CURRENT] = KEY_CURRENT.slice(0, 63);
        expect(() => encryptSecret(PASSWORD)).toThrow(KEY_ERROR);

        // Et toute autre longueur ou alphabet hors hexadécimal.
        process.env[ENV_CURRENT] = `${KEY_CURRENT}00`;
        expect(() => encryptSecret(PASSWORD)).toThrow(KEY_ERROR);
        process.env[ENV_CURRENT] = 'z'.repeat(64);
        expect(() => encryptSecret(PASSWORD)).toThrow(KEY_ERROR);
    });

    it('déchiffre via _PREVIOUS après rotation et signale le besoin de rewrap', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

        // Chiffré avec l'ancienne clé, avant la rotation.
        process.env[ENV_CURRENT] = KEY_PREVIOUS;
        const legacy = encryptSecret(PASSWORD);

        // Rotation : nouvelle clé courante, ancienne conservée en repli.
        process.env[ENV_CURRENT] = KEY_CURRENT;
        process.env[ENV_PREVIOUS] = KEY_PREVIOUS;

        expect(decryptSecret(legacy)).toBe(PASSWORD);
        expect(needsRewrap(legacy)).toBe(true);
        expect(consoleError).toHaveBeenCalledWith(
            '[crypto] échec de déchiffrement avec la clé courante, tentative avec _PREVIOUS'
        );

        // Après rewrap, la clé courante suffit et le repli n'est plus emprunté.
        const rewrapped = encryptSecret(decryptSecret(legacy));
        expect(needsRewrap(rewrapped)).toBe(false);
        expect(decryptSecret(rewrapped)).toBe(PASSWORD);

        // L'empreinte est courte et hexadécimale : elle n'expose jamais la clé.
        expect(keyFingerprint()).toMatch(/^[0-9a-f]{8}$/);
    });

    it('n\'écrit jamais le clair dans les logs, y compris sur les chemins d\'erreur', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        process.env[ENV_CURRENT] = KEY_PREVIOUS;
        const legacy = encryptSecret(PASSWORD);
        process.env[ENV_CURRENT] = KEY_CURRENT;
        process.env[ENV_PREVIOUS] = KEY_PREVIOUS;

        decryptSecret(legacy);                                  // repli loggué
        expect(() => decryptSecret(tamper(legacy, 2))).toThrow(); // deux clés en échec
        expect(() => decryptSecret('nawak')).toThrow();           // format invalide

        const logged = [consoleError, consoleLog, consoleWarn]
            .flatMap(spy => spy.mock.calls)
            .flat()
            .map(arg => String(arg))
            .join('\n');

        expect(consoleError).toHaveBeenCalled();
        expect(logged).not.toContain(PASSWORD);
        expect(logged).not.toContain(KEY_CURRENT);
        expect(logged).not.toContain(KEY_PREVIOUS);
    });
});
