/**
 * DDL de la mémoire des alertes d'échéance — partagé par la migration prod, la base de
 * dev et les tests d'intégration, pour que les trois ne divergent jamais.
 *
 * Une ligne par alerte déjà envoyée, identifiée par une clé qui encode l'échéance
 * (ex. `desinf-soon:<vehicleId>:<date>`) : une nouvelle date d'échéance donne une
 * nouvelle clé et relance donc le cycle d'alertes.
 */

export const SCHEDULED_ALERT_TABLE = 'ScheduledAlert';

export const SCHEDULED_ALERT_DDL = `CREATE TABLE IF NOT EXISTS "${SCHEDULED_ALERT_TABLE}" (
    "key"    TEXT NOT NULL PRIMARY KEY,
    "sentAt" TEXT NOT NULL DEFAULT (datetime('now'))
)`;
