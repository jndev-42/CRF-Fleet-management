/**
 * Migration production — module « Suivi technique » de /vehicles.
 *
 *   Crée les tables du module (FLEET_TRACKING_DDL, `src/lib/fleetTracking/schema.ts`) :
 *   pour la v5.55.0, FleetContact (annuaire des prestataires de chaque UL, partageable
 *   aux autres UL), FleetTask (tâches), FleetTaskAssignee (assignés), FleetTaskLink
 *   (rattachements à un véhicule, contact, incident ou maintenance) et FleetAttachment
 *   (pièces jointes sur R2), FleetDossier (dossiers rattachés à un véhicule) et
 *   FleetDossierItem (pièces à récupérer d'un dossier) et FleetControlAppointment
 *   (rendez-vous de contrôle CT / révision / désinfection d'un véhicule, avec la tâche
 *   liée `taskId`), avec leurs index. Une colonne ajoutée après coup à une table déjà
 *   créée (FLEET_TRACKING_ADDED_COLUMNS, ex. FleetControlAppointment.taskId) est ajoutée
 *   par `ALTER TABLE … ADD COLUMN`.
 *
 *   v5.56.0 : FleetDossierVehicle (véhicules d'un dossier, un ou plusieurs) et son
 *   index ; chaque dossier existant y reçoit son FleetDossier.vehicleId (reprise
 *   idempotente, dans le même lot). À EXÉCUTER AVANT LE DÉPLOIEMENT de la v5.56.0 :
 *   sans la table, la liste, le détail, la création et la modification des dossiers
 *   répondent 500 ; sans la reprise, un dossier existant apparaît sans véhicule.
 *
 * Idempotente : chaque instruction est en `IF NOT EXISTS` ; une base à jour n'est pas
 * réécrite. L'écriture est atomique (un seul lot en transaction d'écriture), puis
 * vérifiée : la sortie vaut 1 si une table manque encore ou si un dossier reste sans
 * véhicule.
 *
 * À exécuter AVANT le déploiement de la v5.55.0 : sans les tables, les routes
 * /api/fleet-tracking/* répondent 500 (onglets « Suivi technique › Contacts » et
 * « Tâches » / « Dossiers » / « Contrôles » inutilisables). Relançable : une base
 * partiellement migrée (FleetContact seule, ou sans les tables des dossiers ou des
 * contrôles) reçoit les tables manquantes.
 *
 * Usage :
 *   npx tsx scripts/add-fleet-tracking.ts                          # .env, dry-run
 *   npx tsx scripts/add-fleet-tracking.ts --apply                  # .env, applique puis vérifie
 *   npx tsx scripts/add-fleet-tracking.ts --env .env.preview --apply
 */
import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import {
    FLEET_DOSSIER_VEHICLE_BACKFILL,
    FLEET_DOSSIER_VEHICLE_PENDING,
    FLEET_DOSSIER_VEHICLE_TABLE,
    FLEET_TRACKING_ADDED_COLUMNS,
    FLEET_TRACKING_DDL,
    FLEET_TRACKING_INDEX_NAMES,
    FLEET_TRACKING_TABLES,
} from '../src/lib/fleetTracking/schema';

// Cible l'environnement passé en `--env` (défaut : .env).
const envFile = (() => {
    const i = process.argv.indexOf('--env');
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : '.env';
})();
dotenv.config({ path: envFile });

const INDEX_NAMES = FLEET_TRACKING_INDEX_NAMES;

type AddedColumn = typeof FLEET_TRACKING_ADDED_COLUMNS[number];

/**
 * Dossiers sans véhicule dans FleetDossierVehicle (reprise de FleetDossier.vehicleId à
 * faire). Table absente : tous les dossiers existants (0 si FleetDossier manque aussi).
 */
async function pendingDossierVehicles(db: ReturnType<typeof createClient>, tables: string[]): Promise<number> {
    if (tables.includes('FleetDossier')) return 0;
    const sql = tables.includes(FLEET_DOSSIER_VEHICLE_TABLE) ? `SELECT COUNT(*) AS n FROM "FleetDossier"` : FLEET_DOSSIER_VEHICLE_PENDING;
    return Number((await db.execute(sql)).rows[0]?.n ?? 0);
}

