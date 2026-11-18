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

/** Tables du module, dans l'ordre de création (utilisé par la vérification de migration). */
export const FLEET_TRACKING_TABLES = [FLEET_CONTACT_TABLE];

/** Toutes les instructions DDL du module, dans l'ordre d'exécution. */
export const FLEET_TRACKING_DDL: string[] = [
    FLEET_CONTACT_DDL,
    ...FLEET_CONTACT_INDEXES,
];
