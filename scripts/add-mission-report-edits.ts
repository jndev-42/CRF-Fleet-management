/**
 * Migration production — accident bénévole, historique des modifications des
 * comptes rendus de mission et rôle « Responsable mission ».
 *
 *   1. `mission_reports.volunteer_accident INTEGER NOT NULL DEFAULT 0` et
 *      `mission_reports.volunteer_accident_details TEXT` ;
 *   2. table `mission_report_edits` (historique persistant, non purgé) + index `report_id` ;
 *   3. ligne `Role` `role-resp_mission` (RESP_MISSION). Aucun compte ne reçoit le
 *      rôle : l'attribution reste manuelle (Administration → Utilisateurs).
 *
 * À exécuter AVANT le déploiement : la création (POST /api/missions, QR d'UL)
 * écrit les colonnes accident, et la fiche lit la table d'historique — tant
 * qu'elles manquent, création, lecture et modification répondent 500.
 *
 * Idempotente : ne crée que ce qui manque. Les rapports existants reçoivent
 * `volunteer_accident = 0` ; aucun historique rétroactif n'est fabriqué.
 *
 * Usage :
 *   npx tsx scripts/add-mission-report-edits.ts                        # .env, dry-run
 *   npx tsx scripts/add-mission-report-edits.ts --apply                # .env, applique
 *   npx tsx scripts/add-mission-report-edits.ts --env .env.preview --apply
 */
import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import {
    MISSION_REPORT_ACCIDENT_COLUMNS,
    MISSION_REPORT_EDITS_DDL,
    MISSION_REPORT_EDITS_INDEX_DDL,
    MISSION_REPORT_EDITS_INDEX_NAME,
    MISSION_REPORT_EDITS_TABLE,
    RESP_MISSION_ROLE,
} from '../src/lib/missions/edits-schema';

// Cible l'environnement passé en `--env` (défaut : .env).
const envFile = (() => {
    const i = process.argv.indexOf('--env');
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : '.env';
})();
dotenv.config({ path: envFile });

async function main() {
    const apply = process.argv.includes('--apply');
    console.log(`Migration (${envFile}) : accident bénévole + ${MISSION_REPORT_EDITS_TABLE} + rôle RESP_MISSION ${apply ? '(--apply)' : '(dry-run)'}`);

    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN,
    });

    const cols = await db.execute(`PRAGMA table_info("mission_reports")`);
    if (cols.rows.length === 0) {
        console.error('❌ Table "mission_reports" introuvable — migration impossible');
        process.exit(1);
    }
    const missingColumns = MISSION_REPORT_ACCIDENT_COLUMNS.filter(c => !cols.rows.some(r => r.name === c.name));
    for (const c of MISSION_REPORT_ACCIDENT_COLUMNS) {
        console.log(`  colonne mission_reports.${c.name} : ${missingColumns.includes(c) ? 'ABSENTE' : 'présente'}`);
    }

    const table = await db.execute({
        sql: `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
        args: [MISSION_REPORT_EDITS_TABLE],
    });
    const hasTable = table.rows.length > 0;
    console.log(`  table ${MISSION_REPORT_EDITS_TABLE} : ${hasTable ? 'présente' : 'ABSENTE'}`);

    const index = await db.execute({
        sql: `SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?`,
        args: [MISSION_REPORT_EDITS_INDEX_NAME],
    });
    const hasIndex = index.rows.length > 0;
    console.log(`  index ${MISSION_REPORT_EDITS_INDEX_NAME} : ${hasIndex ? 'présent' : 'ABSENT'}`);

    const role = await db.execute({
        sql: `SELECT id FROM "Role" WHERE name = ?`,
        args: [RESP_MISSION_ROLE.name],
    });
    const hasRole = role.rows.length > 0;
    console.log(`  rôle ${RESP_MISSION_ROLE.name} : ${hasRole ? `présent (${role.rows[0].id})` : 'ABSENT'}`);

    if (missingColumns.length === 0 && hasTable && hasIndex && hasRole) {
        console.log('⚠️ Rien à faire — base déjà à jour');
        return;
    }

    const plan = [
        ...missingColumns.map(c => c.ddl),
        ...(hasTable ? [] : [MISSION_REPORT_EDITS_DDL]),
        ...(hasIndex ? [] : [MISSION_REPORT_EDITS_INDEX_DDL]),
        ...(hasRole ? [] : [`INSERT OR IGNORE INTO "Role" (id, name) VALUES ('${RESP_MISSION_ROLE.id}', '${RESP_MISSION_ROLE.name}')`]),
    ];

    if (!apply) {
        console.log('\nPlan (aucune écriture) :');
        for (const stmt of plan) console.log(`  ${stmt.replace(/\s+/g, ' ')}`);
        console.log('\nRelancer avec --apply pour exécuter.');
        return;
    }

    for (const c of missingColumns) await db.execute(c.ddl);
    if (!hasTable) await db.execute(MISSION_REPORT_EDITS_DDL);
    if (!hasIndex) await db.execute(MISSION_REPORT_EDITS_INDEX_DDL);
    if (!hasRole) {
        await db.execute({
            sql: `INSERT OR IGNORE INTO "Role" (id, name) VALUES (?, ?)`,
            args: [RESP_MISSION_ROLE.id, RESP_MISSION_ROLE.name],
        });
    }

    // Vérification explicite plutôt que confiance dans l'absence d'exception :
    // colonnes et table conditionnent chaque création et chaque lecture de rapport.
    const afterCols = await db.execute(`PRAGMA table_info("mission_reports")`);
    for (const c of MISSION_REPORT_ACCIDENT_COLUMNS) {
        if (!afterCols.rows.some(r => r.name === c.name)) {
            console.error(`❌ Colonne ${c.name} absente après ALTER — migration NON valide`);
            process.exit(1);
        }
    }
    const afterTable = await db.execute({
        sql: `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
        args: [MISSION_REPORT_EDITS_TABLE],
    });
    if (afterTable.rows.length === 0) {
        console.error(`❌ Table ${MISSION_REPORT_EDITS_TABLE} absente après CREATE — migration NON valide`);
        process.exit(1);
    }
    const afterIndex = await db.execute({
        sql: `SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?`,
        args: [MISSION_REPORT_EDITS_INDEX_NAME],
    });
    if (afterIndex.rows.length === 0) {
        console.error(`❌ Index ${MISSION_REPORT_EDITS_INDEX_NAME} absent après CREATE — migration NON valide`);
        process.exit(1);
    }
    const afterRole = await db.execute({ sql: `SELECT 1 FROM "Role" WHERE name = ?`, args: [RESP_MISSION_ROLE.name] });
    if (afterRole.rows.length === 0) {
        console.error(`❌ Rôle ${RESP_MISSION_ROLE.name} absent après INSERT — migration NON valide`);
        process.exit(1);
    }
    console.log('✅ Colonnes accident, table d\'historique, index et rôle RESP_MISSION confirmés');
    console.log('ℹ️ Aucun compte ne reçoit RESP_MISSION : l\'attribuer depuis Administration → Utilisateurs.');
}

main().catch((error: unknown) => {
    console.error('❌ Migration échouée :', error instanceof Error ? error.message : String(error));
    process.exit(1);
});
