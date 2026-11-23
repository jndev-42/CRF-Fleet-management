/**
 * Migration production — photos obligatoires au retour (v5.59.0) :
 *   - `Trip.photosSkippedIn` (le retour a été validé sans photo malgré l'obligation de l'UL ;
 *     NULL/0 = photos jointes ou non exigées).
 *
 * Idempotente : n'ajoute que ce qui manque. Écriture en un seul lot (tout ou rien).
 *
 * À exécuter AVANT le déploiement de la v5.59.0 : sans la colonne, le retour d'un véhicule
 * (PATCH /api/trips/[id]/checkin) répond 500.
 *
 * Usage :
 *   npx tsx scripts/add-trip-photos-skipped-in.ts                       # .env, dry-run
 *   npx tsx scripts/add-trip-photos-skipped-in.ts --apply               # applique, puis vérifie
 *   npx tsx scripts/add-trip-photos-skipped-in.ts --env .env.preview --apply
 */
import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

const envFile = (() => {
    const i = process.argv.indexOf('--env');
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : '.env';
})();
dotenv.config({ path: envFile });

type Db = ReturnType<typeof createClient>;

const COLUMNS = [{ table: 'Trip', column: 'photosSkippedIn', ddl: 'INTEGER' }];

async function hasColumn(db: Db, table: string, column: string): Promise<boolean> {
    const cols = await db.execute(`PRAGMA table_info("${table}")`);
    return cols.rows.some(r => r.name === column);
}

async function main() {
    const apply = process.argv.includes('--apply');
    console.log(`Migration (${envFile}) : photos obligatoires au retour ${apply ? '(--apply)' : '(dry-run)'}`);

    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN,
    });

    const missing: typeof COLUMNS = [];
    for (const c of COLUMNS) {
        const present = await hasColumn(db, c.table, c.column);
        console.log(`  ${c.table}.${c.column} : ${present ? 'présente' : 'ABSENTE'}`);
        if (!present) missing.push(c);
    }

    if (missing.length === 0) {
        console.log('Rien à faire — base déjà à jour');
        return;
    }

    const statements = missing.map(c => `ALTER TABLE "${c.table}" ADD COLUMN "${c.column}" ${c.ddl}`);

    if (!apply) {
        console.log('\nPlan (aucune écriture) :');
        for (const sql of statements) console.log(`  ${sql}`);
        console.log('\nRelancer avec --apply pour exécuter.');
        return;
    }

    await db.batch(statements, 'write');

    for (const c of COLUMNS) {
        if (!(await hasColumn(db, c.table, c.column))) {
            console.error(`Colonne ${c.table}.${c.column} absente après ajout — migration NON valide`);
            process.exit(1);
        }
    }
    console.log('Colonne ajoutée et confirmée');
}

main().catch((error: unknown) => {
    console.error('Migration échouée :', error instanceof Error ? error.message : String(error));
    process.exit(1);
});
