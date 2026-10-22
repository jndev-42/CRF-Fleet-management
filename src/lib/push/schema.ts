/**
 * DDL des abonnements Web Push — partagé par la migration prod, la base de dev et
 * les tests d'intégration, pour que les trois ne divergent jamais.
 *
 * Une ligne par navigateur/appareil abonné (`endpoint` unique : l'URL du service push
 * du navigateur). Un même utilisateur peut avoir plusieurs appareils ; un appareil
 * réutilisé par un autre compte est réattribué (upsert sur `endpoint`).
 */

export const PUSH_SUBSCRIPTION_TABLE = 'PushSubscription';

export const PUSH_SUBSCRIPTION_DDL = `CREATE TABLE IF NOT EXISTS "${PUSH_SUBSCRIPTION_TABLE}" (
    "id"         TEXT NOT NULL PRIMARY KEY,
    "userId"     TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "endpoint"   TEXT NOT NULL UNIQUE,
    "p256dh"     TEXT NOT NULL,
    "auth"       TEXT NOT NULL,
    "userAgent"  TEXT,
    "createdAt"  TEXT NOT NULL DEFAULT (datetime('now')),
    "lastSeenAt" TEXT NOT NULL DEFAULT (datetime('now'))
)`;

export const PUSH_SUBSCRIPTION_USER_INDEX_DDL =
    `CREATE INDEX IF NOT EXISTS "idx_PushSubscription_userId" ON "${PUSH_SUBSCRIPTION_TABLE}"("userId")`;
