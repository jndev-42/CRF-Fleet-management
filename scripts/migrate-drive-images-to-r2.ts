/**
 * Migration — copie les photos et rapports signés encore sur Google Drive vers R2.
 *
 * Références reprises (colonnes sans `/`, c'est-à-dire des ids Drive) :
 *   - `Trip.driveFolderId`                    → `trip-photos/{UL}/{véhicule}-{horodatage}-{xxxx}` (+ `emprunt/`, `rendu/`)
 *   - `IncidentReport.driveFolderId`          → `incident-photos/{UL}/{véhicule}-{horodatage}-{xxxx}`
 *   - `mission_reports.drive_folder_id`       → `mission-com-photos/{UL}/{mission}-{horodatage}-{xxxx}`
 *   - `mission_reports.signed_report_drive_id` → `mission-report-photo/{UL}/{mission}-{horodatage}-{xxxx}/{fichier}`
 * L'horodatage est le `createdTime` du dossier (ou du fichier) Drive, en heure de
 * Paris ; `xxxx` et les noms de fichiers sont dérivés de l'id Drive, si bien que le
 * dry-run annonce exactement les clés qu'écrira `--apply`. UL : celle du véhicule ;
 * pour une mission, l'UL du compte rendu, à défaut l'UL de rattachement de son
 * auteur. Un même id Drive (plusieurs comptes rendus, voire plusieurs types) est
 * traité en un seul groupe. Une ligne sans UL, ou un dossier partagé entre UL
 * différentes, est signalé et sauté.
 *
 * Les justificatifs des notes de frais (`ExpenseReport.driveFolderId`) restent sur
 * Drive : hors périmètre.
 *
 * À LANCER APRÈS le déploiement de la v5.48.0 : le code déployé écrit déjà sur R2 et
 * lit encore les références Drive via l'ancien proxy ; ce script rattrape l'existant.
 *
 * Sûreté : copie de TOUS les fichiers d'une référence avant l'UPDATE (gardé
 * `WHERE col = <id Drive>`) ; un fichier illisible fait sauter la référence (listée,
 * Drive intact). Idempotent : une référence déjà R2 n'est plus sélectionnée. Les ids
 * `mock-…` (preview) sont ignorés et signalés. `--delete-old` met l'original Drive
 * à la corbeille (récupérable 30 jours), seulement après les UPDATE réussis et si
 * TOUS ses fichiers ont été copiés (sinon le dossier est conservé et signalé).
 * Chaque `--apply` écrit un journal JSONL `scripts/out/drive-migration-<horodatage>.jsonl`,
 * créé au démarrage et complété d'une ligne par enregistrement repointé (table, rowId,
 * ancien id, nouvelle référence, corbeille) au fil de l'exécution : un arrêt en cours
 * de route laisse la trace de tout ce qui a été fait, pour un éventuel retour arrière.
 * Code de sortie : 0 si tout est migré (ou ignoré), 1 si au moins un échec, 2 si aucun
 * échec mais des lignes sautées (sans UL, dossier partagé entre UL : ids Drive restants).
 *
 * Usage :
 *   npx tsx scripts/migrate-drive-images-to-r2.ts                        # dry-run (défaut)
 *   npx tsx scripts/migrate-drive-images-to-r2.ts --env .env.preview
 *   npx tsx scripts/migrate-drive-images-to-r2.ts --apply
 *   npx tsx scripts/migrate-drive-images-to-r2.ts --apply --delete-old   # + corbeille Drive
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
    const { putObject, deleteObject, assertR2Configured } = await import('../src/lib/r2');
    const { runDriveMigration } = await import('../src/lib/media/drive-migration-cli');
    const { createDriveSource } = await import('../src/lib/media/drive-source');

    assertR2Configured();

    console.log(APPLY ? '=== MIGRATION DRIVE → R2 — EXÉCUTION RÉELLE ===' : '=== MIGRATION DRIVE → R2 — DRY-RUN (aucune écriture) ===');
    console.log(`Environnement : ${envFile}`);
    console.log(`Base cible    : ${(process.env.TURSO_DATABASE_URL || '').replace(/^libsql:\/\//, '').split('.')[0]}`);
    console.log(`Bucket R2     : ${bucket}`);
    if (DELETE_OLD) console.log('Originaux Drive : MIS À LA CORBEILLE après les UPDATE réussis, si tout a été copié');

    // Journal JSONL créé AVANT la migration et complété ligne par ligne : un arrêt
    // en cours de `--apply` laisse la trace de tout ce qui a déjà été repointé.
    let journalFile: string | null = null;
    if (APPLY) {
        const outDir = path.join(process.cwd(), 'scripts', 'out');
        mkdirSync(outDir, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        journalFile = path.join(outDir, `drive-migration-${stamp}.jsonl`);
        writeFileSync(journalFile, '');
        console.log(`Journal       : ${journalFile}`);
    }

    // Lecture des lignes, migration, bilan et code de sortie : `src/lib/media/drive-migration-cli.ts` (testé).
    const run = await runDriveMigration({
        onJournal: (entry) => {
            if (journalFile) appendFileSync(journalFile, `${JSON.stringify({ ...entry, env: envFile, at: new Date().toISOString() })}\n`);
        },
        db,
        drive: createDriveSource(),
        r2: {
            put: (key: string, body: Buffer, contentType: string) => putObject(key, body, contentType),
            delete: deleteObject,
        },
        apply: APPLY,
        deleteOld: DELETE_OLD,
        log: { info: console.log, warn: console.warn, error: console.error },
    });

    if (journalFile) {
        console.log(`\nJournal : ${journalFile} (${run.journal.length} ligne(s))`);
    } else {
        console.log('\nDry-run terminé. Relancez avec --apply pour écrire.');
    }
    if (run.exitCode === 2) console.warn('\nDes lignes ont été sautées (sans UL ou dossier partagé entre UL) : elles gardent leur id Drive.');
    if (run.exitCode !== 0) process.exit(run.exitCode);
}

main().catch(e => { console.error('Échec de la migration :', e); process.exit(1); });
