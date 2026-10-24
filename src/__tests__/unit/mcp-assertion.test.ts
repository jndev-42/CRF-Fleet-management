/**
 * Assertion interne du serveur MCP (`src/lib/mcp/assertion.ts`) : signature HMAC,
 * expiration à 60 s, refus d'une assertion d'écriture pour un jeton en lecture seule.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    MCP_ASSERTION_TTL_SECONDS,
    McpReadOnlyError,
    signMcpAssertion,
    verifyMcpAssertion,
} from '@/lib/mcp/assertion';

const claims = { userId: 'u-1', tokenId: 'tok-1', scope: 'write' as const };
const NOW = Date.UTC(2026, 9, 24, 12, 0, 0);
let savedSecret: string | undefined;

beforeEach(() => {
    savedSecret = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = 'secret-de-test-assez-long-pour-hmac';
});

afterEach(() => {
    if (savedSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = savedSecret;
});

describe('signMcpAssertion / verifyMcpAssertion', () => {
    it("une assertion signée se vérifie et rend ses claims", () => {
        const value = signMcpAssertion(claims, 'PATCH', NOW);
        expect(verifyMcpAssertion(value, NOW)).toEqual(claims);
    });

    it('expire après 60 secondes', () => {
        const value = signMcpAssertion(claims, 'GET', NOW);
        expect(verifyMcpAssertion(value, NOW + (MCP_ASSERTION_TTL_SECONDS - 1) * 1000)).toEqual(claims);
        expect(verifyMcpAssertion(value, NOW + MCP_ASSERTION_TTL_SECONDS * 1000)).toBeNull();
    });

    it("un jeton read n'obtient d'assertion que pour GET", () => {
        const read = { ...claims, scope: 'read' as const };
        expect(verifyMcpAssertion(signMcpAssertion(read, 'get', NOW), NOW)).toEqual(read);
        for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
            expect(() => signMcpAssertion(read, method, NOW)).toThrow(McpReadOnlyError);
        }
    });

    it('refuse une assertion falsifiée (payload modifié, signature modifiée)', () => {
        const value = signMcpAssertion({ ...claims, scope: 'read' }, 'GET', NOW);
        const [data, signature] = value.split('.');
        const forged = Buffer.from(JSON.stringify({ ...claims, exp: NOW / 1000 + 60 })).toString('base64url');
        expect(verifyMcpAssertion(`${forged}.${signature}`, NOW)).toBeNull();
        const flipped = signature.slice(0, -1) + (signature.endsWith('A') ? 'B' : 'A');
        expect(verifyMcpAssertion(`${data}.${flipped}`, NOW)).toBeNull();
    });

    it('refuse une assertion signée avec un autre secret', () => {
        const value = signMcpAssertion(claims, 'GET', NOW);
        process.env.AUTH_SECRET = 'un-autre-secret';
        expect(verifyMcpAssertion(value, NOW)).toBeNull();
    });

    it('refuse les valeurs absentes ou mal formées, sans lever', () => {
        for (const value of [null, undefined, '', 'abc', 'a.b.c', '.x', 'x.', '%%%.%%%']) {
            expect(verifyMcpAssertion(value, NOW)).toBeNull();
        }
    });

    it('sans AUTH_SECRET : la signature lève, la vérification refuse', () => {
        const value = signMcpAssertion(claims, 'GET', NOW);
        delete process.env.AUTH_SECRET;
        delete process.env.NEXTAUTH_SECRET;
        expect(() => signMcpAssertion(claims, 'GET', NOW)).toThrow(/AUTH_SECRET/);
        expect(verifyMcpAssertion(value, NOW)).toBeNull();
    });
});
