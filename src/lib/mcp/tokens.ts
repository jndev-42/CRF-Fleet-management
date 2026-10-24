/**
 * Jetons d'accès IA (serveur MCP) : génération, empreinte, vérification, liste, révocation.
 *
 * Un jeton fait agir l'IA **en tant que son propriétaire** : mêmes rôles, même UL
 * d'attache, mêmes contrôles que les routes existantes. Les droits sont relus en base
 * à chaque appel — un compte devenu INACTIF, ou qui n'est plus ADMIN/SUPER_ADMIN, voit
 * ses jetons refusés sans qu'il faille les révoquer.
 *
 * Seule l'empreinte SHA-256 est stockée ; le jeton complet n'existe qu'au retour de
 * `createMcpToken`, affiché une fois à l'administrateur.
 */
import { createHash, randomBytes } from 'crypto';
import { db } from '@/lib/db';
import { isAdminOrAbove } from '@/lib/roles';
import { resolveSessionRoles } from '@/lib/session-roles';
import { fetchUserULs, resolveActiveUL, type ULEntry } from '@/lib/user-uls';
import { MCP_TOKEN_TABLE } from './schema';

export const MCP_TOKEN_PREFIX = 'crf_mcp_';
/** Longueur du préfixe conservé pour reconnaître un jeton dans la liste. */
export const MCP_TOKEN_DISPLAY_PREFIX_LENGTH = 12;
export const MAX_ACTIVE_MCP_TOKENS = 10;
export const MCP_TOKEN_VALIDITY_DAYS = [30, 90, 365] as const;
export const DEFAULT_MCP_TOKEN_VALIDITY_DAYS = 90;
export const MCP_SCOPES = ['read', 'write'] as const;

