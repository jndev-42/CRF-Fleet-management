/**
 * DDL du journal d'audit — partagé par la migration prod, la base de dev et les
 * tests d'intégration, pour que les trois ne divergent jamais.
 *
 * Journal en ajout seul : aucune route ne modifie ni ne supprime une ligne, hors
 * purge quotidienne des entrées de plus de `AUDIT_RETENTION_DAYS` jours.
 * `createdAt` est un ISO 8601 (UTC) écrit par l'application : comparable en
 * texte, donc indexable pour le tri et la fenêtre de rétention.
 */

export const AUDIT_RETENTION_DAYS = 30;

export const AUDIT_LOG_TABLE = 'AuditLog';

export const AUDIT_LOG_DDL = `CREATE TABLE IF NOT EXISTS "${AUDIT_LOG_TABLE}" (
    "id"                TEXT NOT NULL PRIMARY KEY,
    "createdAt"         TEXT NOT NULL,
    "actorUserId"       TEXT,
    "actorEmail"        TEXT,
    "actorName"         TEXT,
    "impersonatedEmail" TEXT,
    "ulId"              TEXT,
    "method"            TEXT NOT NULL,
    "path"              TEXT NOT NULL,
    "action"            TEXT NOT NULL,
    "entityType"        TEXT,
    "entityId"          TEXT,
    "status"            INTEGER NOT NULL,
    "ip"                TEXT,
    "userAgent"         TEXT
)`;

export const AUDIT_LOG_INDEXES: { name: string; ddl: string }[] = [
    {
        name: 'AuditLog_createdAt_idx',
        ddl: `CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "${AUDIT_LOG_TABLE}" ("createdAt")`,
    },
    {
        name: 'AuditLog_actorEmail_createdAt_idx',
        ddl: `CREATE INDEX IF NOT EXISTS "AuditLog_actorEmail_createdAt_idx" ON "${AUDIT_LOG_TABLE}" ("actorEmail", "createdAt")`,
    },
];
