/**
 * DDL du module « Suivi technique » de `/vehicles` — partagé par la migration prod
 * (`scripts/add-fleet-tracking.ts`), la base de dev (`scripts/setup-dev.ts`) et les
 * tests d'intégration, pour que les trois ne divergent jamais.
 *
 * `FLEET_TRACKING_DDL` est exécuté dans l'ordre ; chaque instruction est idempotente
 * (`IF NOT EXISTS`). Les livrables suivants (tâches, dossiers, contrôles) y ajoutent
 * leurs tables.
 */

export const FLEET_CONTACT_TABLE = 'FleetContact';

/**
 * Annuaire des prestataires (garage, carrossier, assureur, dépanneur…) d'une UL.
 * `phones` : JSON `[{ label, number }]` (1 à 5). `shared` : 0/1 — partagé, le contact
 * est lisible et exportable par les responsables de toutes les UL ; seule l'UL
 * propriétaire le modifie.
 */
export const FLEET_CONTACT_DDL = `CREATE TABLE IF NOT EXISTS "${FLEET_CONTACT_TABLE}" (
    "id"        TEXT NOT NULL PRIMARY KEY,
    "ulId"      TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "category"  TEXT NOT NULL,
    "phones"    TEXT NOT NULL DEFAULT '[]',
    "email"     TEXT,
    "address"   TEXT,
    "notes"     TEXT,
    "shared"    INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL
)`;

export const FLEET_CONTACT_INDEXES = [
    `CREATE INDEX IF NOT EXISTS "idx_FleetContact_ulId" ON "${FLEET_CONTACT_TABLE}" ("ulId")`,
    `CREATE INDEX IF NOT EXISTS "idx_FleetContact_shared" ON "${FLEET_CONTACT_TABLE}" ("shared")`,
];

// ── Tâches (livrable 2) ──────────────────────────────────────────

export const FLEET_TASK_TABLE = 'FleetTask';
export const FLEET_TASK_ASSIGNEE_TABLE = 'FleetTaskAssignee';
export const FLEET_TASK_LINK_TABLE = 'FleetTaskLink';
export const FLEET_ATTACHMENT_TABLE = 'FleetAttachment';

/**
 * Tâche du suivi technique d'une UL. `status` : TODO | IN_PROGRESS | WAITING | DONE ;
 * `priority` : NORMAL | HIGH ; `dueDate` : `YYYY-MM-DD` ou NULL (« Date à fixer ») ;
 * `pinned` : 0/1 ; `completedAt` posé au passage à DONE, effacé à la réouverture ;
 * `dossierId` : dossier de rattachement (livrable 3), NULL hors dossier. Jamais purgée.
 */
export const FLEET_TASK_DDL = `CREATE TABLE IF NOT EXISTS "${FLEET_TASK_TABLE}" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "ulId"        TEXT NOT NULL,
    "dossierId"   TEXT,
    "title"       TEXT NOT NULL,
    "description" TEXT,
    "status"      TEXT NOT NULL DEFAULT 'TODO',
    "priority"    TEXT NOT NULL DEFAULT 'NORMAL',
    "dueDate"     TEXT,
    "pinned"      INTEGER NOT NULL DEFAULT 0,
    "completedAt" TEXT,
    "createdBy"   TEXT,
    "createdAt"   TEXT NOT NULL,
    "updatedAt"   TEXT NOT NULL
)`;

/** Personnes assignées à une tâche (responsables actifs de l'UL de la tâche). */
export const FLEET_TASK_ASSIGNEE_DDL = `CREATE TABLE IF NOT EXISTS "${FLEET_TASK_ASSIGNEE_TABLE}" (
    "taskId"     TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "assignedAt" TEXT NOT NULL,
    PRIMARY KEY ("taskId", "userId")
)`;

/**
 * Rattachement d'une tâche à un objet existant : `targetType` VEHICLE | CONTACT |
 * INCIDENT | MAINTENANCE, `targetId` l'identifiant de la ligne visée.
 */
export const FLEET_TASK_LINK_DDL = `CREATE TABLE IF NOT EXISTS "${FLEET_TASK_LINK_TABLE}" (
    "id"         TEXT NOT NULL PRIMARY KEY,
    "taskId"     TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId"   TEXT NOT NULL,
    "createdAt"  TEXT NOT NULL,
    UNIQUE ("taskId", "targetType", "targetId")
)`;

/**
 * Pièce jointe d'une tâche (`ownerType` TASK) ou d'un dossier (DOSSIER, livrable 3).
 * Le binaire vit sur R2 (`r2Key`, rangé par UL), jamais en base.
 */
export const FLEET_ATTACHMENT_DDL = `CREATE TABLE IF NOT EXISTS "${FLEET_ATTACHMENT_TABLE}" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "ownerType"   TEXT NOT NULL,
    "ownerId"     TEXT NOT NULL,
    "ulId"        TEXT NOT NULL,
    "r2Key"       TEXT NOT NULL,
    "fileName"    TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size"        INTEGER NOT NULL,
    "uploadedBy"  TEXT,
    "createdAt"   TEXT NOT NULL
)`;

