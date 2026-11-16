/**
 * Migration production — rapport de mission DPS/PAPS : mode du rapport signé
 * (photo / signé dans l'appli / aucun), horaires, responsable de la mission,
 * observations et organisateur.
 *
 * Ajoute à `mission_reports` les colonnes `signed_report_mode` (CHECK
 * PHOTO/APP/NONE), `start_time`, `end_time`, `arrival_time`, `departure_time`,
 * `mission_lead_name`, `mission_lead_phone`, `crf_observations`,
 * `organizer_observations`, `organizer_name` et `organizer_function`.
 *
 * À exécuter AVANT le déploiement : la création, la lecture et la modification des
 * comptes rendus lisent et écrivent ces colonnes ; sans elles, elles répondent 500.
 *
 * Idempotente : ne crée que les colonnes manquantes. Les rapports existants gardent
 * NULL partout — leur affichage est inchangé.
 *
 * Usage :
 *   npx tsx scripts/add-mission-report-signed-mode.ts                        # .env, dry-run
 *   npx tsx scripts/add-mission-report-signed-mode.ts --apply                # .env, applique
 *   npx tsx scripts/add-mission-report-signed-mode.ts --env .env.preview --apply
 */
import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import { MISSION_REPORT_SIGNED_MODE_COLUMNS } from '../src/lib/missions/edits-schema';

const envFile = (() => {
    const i = process.argv.indexOf('--env');
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : '.env';
})();
dotenv.config({ path: envFile });

async function main() {
    const apply = process.argv.includes('--apply');
    console.log(`Migration (${envFile}) : rapport signé DPS/PAPS ${apply ? '(--apply)' : '(dry-run)'}`);

    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN,
    });

    const cols = await db.execute(`PRAGMA table_info("mission_reports")`);
    if (cols.rows.length === 0) {
        console.error('❌ Table "mission_reports" introuvable — migration impossible');
        process.exit(1);
    }
    const missing = MISSION_REPORT_SIGNED_MODE_COLUMNS.filter(c => !cols.rows.some(r => r.name === c.name));
    for (const c of MISSION_REPORT_SIGNED_MODE_COLUMNS) {
        console.log(`  colonne mission_reports.${c.name} : ${missing.includes(c) ? 'ABSENTE' : 'présente'}`);
    }

    if (missing.length === 0) {
        console.log('⚠️ Rien à faire — base déjà à jour');
        return;
    }

    if (!apply) {
        console.log('\nPlan (aucune écriture) :');
        for (const c of missing) console.log(`  ${c.ddl}`);
        console.log('\nRelancer avec --apply pour exécuter.');
        return;
    }

    for (const c of missing) await db.execute(c.ddl);

    const after = await db.execute(`PRAGMA table_info("mission_reports")`);
    for (const c of MISSION_REPORT_SIGNED_MODE_COLUMNS) {
        if (!after.rows.some(r => r.name === c.name)) {
            console.error(`❌ Colonne ${c.name} absente après ALTER — migration NON valide`);
            process.exit(1);
        }
    }
    console.log(`✅ ${missing.length} colonne(s) ajoutée(s) et confirmée(s)`);
}

main().catch((error: unknown) => {
    console.error('❌ Migration échouée :', error instanceof Error ? error.message : String(error));
    process.exit(1);
});
