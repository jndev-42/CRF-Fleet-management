/**
 * DDL des jetons d'accès IA (serveur MCP) — partagé par la migration prod, la base
 * de dev et les tests d'intégration, pour que les trois ne divergent jamais.
 *
 * Seule l'empreinte SHA-256 du jeton est stockée (`tokenHash`, unique) ; le jeton
 * complet n'est affiché qu'une fois, à la création. `tokenPrefix` (12 premiers
 * caractères) sert à le reconnaître dans la liste. Dates en ISO 8601 (UTC), écrites
 * par l'application : comparables en texte.
 */

export const MCP_TOKEN_TABLE = 'McpToken';

export const MCP_TOKEN_DDL = `CREATE TABLE IF NOT EXISTS "${MCP_TOKEN_TABLE}" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "userId"      TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "name"        TEXT NOT NULL,
    "tokenHash"   TEXT NOT NULL UNIQUE,
    "tokenPrefix" TEXT NOT NULL,
    "scope"       TEXT NOT NULL CHECK ("scope" IN ('read', 'write')),
    "createdAt"   TEXT NOT NULL,
    "expiresAt"   TEXT NOT NULL,
    "lastUsedAt"  TEXT,
    "revokedAt"   TEXT
)`;

export const MCP_TOKEN_INDEXES: { name: string; ddl: string }[] = [
    {
        name: 'McpToken_userId_idx',
        ddl: `CREATE INDEX IF NOT EXISTS "McpToken_userId_idx" ON "${MCP_TOKEN_TABLE}" ("userId")`,
    },
];
