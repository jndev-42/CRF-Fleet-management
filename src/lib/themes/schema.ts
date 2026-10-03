/**
 * DDL des thèmes saisonniers — partagé par la migration prod, la base de dev et
 * les tests d'intégration, pour que les trois ne divergent jamais.
 *
 * Une ligne par thème du catalogue (`src/lib/themes/catalog.ts`), créée à la
 * première sauvegarde. Les dates sont des jours `YYYY-MM-DD` (Europe/Paris).
 */

export const SEASONAL_THEME_TABLE = 'SeasonalTheme';

export const SEASONAL_THEME_DDL = `CREATE TABLE IF NOT EXISTS "${SEASONAL_THEME_TABLE}" (
    "theme_key"  TEXT NOT NULL PRIMARY KEY,
    "enabled"    INTEGER NOT NULL DEFAULT 0,
    "start_date" TEXT,
    "end_date"   TEXT,
    "updatedAt"  TEXT NOT NULL,
    "updatedBy"  TEXT
)`;
