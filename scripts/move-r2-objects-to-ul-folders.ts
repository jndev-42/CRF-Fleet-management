/**
 * Migration — range par UL les objets R2 qui ne l'étaient pas encore.
 *
 *   - `Vehicle.photoR2Key`                    `vehicle-photos/{vehicleId}/{att}.jpg`
 *                                           → `vehicle-photos/{slug UL}/{nom du véhicule}/{att}.jpg`
 *   - `VehicleDocument.r2Key`                 `vehicle-guides/{vehicleId}/{att}.pdf`
 *                                           → `vehicle-documents/{slug UL}/{nom du véhicule}/{att}.pdf`
 *     (`Vehicle.guideR2Key` égal repointé dans la même transaction)
 *   - `ExpenseReport.pendingReceiptKeys`      `expenses-staging/{stagingId}/{fichier}`
 *     (brouillons seulement)                → `expenses-staging/{slug UL}/{stagingId}/{fichier}`
 *
 * UL : celle du véhicule ; pour un justificatif, celle de la note. Nom du véhicule
 * assaini (`sanitizeName`, repli `sans-nom`). Le nom de fichier est conservé.
 *
 * À LANCER APRÈS le déploiement de la v5.49.0 : le code déployé écrit déjà sous
 * les nouveaux dossiers et accepte encore les anciennes clés de justificatifs ; ce
 * script rattrape l'existant. À RELANCER après le renommage d'un véhicule ou d'un
 * slug d'UL, et après le passage d'un véhicule dans une autre UL : rien n'est déplacé
 * automatiquement, les fichiers restent sous l'ancien dossier jusqu'au passage suivant.
 *
 * Sûreté : copie → UPDATE gardé (`WHERE … = <ancienne valeur>`) → suppression de
 * l'ancienne clé seulement avec `--delete-old`, après UPDATE réussi et si plus rien
 * ne la référence. Objet source absent : ligne sautée, listée, base intacte. Ligne
 * modifiée entre la lecture et l'UPDATE : sautée, copie supprimée. Idempotent : une
 * clé déjà à la bonne place n'est pas recopiée ; un slug ou un nom de véhicule
 * renommé est regroupé au passage suivant. Ne touche ni `referentiels/`, ni `ndf/`,
 * ni `ndf-revisions/`, ni `demo/`, ni les médias (`trip-photos/`…), ni les objets
 * orphelins non référencés en base.
 *
 * Chaque `--apply` écrit un journal JSONL `scripts/out/r2-relocation-<horodatage>.jsonl`,
 * créé au démarrage et complété d'une ligne par enregistrement repointé, au fil de
 * l'eau : c'est une trace (table, ligne, ancienne → nouvelle clé) pour un retour
 * arrière MANUEL, aucun outil ne le rejoue.
 * Code de sortie : 0 si tout est rangé, 1 si au moins un échec, 2 si aucun échec
 * mais des lignes sautées.
 *
 * `--delete-old` : de préférence en PASSE SÉPARÉE, après vérification. La base de
 * démonstration pointe vers les anciennes clés jusqu'à sa prochaine recopie : utiliser
 * ensuite « Recopier la base démo » (page Aide).
 *
 * Usage :
 *   npx tsx scripts/move-r2-objects-to-ul-folders.ts                       # dry-run (défaut)
 *   npx tsx scripts/move-r2-objects-to-ul-folders.ts --env .env.preview
 *   npx tsx scripts/move-r2-objects-to-ul-folders.ts --apply
 *   npx tsx scripts/move-r2-objects-to-ul-folders.ts --apply --delete-old  # supprime les anciennes clés
 */

import dotenv from 'dotenv';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const envFile = (() => {
    const i = process.argv.indexOf('--env');
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : '.env.local';
})();
dotenv.config({ path: envFile });

const APPLY = process.argv.includes('--apply');
const DELETE_OLD = process.argv.includes('--delete-old');

async function main(): Promise<void> {
    if (DELETE_OLD && !APPLY) {
        console.error('--delete-old exige --apply.');
        process.exit(1);
    }

    // Sans R2_BUCKET explicite, src/lib/r2.ts retomberait sur le bucket de PRODUCTION.
    const { requireExplicitR2Bucket } = await import('../src/lib/media/script-env');
    let bucket: string;
    try {
        bucket = requireExplicitR2Bucket();
    } catch (e: unknown) {
        console.error(e instanceof Error ? e.message : String(e));
        process.exit(1);
    }

    const { db } = await import('../src/lib/db');
    const { getObject, putObject, headObject, deleteObject, assertR2Configured } = await import('../src/lib/r2');
    const { runR2Relocation } = await import('../src/lib/media/r2-relocation');

    assertR2Configured();

    console.log(APPLY ? '=== RANGEMENT R2 PAR UL — EXÉCUTION RÉELLE ===' : '=== RANGEMENT R2 PAR UL — DRY-RUN (aucune écriture) ===');
    console.log(`Environnement : ${envFile}`);
    console.log(`Base cible    : ${(process.env.TURSO_DATABASE_URL || '').replace(/^libsql:\/\//, '').split('.')[0]}`);
    console.log(`Bucket R2     : ${bucket}`);
    if (DELETE_OLD) console.log('Anciennes clés : SUPPRIMÉES après chaque UPDATE réussi');

    let journalFile: string | null = null;
    if (APPLY) {
        const outDir = path.join(process.cwd(), 'scripts', 'out');
        mkdirSync(outDir, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        journalFile = path.join(outDir, `r2-relocation-${stamp}.jsonl`);
        writeFileSync(journalFile, '');
        console.log(`Journal       : ${journalFile}`);
    }

    // Lecture des lignes, rangement, bilan et code de sortie : `src/lib/media/r2-relocation.ts` (testé).
    const run = await runR2Relocation({
        db: {
            execute: (stmt) => db.execute(stmt),
            batch: (stmts, mode) => db.batch(stmts, mode),
        },
        store: {
            get: getObject,
            put: (key: string, body: Buffer, contentType: string) => putObject(key, body, contentType),
            head: headObject,
            delete: deleteObject,
        },
        apply: APPLY,
        deleteOld: DELETE_OLD,
        log: { info: console.log, warn: console.warn, error: console.error },
        onJournal: (entry) => {
            if (journalFile) appendFileSync(journalFile, `${JSON.stringify({ ...entry, env: envFile, at: new Date().toISOString() })}\n`);
        },
    });

    if (journalFile) {
        console.log(`\nJournal : ${journalFile} (${run.journal.length} ligne(s))`);
    } else {
        console.log('\nDry-run terminé. Relancez avec --apply pour écrire.');
    }
    if (run.exitCode !== 0) process.exit(run.exitCode);
}

main().catch(e => { console.error('Échec du rangement :', e); process.exit(1); });
