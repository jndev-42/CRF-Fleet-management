/**
 * DDL du référentiel secourisme — partagé par la migration prod, la base de dev
 * et les tests d'intégration, pour que les trois ne divergent jamais.
 *
 * `ReferentielFts` est une table FTS5 en CONTENU EXTERNE sur `ReferentielPage` :
 * l'index ne duplique pas le texte. Il ne suit pas les écritures tout seul —
 * il se reconstruit avec `INSERT INTO ReferentielFts(ReferentielFts) VALUES('rebuild')`,
 * ce que fait la route `process` au dernier lot, dans la transaction de bascule.
 *
 * L'index est indexé sur `ReferentielPage.id`, une colonne EXPLICITE : le rowid
 * implicite d'une table à clé composite peut être renuméroté (VACUUM) et
 * désynchroniserait l'index. `UNIQUE (referentielId, page)` garde l'upsert par page.
 */

export const REFERENTIEL_STATUSES = ['uploading', 'processing', 'ready', 'failed'] as const;
export type ReferentielStatus = typeof REFERENTIEL_STATUSES[number];

export const REFERENTIEL_FTS_TABLE = 'ReferentielFts';

/** Tables « réelles » (hors FTS), dans l'ordre de création (clé étrangère). */
export const REFERENTIEL_TABLES: { name: string; ddl: string }[] = [
    {
        name: 'Referentiel',
        ddl: `CREATE TABLE IF NOT EXISTS "Referentiel" (
            "id"             TEXT NOT NULL PRIMARY KEY,
            "fileName"       TEXT NOT NULL,
            "r2Key"          TEXT NOT NULL,
            "pageCount"      INTEGER,
            "processedPages" INTEGER NOT NULL DEFAULT 0,
            "status"         TEXT NOT NULL DEFAULT 'uploading' CHECK ("status" IN ('uploading', 'processing', 'ready', 'failed')),
            "createdBy"      TEXT NOT NULL,
            "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "readyAt"        DATETIME
        )`,
    },
    {
        name: 'ReferentielPage',
        ddl: `CREATE TABLE IF NOT EXISTS "ReferentielPage" (
            "id"            INTEGER PRIMARY KEY,
            "referentielId" TEXT NOT NULL REFERENCES "Referentiel"("id") ON DELETE CASCADE,
            "page"          INTEGER NOT NULL,
            "title"         TEXT NOT NULL DEFAULT '',
            "body"          TEXT NOT NULL DEFAULT '',
            UNIQUE ("referentielId", "page")
        )`,
    },
];

export const REFERENTIEL_FTS_DDL = `CREATE VIRTUAL TABLE IF NOT EXISTS "${REFERENTIEL_FTS_TABLE}" USING fts5(
    title, body,
    content='ReferentielPage',
    content_rowid='id',
    tokenize='unicode61 remove_diacritics 2'
)`;

/** Reconstruit l'index à partir de `ReferentielPage` (à lancer après toute modification des pages). */
export const REFERENTIEL_REBUILD_SQL = `INSERT INTO "${REFERENTIEL_FTS_TABLE}"("${REFERENTIEL_FTS_TABLE}") VALUES('rebuild')`;

/** Tables fantômes créées par SQLite pour un index FTS5 (`<nom>_data`, `_idx`, `_docsize`, `_config`). */
export function isFtsShadowTable(name: string): boolean {
    return name === REFERENTIEL_FTS_TABLE
        || /^ReferentielFts_(data|idx|docsize|config|content)$/.test(name);
}
