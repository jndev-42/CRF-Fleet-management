import type { Client } from '@libsql/client';
import { MENU_VISIBILITIES } from './menuVisibility';

/**
 * Schéma de la table `MenuSetting`, partagé par `scripts/setup-dev.ts` et la
 * migration `scripts/update-menu-settings.ts`.
 *
 * La contrainte CHECK énumère les visibilités autorisées. SQLite ne sait pas
 * modifier une contrainte existante : ajouter une visibilité impose de
 * reconstruire la table. D'où ce module, qui dérive la contrainte de
 * `MENU_VISIBILITIES` et sait détecter une table restée sur l'ancienne liste.
 */

const CHECK_VALUES = MENU_VISIBILITIES.map(v => `'${v}'`).join(', ');

export function menuSettingTableDdl(tableName = 'MenuSetting'): string {
    return `CREATE TABLE IF NOT EXISTS "${tableName}" (
            "menu_key"   TEXT NOT NULL PRIMARY KEY,
            "visibility" TEXT NOT NULL DEFAULT 'available'
                         CHECK (visibility IN (${CHECK_VALUES})),
            "updatedAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`;
}

/**
 * `true` si la table existe mais que sa contrainte CHECK n'accepte pas toutes
 * les visibilités de `MENU_VISIBILITIES` (une écriture de la nouvelle valeur
 * échouerait alors en base).
 */
export async function menuSettingNeedsRebuild(db: Client): Promise<boolean> {
    const res = await db.execute(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'MenuSetting'`);
    if (res.rows.length === 0) return false;
    const sql = String(res.rows[0].sql);
    return MENU_VISIBILITIES.some(v => !sql.includes(`'${v}'`));
}

/**
 * Reconstruit `MenuSetting` avec la contrainte à jour, en conservant chaque
 * réglage. Tout-ou-rien : les instructions partent dans un même lot
 * d'écriture, une erreur laisse l'ancienne table intacte.
 */
export async function rebuildMenuSettingTable(db: Client): Promise<void> {
    await db.batch([
        `DROP TABLE IF EXISTS "MenuSetting_new"`,
        menuSettingTableDdl('MenuSetting_new'),
        `INSERT INTO "MenuSetting_new" (menu_key, visibility, updatedAt) SELECT menu_key, visibility, updatedAt FROM "MenuSetting"`,
        `DROP TABLE "MenuSetting"`,
        `ALTER TABLE "MenuSetting_new" RENAME TO "MenuSetting"`,
    ], 'write');
}
