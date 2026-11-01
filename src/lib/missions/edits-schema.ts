/**
 * DDL de l'historique des modifications des comptes rendus de mission et des
 * colonnes « accident bénévole » — partagé par la migration prod
 * (`scripts/add-mission-report-edits.ts`), la base de dev (`scripts/setup-dev.ts`)
 * et les tests d'intégration, pour que les trois ne divergent jamais.
 *
 * L'historique est PERSISTANT et NON PURGÉ, contrairement à l'`AuditLog`
 * (rétention 30 jours, sans valeurs avant/après) : une ligne par
 * enregistrement d'une modification réelle, jamais modifiée ni supprimée par
 * l'application (seule la suppression du rapport l'emporte, en cascade).
 * `changes` est un JSON `[{ field, label, old, new }]` dont les valeurs sont
 * déjà rendues en libellés lisibles et figées au moment de l'écriture.
 * `edited_by_name` fige de même le nom de l'éditeur : l'entrée reste lisible
 * même si son compte est supprimé ou renommé.
 */

export const MISSION_REPORT_EDITS_TABLE = 'mission_report_edits';

export const MISSION_REPORT_EDITS_DDL = `CREATE TABLE IF NOT EXISTS "${MISSION_REPORT_EDITS_TABLE}" (
    "id"        TEXT PRIMARY KEY,
    "report_id" TEXT NOT NULL REFERENCES "mission_reports"(id) ON DELETE CASCADE,
    "edited_by" TEXT NOT NULL REFERENCES "User"(id),
    "edited_by_name" TEXT,
    "edited_at" TEXT NOT NULL,
    "changes"   TEXT NOT NULL
)`;

export const MISSION_REPORT_EDITS_INDEX_NAME = 'mission_report_edits_report_id_idx';

export const MISSION_REPORT_EDITS_INDEX_DDL =
    `CREATE INDEX IF NOT EXISTS "${MISSION_REPORT_EDITS_INDEX_NAME}" ON "${MISSION_REPORT_EDITS_TABLE}"("report_id")`;

/** Colonnes « accident bénévole » ajoutées à `mission_reports` (nom → DDL d'ajout). */
export const MISSION_REPORT_ACCIDENT_COLUMNS: { name: string; ddl: string }[] = [
    {
        name: 'volunteer_accident',
        ddl: `ALTER TABLE "mission_reports" ADD COLUMN "volunteer_accident" INTEGER NOT NULL DEFAULT 0`,
    },
    {
        name: 'volunteer_accident_details',
        ddl: `ALTER TABLE "mission_reports" ADD COLUMN "volunteer_accident_details" TEXT`,
    },
];

/** Ligne `Role` du responsable mission : créée uniquement par la migration (GET /api/users n'écrit plus de rôle), même identifiant que les seeds dev / preview. */
export const RESP_MISSION_ROLE = { id: 'role-resp_mission', name: 'RESP_MISSION' } as const;
