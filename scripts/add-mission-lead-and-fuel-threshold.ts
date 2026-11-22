/**
 * Migration production — retours terrain :
 *   - `Trip.missionLeadName` (responsable de la mission, texte libre optionnel) ;
 *   - `UniteLocale.minFuelReturnPercent` (seuil de carburant au retour par UL ; NULL = 25).
 *
 * Idempotente : n'ajoute que les colonnes absentes.
 *
 * À exécuter AVANT le déploiement : sans les colonnes, les prises de véhicule
 * (POST /api/trips, /api/qr/[token]/checkout), la fiche véhicule et GET /api/ul répondent 500.
 *
 * Usage :
 *   npx tsx scripts/add-mission-lead-and-fuel-threshold.ts                       # .env, dry-run
 *   npx tsx scripts/add-mission-lead-and-fuel-threshold.ts --apply               # applique, puis vérifie
 *   npx tsx scripts/add-mission-lead-and-fuel-threshold.ts --env .env.preview --apply
 */
import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

const envFile = (() => {
    const i = process.argv.indexOf('--env');
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : '.env';
})();
dotenv.config({ path: envFile });

const COLUMNS = [
    { table: 'Trip', column: 'missionLeadName', ddl: 'TEXT' },
    { table: 'UniteLocale', column: 'minFuelReturnPercent', ddl: 'INTEGER' },
] as const;

async function hasColumn(db: ReturnType<typeof createClient>, table: string, column: string): Promise<boolean> {
    const cols = await db.execute(`PRAGMA table_info("${table}")`);
    return cols.rows.some(r => r.name === column);
}

async function main() {
    const apply = process.argv.includes('--apply');
    console.log(`Migration (${envFile}) : missionLeadName + minFuelReturnPercent ${apply ? '(--apply)' : '(dry-run)'}`);

    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN,
    });

    const missing: typeof COLUMNS[number][] = [];
    for (const c of COLUMNS) {
        const present = await hasColumn(db, c.table, c.column);
        console.log(`  ${c.table}.${c.column} : ${present ? 'présente' : 'ABSENTE'}`);
        if (!present) missing.push(c);
    }

    if (missing.length === 0) {
        console.log('Rien à faire — base déjà à jour');
        return;
    }

    if (!apply) {
        console.log('\nPlan (aucune écriture) :');
        for (const c of missing) console.log(`  ALTER TABLE "${c.table}" ADD COLUMN "${c.column}" ${c.ddl}`);
        console.log('\nRelancer avec --apply pour exécuter.');
        return;
    }

    for (const c of missing) {
        await db.execute(`ALTER TABLE "${c.table}" ADD COLUMN "${c.column}" ${c.ddl}`);
    }

    for (const c of missing) {
        if (!(await hasColumn(db, c.table, c.column))) {
            console.error(`Colonne ${c.table}.${c.column} absente après ajout — migration NON valide`);
            process.exit(1);
        }
    }
    console.log('Colonnes ajoutées et confirmées');
}

main().catch((error: unknown) => {
    console.error('Migration échouée :', error instanceof Error ? error.message : String(error));
    process.exit(1);
});
