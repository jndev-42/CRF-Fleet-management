/**
 * Assertion interne du serveur MCP — ce que porte un appel de `/api/mcp` vers l'API REST.
 *
 * Le jeton brut ne quitte jamais `/api/mcp` : l'outil `api_request` signe à la place une
 * assertion de courte durée (`MCP_ASSERTION_TTL_SECONDS`), HMAC-SHA256 avec `AUTH_SECRET`,
 * transmise dans l'en-tête `MCP_ASSERTION_HEADER`. `auth()` (src/auth.ts) la vérifie et
 * reconstruit la session du propriétaire ; les routes existantes n'ont rien à changer.
 *
 * Un jeton `read` ne peut produire d'assertion que pour `GET` : `signMcpAssertion` lève
 * pour toute autre méthode.
 *
 * Format : `<payload base64url>.<signature base64url>`.
 */
import { createHmac, timingSafeEqual } from 'crypto';
import type { McpScope } from './tokens';

export const MCP_ASSERTION_HEADER = 'x-crf-mcp-assertion';
export const MCP_ASSERTION_TTL_SECONDS = 60;

export interface McpAssertionClaims {
    userId: string;
    tokenId: string;
    scope: McpScope;
}

interface McpAssertionPayload extends McpAssertionClaims {
    /** Expiration, en secondes depuis l'époque Unix. */
    exp: number;
}

export class McpReadOnlyError extends Error {
    constructor() {
        super('Jeton en lecture seule : seules les requêtes GET sont autorisées');
        this.name = 'McpReadOnlyError';
    }
}

/** Lu à l'appel, jamais au chargement : `next build` importe les modules sans secrets. */
function secret(): string {
    const value = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
    if (!value) throw new Error('AUTH_SECRET absent : assertion MCP impossible');
    return value;
}

function sign(data: string, key: string): Buffer {
    return createHmac('sha256', key).update(`crf-mcp-assertion:${data}`).digest();
}

export function signMcpAssertion(claims: McpAssertionClaims, method: string, now: number = Date.now()): string {
    if (claims.scope !== 'write' && method.toUpperCase() !== 'GET') throw new McpReadOnlyError();
    const payload: McpAssertionPayload = {
        userId: claims.userId,
        tokenId: claims.tokenId,
        scope: claims.scope,
        exp: Math.floor(now / 1000) + MCP_ASSERTION_TTL_SECONDS,
    };
    const data = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return `${data}.${sign(data, secret()).toString('base64url')}`;
}

/** Claims d'une assertion authentique et non expirée ; `null` sinon (jamais d'exception). */
export function verifyMcpAssertion(value: string | null | undefined, now: number = Date.now()): McpAssertionClaims | null {
    if (!value) return null;
    const parts = value.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    const [data, signature] = parts;
    try {
        const expected = sign(data, secret());
        const given = Buffer.from(signature, 'base64url');
        if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

        const payload: unknown = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
        if (!payload || typeof payload !== 'object') return null;
        const { userId, tokenId, scope, exp } = payload as Partial<McpAssertionPayload>;
        if (typeof userId !== 'string' || !userId || typeof tokenId !== 'string' || !tokenId) return null;
        if (scope !== 'read' && scope !== 'write') return null;
        if (typeof exp !== 'number' || exp * 1000 <= now) return null;
        return { userId, tokenId, scope };
    } catch {
        return null;
    }
}