export const FLEET_TASK_INDEXES = [
    `CREATE INDEX IF NOT EXISTS "idx_FleetTask_ulId_status" ON "${FLEET_TASK_TABLE}" ("ulId", "status")`,
    `CREATE INDEX IF NOT EXISTS "idx_FleetTask_dossierId" ON "${FLEET_TASK_TABLE}" ("dossierId")`,
    `CREATE INDEX IF NOT EXISTS "idx_FleetTaskAssignee_userId" ON "${FLEET_TASK_ASSIGNEE_TABLE}" ("userId")`,
    `CREATE INDEX IF NOT EXISTS "idx_FleetTaskLink_target" ON "${FLEET_TASK_LINK_TABLE}" ("targetType", "targetId")`,
    `CREATE INDEX IF NOT EXISTS "idx_FleetAttachment_owner" ON "${FLEET_ATTACHMENT_TABLE}" ("ownerType", "ownerId")`,
];

// ── Dossiers (livrable 3) ────────────────────────────────────────

export const FLEET_DOSSIER_TABLE = 'FleetDossier';
export const FLEET_DOSSIER_ITEM_TABLE = 'FleetDossierItem';

/**
 * Dossier du suivi technique d'une UL (sinistre, panne…) rattaché à un véhicule de
 * l'UL. `status` : OPEN | CLOSED ; `closedAt` posé à la clôture, effacé à la
 * réouverture ; `pinned` : 0/1. Regroupe des tâches (`FleetTask.dossierId`), des
 * pièces à récupérer et des pièces jointes (`FleetAttachment` ownerType DOSSIER).
 * Jamais purgé : c'est l'historique technique du véhicule.
 */
export const FLEET_DOSSIER_DDL = `CREATE TABLE IF NOT EXISTS "${FLEET_DOSSIER_TABLE}" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "ulId"        TEXT NOT NULL,
    "vehicleId"   TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "description" TEXT,
    "status"      TEXT NOT NULL DEFAULT 'OPEN',
    "pinned"      INTEGER NOT NULL DEFAULT 0,
    "createdBy"   TEXT,
    "createdAt"   TEXT NOT NULL,
    "updatedAt"   TEXT NOT NULL,
    "closedAt"    TEXT
)`;

/**
 * Pièce à récupérer d'un dossier (devis, référence sinistre, facture…). `received`
 * 0/1 ; `receivedValue` (ex. numéro de sinistre), `attachmentId` (une pièce jointe
 * du dossier), `receivedAt` et `receivedBy` renseignés à la réception, effacés quand
 * on la décoche. `position` : ordre d'affichage (ordre d'ajout).
 */
export const FLEET_DOSSIER_ITEM_DDL = `CREATE TABLE IF NOT EXISTS "${FLEET_DOSSIER_ITEM_TABLE}" (
    "id"            TEXT NOT NULL PRIMARY KEY,
    "dossierId"     TEXT NOT NULL,
    "label"         TEXT NOT NULL,
    "received"      INTEGER NOT NULL DEFAULT 0,
    "receivedValue" TEXT,
    "attachmentId"  TEXT,
    "receivedAt"    TEXT,
    "receivedBy"    TEXT,
    "position"      INTEGER NOT NULL DEFAULT 0,
    "createdAt"     TEXT NOT NULL
)`;

export const FLEET_DOSSIER_INDEXES = [
    `CREATE INDEX IF NOT EXISTS "idx_FleetDossier_ulId_status" ON "${FLEET_DOSSIER_TABLE}" ("ulId", "status")`,
    `CREATE INDEX IF NOT EXISTS "idx_FleetDossier_vehicleId" ON "${FLEET_DOSSIER_TABLE}" ("vehicleId")`,
    `CREATE INDEX IF NOT EXISTS "idx_FleetDossierItem_dossierId" ON "${FLEET_DOSSIER_ITEM_TABLE}" ("dossierId")`,
];

/** Tables du module, dans l'ordre de création (utilisé par la vérification de migration). */
export const FLEET_TRACKING_TABLES = [
    FLEET_CONTACT_TABLE,
    FLEET_TASK_TABLE,
    FLEET_TASK_ASSIGNEE_TABLE,
    FLEET_TASK_LINK_TABLE,
    FLEET_ATTACHMENT_TABLE,
    FLEET_DOSSIER_TABLE,
    FLEET_DOSSIER_ITEM_TABLE,
];

/** Toutes les instructions DDL du module, dans l'ordre d'exécution. */
export const FLEET_TRACKING_DDL: string[] = [
    FLEET_CONTACT_DDL,
    ...FLEET_CONTACT_INDEXES,
    FLEET_TASK_DDL,
    FLEET_TASK_ASSIGNEE_DDL,
    FLEET_TASK_LINK_DDL,
    FLEET_ATTACHMENT_DDL,
    ...FLEET_TASK_INDEXES,
    FLEET_DOSSIER_DDL,
    FLEET_DOSSIER_ITEM_DDL,
    ...FLEET_DOSSIER_INDEXES,
];

/** Noms des index créés par `FLEET_TRACKING_DDL` (vérification de migration). */
export const FLEET_TRACKING_INDEX_NAMES: string[] = FLEET_TRACKING_DDL
    .map(ddl => /^CREATE INDEX IF NOT EXISTS "(idx_[^"]+)"/.exec(ddl)?.[1])
    .filter((n): n is string => !!n);
