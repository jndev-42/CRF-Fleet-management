/**
 * DDL des documents liés à un véhicule — partagé par la migration prod, la base de
 * dev et les tests d'intégration, pour que les trois ne divergent jamais.
 *
 * Une ligne par PDF, binaire dans R2 (`vehicle-documents/{UL}/{nom du véhicule}/…`,
 * anciennement `vehicle-guides/{vehicleId}/…`), jamais
 * en base. `r2Key` est unique : la reprise des guides existants s'appuie dessus pour
 * rester idempotente.
 */

export const VEHICLE_DOCUMENT_TABLE = 'VehicleDocument';

export const VEHICLE_DOCUMENT_DDL = `CREATE TABLE IF NOT EXISTS "${VEHICLE_DOCUMENT_TABLE}" (
    "id"        TEXT NOT NULL PRIMARY KEY,
    "vehicleId" TEXT NOT NULL,
    "r2Key"     TEXT NOT NULL UNIQUE,
    "fileName"  TEXT NOT NULL,
    "size"      INTEGER NOT NULL,
    "createdAt" TEXT NOT NULL
)`;

export const VEHICLE_DOCUMENT_INDEX_DDL = `CREATE INDEX IF NOT EXISTS "idx_VehicleDocument_vehicleId" ON "${VEHICLE_DOCUMENT_TABLE}" ("vehicleId")`;