export type McpScope = (typeof MCP_SCOPES)[number];
export type McpTokenValidityDays = (typeof MCP_TOKEN_VALIDITY_DAYS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
/** `crf_mcp_` + 32 octets en base64url (43 caractères, sans remplissage). */
const RAW_TOKEN_RE = /^crf_mcp_[A-Za-z0-9_-]{43}$/;

export function generateRawToken(): string {
    return MCP_TOKEN_PREFIX + randomBytes(32).toString('base64url');
}

export function hashToken(raw: string): string {
    return createHash('sha256').update(raw, 'utf8').digest('hex');
}

export function tokenDisplayPrefix(raw: string): string {
    return raw.slice(0, MCP_TOKEN_DISPLAY_PREFIX_LENGTH);
}

export function isWellFormedToken(raw: unknown): raw is string {
    return typeof raw === 'string' && RAW_TOKEN_RE.test(raw);
}

/** Ligne de la liste des jetons — jamais l'empreinte. */
export interface McpTokenInfo {
    id: string;
    userId: string;
    userEmail: string | null;
    userName: string | null;
    name: string;
    tokenPrefix: string;
    scope: McpScope;
    createdAt: string;
    expiresAt: string;
    lastUsedAt: string | null;
    revokedAt: string | null;
}

/** Propriétaire d'un jeton valide, avec ses droits relus au moment de l'appel. */
export interface McpPrincipal {
    tokenId: string;
    tokenName: string;
    scope: McpScope;
    expiresAt: string;
    userId: string;
    email: string;
    name: string | null;
    roles: string[];
    ulId: string;
    availableULs: ULEntry[];
}

export class McpTokenLimitError extends Error {
    constructor() {
        super(`Nombre maximal de jetons actifs atteint (${MAX_ACTIVE_MCP_TOKENS}) : révoquez-en un avant d'en créer un autre`);
        this.name = 'McpTokenLimitError';
    }
}

function str(value: unknown): string | null {
    return value == null ? null : String(value);
}

function toInfo(row: Record<string, unknown>): McpTokenInfo {
    return {
        id: String(row.id),
        userId: String(row.userId),
        userEmail: str(row.userEmail),
        userName: str(row.userName),
        name: String(row.name),
        tokenPrefix: String(row.tokenPrefix),
        scope: row.scope === 'write' ? 'write' : 'read',
        createdAt: String(row.createdAt),
        expiresAt: String(row.expiresAt),
        lastUsedAt: str(row.lastUsedAt),
        revokedAt: str(row.revokedAt),
    };
}

const SELECT_INFO = `SELECT t.id, t.userId, u.email AS userEmail, u.name AS userName, t.name, t.tokenPrefix,
                            t.scope, t.createdAt, t.expiresAt, t.lastUsedAt, t.revokedAt
                       FROM "${MCP_TOKEN_TABLE}" t
                       LEFT JOIN "User" u ON u.id = t.userId`;

/**
 * Crée un jeton pour `userId` — toujours pour soi-même : l'appelant passe l'id de la
 * session, jamais un id reçu dans la requête. Lève `McpTokenLimitError` au-delà de
 * `MAX_ACTIVE_MCP_TOKENS` jetons actifs (ni révoqués ni expirés).
 */
export async function createMcpToken(input: {
    userId: string;
    name: string;
    scope: McpScope;
    validityDays: McpTokenValidityDays;
    now?: Date;
}): Promise<{ token: string; info: McpTokenInfo }> {
    const now = input.now ?? new Date();
    const nowIso = now.toISOString();
    const active = await db.execute({
        sql: `SELECT COUNT(*) AS n FROM "${MCP_TOKEN_TABLE}" WHERE userId = ? AND revokedAt IS NULL AND expiresAt > ?`,
        args: [input.userId, nowIso],
    });
    if (Number(active.rows[0]?.n ?? 0) >= MAX_ACTIVE_MCP_TOKENS) throw new McpTokenLimitError();

    const token = generateRawToken();
    const id = crypto.randomUUID();
    const expiresAt = new Date(now.getTime() + input.validityDays * DAY_MS).toISOString();
    await db.execute({
        sql: `INSERT INTO "${MCP_TOKEN_TABLE}" (id, userId, name, tokenHash, tokenPrefix, scope, createdAt, expiresAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [id, input.userId, input.name, hashToken(token), tokenDisplayPrefix(token), input.scope, nowIso, expiresAt],
    });
    const info = await getMcpToken(id);
    if (!info) throw new Error('Jeton introuvable après création');
    return { token, info };
}

export async function getMcpToken(id: string): Promise<McpTokenInfo | null> {
    const res = await db.execute({ sql: `${SELECT_INFO} WHERE t.id = ?`, args: [id] });
    return res.rows[0] ? toInfo(res.rows[0] as Record<string, unknown>) : null;
}

/** Jetons d'un utilisateur, ou de tous (`userId` absent : SUPER_ADMIN), les plus récents d'abord. */
export async function listMcpTokens(userId?: string): Promise<McpTokenInfo[]> {
    const res = userId
        ? await db.execute({ sql: `${SELECT_INFO} WHERE t.userId = ? ORDER BY t.createdAt DESC, t.id DESC`, args: [userId] })
        : await db.execute(`${SELECT_INFO} ORDER BY t.createdAt DESC, t.id DESC`);
    return res.rows.map(r => toInfo(r as Record<string, unknown>));
}

/** Révoque un jeton (idempotent : une révocation déjà faite garde sa date). */
export async function revokeMcpToken(id: string, now: Date = new Date()): Promise<void> {
    await db.execute({
        sql: `UPDATE "${MCP_TOKEN_TABLE}" SET revokedAt = ? WHERE id = ? AND revokedAt IS NULL`,
        args: [now.toISOString(), id],
    });
}

/**
 * Charge le propriétaire d'un jeton s'il est encore valide : non révoqué, non expiré,
 * propriétaire ADMIN ou SUPER_ADMIN et non INACTIF sur son UL d'attache. Sinon `null`.
 */
async function loadPrincipal(where: 'id' | 'tokenHash', value: string, now: Date): Promise<McpPrincipal | null> {
    const res = await db.execute({
        sql: `SELECT t.id, t.name, t.scope, t.expiresAt, t.revokedAt, t.userId, u.email, u.name AS userName
                FROM "${MCP_TOKEN_TABLE}" t
                JOIN "User" u ON u.id = t.userId
               WHERE t.${where} = ?`,
        args: [value],
    });
    const row = res.rows[0];
    if (!row || row.revokedAt != null) return null;
    const expiresAt = String(row.expiresAt);
    if (expiresAt <= now.toISOString()) return null;

    const userId = String(row.userId);
    const availableULs = await fetchUserULs(userId);
    const ulId = resolveActiveUL(availableULs);
    const roles = await resolveSessionRoles(db, userId, ulId);
    // `isAdminOrAbove` refuse INACTIF : un compte bloqué perd ses jetons.
    if (!isAdminOrAbove(roles)) return null;

    return {
        tokenId: String(row.id),
        tokenName: String(row.name),
        scope: row.scope === 'write' ? 'write' : 'read',
        expiresAt,
        userId,
        email: String(row.email),
        name: str(row.userName),
        roles,
        ulId,
        availableULs,
    };
}

/**
 * Vérifie un jeton brut présenté à `/api/mcp` et met à jour `lastUsedAt`.
 * `null` pour un jeton inconnu, mal formé, révoqué, expiré ou dont le propriétaire a perdu ses droits.
 */
export async function verifyMcpToken(raw: unknown, now: Date = new Date()): Promise<McpPrincipal | null> {
    if (!isWellFormedToken(raw)) return null;
    const principal = await loadPrincipal('tokenHash', hashToken(raw), now);
    if (!principal) return null;
    try {
        await db.execute({
            sql: `UPDATE "${MCP_TOKEN_TABLE}" SET lastUsedAt = ? WHERE id = ?`,
            args: [now.toISOString(), principal.tokenId],
        });
    } catch (e: unknown) {
        // Non fatal : la date de dernière utilisation est indicative.
        console.error('[mcp] mise à jour de lastUsedAt impossible :', e instanceof Error ? e.message : String(e));
    }
    return principal;
}

/**
 * Recharge le propriétaire d'un jeton désigné par une assertion interne (`auth()`).
 * Mêmes contrôles que `verifyMcpToken`, et l'assertion doit viser le bon utilisateur.
 */
export async function loadMcpPrincipal(tokenId: string, userId: string, now: Date = new Date()): Promise<McpPrincipal | null> {
    const principal = await loadPrincipal('id', tokenId, now);
    return principal && principal.userId === userId ? principal : null;
}
