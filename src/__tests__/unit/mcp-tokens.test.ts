/**
 * Fonctions pures des jetons MCP (`src/lib/mcp/tokens.ts`) : format, empreinte, préfixe.
 * Le cycle de vie en base (création, vérification, révocation) est couvert par
 * `integration/mcp-tokens-lib.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import {
    MCP_TOKEN_PREFIX,
    generateRawToken,
    hashToken,
    isWellFormedToken,
    tokenDisplayPrefix,
} from '@/lib/mcp/tokens';

describe('generateRawToken', () => {
    it('produit crf_mcp_ suivi de 32 octets en base64url', () => {
        const token = generateRawToken();
        expect(token.startsWith(MCP_TOKEN_PREFIX)).toBe(true);
        const random = token.slice(MCP_TOKEN_PREFIX.length);
        expect(random).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(Buffer.from(random, 'base64url')).toHaveLength(32);
    });

    it('ne produit jamais deux fois le même jeton', () => {
        const tokens = new Set(Array.from({ length: 200 }, generateRawToken));
        expect(tokens.size).toBe(200);
    });
});

describe('hashToken', () => {
    it('est le SHA-256 hexadécimal du jeton', () => {
        const token = generateRawToken();
        expect(hashToken(token)).toBe(createHash('sha256').update(token).digest('hex'));
        expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
        expect(hashToken(token)).not.toContain(token);
    });
});

describe('tokenDisplayPrefix', () => {
    it('garde les 12 premiers caractères', () => {
        const token = generateRawToken();
        expect(tokenDisplayPrefix(token)).toBe(token.slice(0, 12));
        expect(tokenDisplayPrefix(token)).toHaveLength(12);
    });
});

describe('isWellFormedToken', () => {
    it('accepte un jeton généré, refuse le reste', () => {
        expect(isWellFormedToken(generateRawToken())).toBe(true);
        for (const value of [undefined, null, 42, '', 'crf_mcp_', 'crf_mcp_court', `xxx_mcp_${'a'.repeat(43)}`, `crf_mcp_${'a'.repeat(44)}`, `crf_mcp_${'+'.repeat(43)}`]) {
            expect(isWellFormedToken(value)).toBe(false);
        }
    });
});
