/**
 * Migration production — retours terrain (v5.58.0) :
 *   - `UniteLocale.checkoutPhotosRequired` (photos de départ obligatoires par UL ; NULL/0 = optionnelles) ;
 *   - `Trip.photosSkipped` (la prise a été validée sans photo malgré l'obligation) ;
 *   - `FleetDossier.closeReason` (motif de clôture), `FleetDossier.sourceType` / `sourceId`
 *     (origine d'un dossier créé automatiquement depuis une déclaration d'incident) ;
 *   - index unique partiel `idx_FleetDossier_source` sur (sourceType, sourceId) WHERE sourceId IS NOT NULL
 *     (un seul dossier par déclaration).
 *
 * Les statuts de dossier NEW / WAITING n'exigent aucune migration (colonne texte libre,
 * `OPEN` conservé tel quel).
 *
 * Idempotente : n'ajoute que ce qui manque. Écriture en un seul lot (tout ou rien).
 *
 * À exécuter AVANT le déploiement de la v5.58.0 : sans les colonnes, les prises de véhicule
 * (POST /api/trips), la fiche véhicule, GET /api/ul et le suivi technique (dossiers) répondent 500.
 * Le suivi technique (`scripts/add-fleet-tracking.ts`) doit déjà être en place.
 *
 * Usage :
 *   npx tsx scripts/add-checkout-photos-and-dossier-tickets.ts                       # .env, dry-run
 *   npx tsx scripts/add-checkout-photos-and-dossier-tickets.ts --apply               # applique, puis vérifie
 *   npx tsx scripts/add-checkout-photos-and-dossier-tickets.ts --env .env.preview --apply
 */
import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import {
    FLEET_DOSSIER_SOURCE_INDEX,
    FLEET_DOSSIER_SOURCE_INDEX_NAME,
    FLEET_DOSSIER_V58_COLUMNS,
} from '../src/lib/fleetTracking/schema';

const envFile = (() => {
    const i = process.argv.indexOf('--env');
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : '.env';
})();
dotenv.config({ path: envFile });

type Db = ReturnType<typeof createClient>;

const COLUMNS = [
    { table: 'UniteLocale', column: 'checkoutPhotosRequired', ddl: 'INTEGER' },
    { table: 'Trip', column: 'photosSkipped', ddl: 'INTEGER' },
    ...FLEET_DOSSIER_V58_COLUMNS.map(c => ({ table: 'FleetDossier', column: c.column, ddl: c.ddl })),
];

async function tableExists(db: Db, table: string): Promise<boolean> {
    const res = await db.execute({ sql: `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`, args: [table] });
    return res.rows.length > 0;
}

async function hasColumn(db: Db, table: string, column: string): Promise<boolean> {
    const cols = await db.execute(`PRAGMA table_info("${table}")`);
    return cols.rows.some(r => r.name === column);
}

async function hasIndex(db: Db, name: string): Promise<boolean> {
    const res = await db.execute({ sql: `SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ?`, args: [name] });
    return res.rows.length > 0;
}

async function main() {
    const apply = process.argv.includes('--apply');
    console.log(`Migration (${envFile}) : photos de départ obligatoires + dossiers automatiques ${apply ? '(--apply)' : '(dry-run)'}`);

    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN,
    });

    // Le dossier automatique écrit aussi dans FleetDossierVehicle (v5.56.0).
    for (const table of ['FleetDossier', 'FleetDossierVehicle']) {
        if (!(await tableExists(db, table))) {
            console.error(`Table ${table} absente : exécuter d'abord scripts/add-fleet-tracking.ts`);
            process.exit(1);
        }
    }

    const missing: typeof COLUMNS = [];
    for (const c of COLUMNS) {
        const present = await hasColumn(db, c.table, c.column);
        console.log(`  ${c.table}.${c.column} : ${present ? 'présente' : 'ABSENTE'}`);
        if (!present) missing.push(c);
    }
    const indexPresent = await hasIndex(db, FLEET_DOSSIER_SOURCE_INDEX_NAME);
    console.log(`  index ${FLEET_DOSSIER_SOURCE_INDEX_NAME} : ${indexPresent ? 'présent' : 'ABSENT'}`);

    if (missing.length === 0 && indexPresent) {
        console.log('Rien à faire — base déjà à jour');
        return;
    }

    const statements = [
        ...missing.map(c => `ALTER TABLE "${c.table}" ADD COLUMN "${c.column}" ${c.ddl}`),
        FLEET_DOSSIER_SOURCE_INDEX,
    ];

    if (!apply) {
        console.log('\nPlan (aucune écriture) :');
        for (const sql of statements) console.log(`  ${sql}`);
        console.log('\nRelancer avec --apply pour exécuter.');
        return;
    }

    // Un seul lot en transaction d'écriture : tout est appliqué, ou rien.
    await db.batch(statements, 'write');

    for (const c of COLUMNS) {
        if (!(await hasColumn(db, c.table, c.column))) {
            console.error(`Colonne ${c.table}.${c.column} absente après ajout — migration NON valide`);
            process.exit(1);
        }
    }
    if (!(await hasIndex(db, FLEET_DOSSIER_SOURCE_INDEX_NAME))) {
        console.error(`Index ${FLEET_DOSSIER_SOURCE_INDEX_NAME} absent après création — migration NON valide`);
        process.exit(1);
    }
    console.log('Colonnes et index ajoutés et confirmés');
}

main().catch((error: unknown) => {
    console.error('Migration échouée :', error instanceof Error ? error.message : String(error));
    process.exit(1);
});
