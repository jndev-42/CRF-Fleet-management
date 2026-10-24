/**
 * Cycle de vie des jetons MCP en base (`src/lib/mcp/tokens.ts`) : création (empreinte
 * seule), limite de 10 actifs, vérification (révocation, expiration, droits du
 * propriétaire relus à l'appel), liste et révocation.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});

import { db, seedRoles, seedUniteLocale, seedUser, seedUserRole, seedUserUL } from './setup';
import {
    MAX_ACTIVE_MCP_TOKENS,
    McpTokenLimitError,
    createMcpToken,
    hashToken,
    listMcpTokens,
    loadMcpPrincipal,
    revokeMcpToken,
    verifyMcpToken,
} from '@/lib/mcp/tokens';

async function seedAdmin(id = 'u-admin', role = 'ADMIN') {
    await seedUser({ id, email: `${id}@croix-rouge.fr`, name: id });
    await seedUserRole(id, role);
    await seedUserUL({ userId: id, ulId: 'ul-paris-18', isHome: true });
}

async function tokenRow(id: string) {
    return (await db.execute({ sql: `SELECT * FROM "McpToken" WHERE id = ?`, args: [id] })).rows[0];
}

beforeEach(async () => {
    await seedRoles();
    await seedUniteLocale();
    await seedAdmin();
});

describe('createMcpToken', () => {
    it("ne stocke que l'empreinte et le préfixe, avec l'expiration choisie", async () => {
        const now = new Date('2026-10-24T10:00:00.000Z');
        const { token, info } = await createMcpToken({ userId: 'u-admin', name: 'Claude', scope: 'read', validityDays: 30, now });

        const row = await tokenRow(info.id);
        expect(row.tokenHash).toBe(hashToken(token));
        expect(row.tokenPrefix).toBe(token.slice(0, 12));
        expect(JSON.stringify(row)).not.toContain(token);
        expect(info).toMatchObject({
            userId: 'u-admin', userEmail: 'u-admin@croix-rouge.fr', name: 'Claude', scope: 'read',
            createdAt: '2026-10-24T10:00:00.000Z', expiresAt: '2026-11-23T10:00:00.000Z', lastUsedAt: null, revokedAt: null,
        });
        expect(info).not.toHaveProperty('tokenHash');
    });

    it(`refuse au-delà de ${MAX_ACTIVE_MCP_TOKENS} jetons actifs ; révoqués et expirés ne comptent pas`, async () => {
        const ids: string[] = [];
        for (let i = 0; i < MAX_ACTIVE_MCP_TOKENS; i++) {
            ids.push((await createMcpToken({ userId: 'u-admin', name: `t${i}`, scope: 'read', validityDays: 90 })).info.id);
        }
        await expect(createMcpToken({ userId: 'u-admin', name: 'trop', scope: 'read', validityDays: 90 })).rejects.toBeInstanceOf(McpTokenLimitError);

        await revokeMcpToken(ids[0]);
        await db.execute({ sql: `UPDATE "McpToken" SET expiresAt = ? WHERE id = ?`, args: ['2020-01-01T00:00:00.000Z', ids[1]] });
        await createMcpToken({ userId: 'u-admin', name: 'ok-1', scope: 'read', validityDays: 90 });
        await createMcpToken({ userId: 'u-admin', name: 'ok-2', scope: 'read', validityDays: 90 });
        await expect(createMcpToken({ userId: 'u-admin', name: 'trop', scope: 'read', validityDays: 90 })).rejects.toBeInstanceOf(McpTokenLimitError);
    });
});

describe('verifyMcpToken', () => {
    it('jeton valide : propriétaire, rôles relus, UL d\'attache, lastUsedAt mis à jour', async () => {
        const { token, info } = await createMcpToken({ userId: 'u-admin', name: 'Claude', scope: 'write', validityDays: 90 });
        const now = new Date();
        const principal = await verifyMcpToken(token, now);
        expect(principal).toMatchObject({
            tokenId: info.id, tokenName: 'Claude', scope: 'write', userId: 'u-admin',
            email: 'u-admin@croix-rouge.fr', roles: ['ADMIN'], ulId: 'ul-paris-18',
        });
        expect((await tokenRow(info.id)).lastUsedAt).toBe(now.toISOString());
    });

    it('refuse un jeton inconnu ou mal formé', async () => {
        await createMcpToken({ userId: 'u-admin', name: 'Claude', scope: 'read', validityDays: 90 });
        expect(await verifyMcpToken(`crf_mcp_${'a'.repeat(43)}`)).toBeNull();
        expect(await verifyMcpToken('nimporte-quoi')).toBeNull();
        expect(await verifyMcpToken(undefined)).toBeNull();
    });

    it('refuse un jeton révoqué', async () => {
        const { token, info } = await createMcpToken({ userId: 'u-admin', name: 'Claude', scope: 'read', validityDays: 90 });
        await revokeMcpToken(info.id);
        expect(await verifyMcpToken(token)).toBeNull();
    });

    it('refuse un jeton expiré', async () => {
        const { token } = await createMcpToken({ userId: 'u-admin', name: 'Claude', scope: 'read', validityDays: 30 });
        expect(await verifyMcpToken(token, new Date(Date.now() + 31 * 24 * 3600 * 1000))).toBeNull();
    });

    it("refuse le jeton d'un propriétaire qui n'est plus ADMIN", async () => {
        const { token } = await createMcpToken({ userId: 'u-admin', name: 'Claude', scope: 'read', validityDays: 90 });
        await db.execute(`DELETE FROM "UserRole" WHERE userId = 'u-admin'`);
        await seedUserRole('u-admin', 'CHVL');
        expect(await verifyMcpToken(token)).toBeNull();
    });

    it("refuse le jeton d'un propriétaire devenu INACTIF, même toujours ADMIN", async () => {
        const { token } = await createMcpToken({ userId: 'u-admin', name: 'Claude', scope: 'read', validityDays: 90 });
        await seedUserUL({ userId: 'u-admin', ulId: 'ul-paris-18', isHome: true, roles: ['ADMIN', 'INACTIF'] });
        expect(await verifyMcpToken(token)).toBeNull();
    });

    it("accepte le jeton d'un SUPER_ADMIN", async () => {
        await seedAdmin('u-super', 'SUPER_ADMIN');
        const { token } = await createMcpToken({ userId: 'u-super', name: 'Claude', scope: 'read', validityDays: 90 });
        expect((await verifyMcpToken(token))?.roles).toContain('SUPER_ADMIN');
    });
});

describe('loadMcpPrincipal', () => {
    it("exige que l'utilisateur de l'assertion soit le propriétaire du jeton", async () => {
        const { info } = await createMcpToken({ userId: 'u-admin', name: 'Claude', scope: 'read', validityDays: 90 });
        expect((await loadMcpPrincipal(info.id, 'u-admin'))?.userId).toBe('u-admin');
        expect(await loadMcpPrincipal(info.id, 'u-autre')).toBeNull();
        await revokeMcpToken(info.id);
        expect(await loadMcpPrincipal(info.id, 'u-admin')).toBeNull();
    });
});

describe('listMcpTokens / revokeMcpToken', () => {
    it('liste les jetons d\'un utilisateur ou de tous, la révocation est idempotente', async () => {
        await seedAdmin('u-other');
        const mine = await createMcpToken({ userId: 'u-admin', name: 'A', scope: 'read', validityDays: 90 });
        await createMcpToken({ userId: 'u-other', name: 'B', scope: 'write', validityDays: 90 });

        expect((await listMcpTokens('u-admin')).map(t => t.name)).toEqual(['A']);
        expect((await listMcpTokens()).map(t => t.name).sort()).toEqual(['A', 'B']);

        const first = new Date('2026-10-24T10:00:00.000Z');
        await revokeMcpToken(mine.info.id, first);
        await revokeMcpToken(mine.info.id, new Date('2026-10-25T10:00:00.000Z'));
        expect((await tokenRow(mine.info.id)).revokedAt).toBe(first.toISOString());
    });
});