async function missingObjects(db: ReturnType<typeof createClient>): Promise<{ tables: string[]; indexes: string[]; columns: AddedColumn[]; pendingDossiers: number }> {
    const res = await db.execute(`SELECT type, name FROM sqlite_master WHERE type IN ('table', 'index')`);
    const present = new Set(res.rows.map(r => `${String(r.type)}:${String(r.name)}`));
    const tables = FLEET_TRACKING_TABLES.filter(t => !present.has(`table:${t}`));
    // Colonne absente d'une table EXISTANTE (une table absente sera créée avec elle).
    const columns: AddedColumn[] = [];
    for (const c of FLEET_TRACKING_ADDED_COLUMNS) {
        if (tables.includes(c.table)) continue;
        const info = await db.execute(`PRAGMA table_info("${c.table}")`);
        if (!info.rows.some(r => String(r.name) === c.column)) columns.push(c);
    }
    return { tables, indexes: INDEX_NAMES.filter(i => !present.has(`index:${i}`)), columns, pendingDossiers: await pendingDossierVehicles(db, tables) };
}

async function main() {
    const apply = process.argv.includes('--apply');
    console.log(`Migration (${envFile}) : suivi technique de la flotte ${apply ? '(--apply)' : '(dry-run)'}`);

    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN
    });

    const before = await missingObjects(db);
    for (const t of FLEET_TRACKING_TABLES) {
        console.log(`  table ${t} : ${before.tables.includes(t) ? 'ABSENTE' : 'présente'}`);
    }
    for (const i of INDEX_NAMES) {
        console.log(`  index ${i} : ${before.indexes.includes(i) ? 'ABSENT' : 'présent'}`);
    }
    for (const c of before.columns) console.log(`  colonne ${c.table}.${c.column} : ABSENTE`);
    if (before.pendingDossiers > 0) console.log(`  dossiers à reprendre dans ${FLEET_DOSSIER_VEHICLE_TABLE} : ${before.pendingDossiers}`);

    if (before.tables.length === 0 && before.indexes.length === 0 && before.columns.length === 0 && before.pendingDossiers === 0) {
        console.log("⚠️ Rien à faire — base déjà à jour");
        return;
    }

    if (!apply) {
        console.log("\nPlan (aucune écriture) :");
        for (const ddl of FLEET_TRACKING_DDL) console.log(`  ${ddl.split('\n')[0].trim()}`);
        for (const c of before.columns) console.log(`  ${c.ddl}`);
        console.log(`  ${FLEET_DOSSIER_VEHICLE_BACKFILL.split('\n')[0].trim()} … (véhicule de chaque dossier existant)`);
        console.log("\nRelancer avec --apply pour exécuter.");
        return;
    }

    // Un seul lot en transaction d'écriture : tout est appliqué, ou rien.
    // La reprise des véhicules des dossiers suit le DDL (table créée dans le même lot).
    const results = await db.batch([...FLEET_TRACKING_DDL, ...before.columns.map(c => c.ddl), FLEET_DOSSIER_VEHICLE_BACKFILL], 'write');
    console.log('✅ DDL appliqué');
    const backfilled = results[results.length - 1]?.rowsAffected ?? 0;
    if (backfilled > 0) console.log(`✅ ${backfilled} dossier(s) repris dans ${FLEET_DOSSIER_VEHICLE_TABLE}`);

    const after = await missingObjects(db);
    if (after.tables.length > 0 || after.indexes.length > 0 || after.columns.length > 0 || after.pendingDossiers > 0) {
        const pending = after.pendingDossiers > 0 ? [`${after.pendingDossiers} dossier(s) sans véhicule`] : [];
        console.error(`❌ Objets absents après migration : ${[...after.tables, ...after.indexes, ...after.columns.map(c => `${c.table}.${c.column}`), ...pending].join(', ')}`);
        process.exit(1);
    }
    console.log('✅ Vérification : tables et index du suivi technique présents, chaque dossier a son véhicule');
}

main().catch((error: unknown) => {
    console.error("❌ Migration échouée :", error instanceof Error ? error.message : String(error));
    process.exit(1);
});
