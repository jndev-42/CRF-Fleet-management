/**
 * Migration — range les PDF scellés des notes de frais par UL sur R2.
 *
 * Pour chaque note scellée : copie ses révisions sous
 * `ndf-revisions/{slug UL}/{id}-v{n}-{attempt}.pdf`, repointe `r2Key` et
 * `signatureRevisions[].r2Key`, puis écrit la copie publiée
 * `ndf/{slug UL}/{id}.pdf` (celle que la synchro Drive suit, `R2_PREFIX = ndf/`).
 *
 * À LANCER APRÈS le déploiement de la v5.47.0 (le code courant écrit déjà dans les
 * nouveaux dossiers ; ce script rattrape les notes existantes).
 *
 * Idempotent : une note déjà rangée n'est pas recopiée (sa copie publiée est
 * simplement réécrite, contenu identique ⇒ ETag identique) ; un slug renommé est
 * regroupé au prochain passage. Ne touche ni `expenses-staging/`, ni `demo/`, ni
 * les objets orphelins non référencés en base.
 *
 * `--delete-old` : à lancer en PASSE SÉPARÉE, après vérification du rangement et
 * pendant une période calme — une validation qui a déjà chargé une ancienne clé à
 * cet instant échoue et l'utilisateur doit réessayer. La base de démonstration
 * pointe vers les anciennes clés jusqu'à la prochaine recopie nocturne : utiliser
 * ensuite « Recopier la base démo » (page Aide).
 * Ne basculer la synchro Drive sur `R2_PREFIX = ndf/` qu'APRÈS `--apply`.
 *
 * Usage :
 *   npx tsx scripts/move-expense-pdfs-to-ul-folders.ts                      # dry-run (défaut)
 *   npx tsx scripts/move-expense-pdfs-to-ul-folders.ts --env .env.preview
 *   npx tsx scripts/move-expense-pdfs-to-ul-folders.ts --apply
 *   npx tsx scripts/move-expense-pdfs-to-ul-folders.ts --apply --delete-old  # supprime les anciennes clés
 */

import dotenv from 'dotenv';

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

    const { db } = await import('../src/lib/db');
    const { getObject, putObject, headObject, deleteObject, expenseUlSegment, assertR2Configured } = await import('../src/lib/r2');
    const { relocateReport } = await import('../src/lib/expenses/r2-relocation');

    assertR2Configured();

    console.log(APPLY ? '=== DÉPLACEMENT — EXÉCUTION RÉELLE ===' : '=== DÉPLACEMENT — DRY-RUN (aucune écriture) ===');
    console.log(`Environnement : ${envFile}`);
    console.log(`Base cible    : ${(process.env.TURSO_DATABASE_URL || '').replace(/^libsql:\/\//, '').split('.')[0]}`);
    if (DELETE_OLD) console.log('Anciennes clés : SUPPRIMÉES après chaque UPDATE réussi');

    // ⚠️ Jamais de `SELECT *` sur toutes les notes (signatures base64 : le client
    // libSQL se bloque silencieusement). On liste les ids, puis chaque note.
    const ids = (await db.execute(
        `SELECT id FROM "ExpenseReport" WHERE r2Key IS NOT NULL AND r2Key != '' ORDER BY submittedAt ASC`
    )).rows.map(r => String(r.id));
    console.log(`${ids.length} note(s) scellée(s).\n`);

    const deps = {
        get: getObject,
        put: (key: string, body: Buffer) => putObject(key, body),
        head: headObject,
        delete: deleteObject,
        execute: async (stmt: { sql: string; args: (string | null)[] }) => {
            const res = await db.execute(stmt);
            return { rowsAffected: res.rowsAffected };
        },
    };

    const stats = { moved: 0, unchanged: 0, skipped: 0, failed: 0 };
    const errors: string[] = [];

    for (const id of ids) {
        const res = await db.execute({
            sql: `SELECT er.id, er.ulId, er.r2Key, er.signatureRevisions, ul.slug AS ulSlug
                  FROM "ExpenseReport" er LEFT JOIN "UniteLocale" ul ON ul.id = er.ulId WHERE er.id = ?`,
            args: [id],
        });
        const row = res.rows[0];
        if (!row) { stats.failed++; errors.push(`${id} : introuvable`); console.error(`  ✗ ${id} introuvable`); continue; }

        const result = await relocateReport({
            id,
            segment: expenseUlSegment(row.ulSlug, String(row.ulId ?? '')),
            r2Key: (row.r2Key as string) || null,
            signatureRevisions: row.signatureRevisions == null ? null : String(row.signatureRevisions),
        }, deps, { apply: APPLY, deleteOld: DELETE_OLD });

        const verb = APPLY ? '' : '(plan) ';
        switch (result.status) {
            case 'moved':
            case 'unchanged':
                stats[result.status]++;
                console.log(`  ${result.status === 'moved' ? '→' : '='} ${verb}${id} ${result.status === 'moved' ? 'à ranger' : 'déjà rangée'} → ${result.publishedKey}`);
                for (const m of result.moves) {
                    const note = m.missing ? ' (révision intermédiaire jamais écrite : repointée vers la courante)'
                        : m.copied ? '' : ' (cible déjà présente)';
                    console.log(`      ${m.from} → ${m.to}${note}`);
                }
                for (const d of result.deleted) console.log(`      ${APPLY ? 'supprimé' : 'à supprimer'} : ${d}`);
                break;
            case 'skipped':
                stats.skipped++;
                console.warn(`  ! ${id} sautée : ${result.reason}`);
                break;
            case 'error':
                stats.failed++;
                errors.push(`${id} : ${result.reason}`);
                console.error(`  ✗ ${id} : ${result.reason}`);
                break;
        }
    }

    console.log(`\nÀ ranger/rangées ${stats.moved} · déjà rangées ${stats.unchanged} · sautées ${stats.skipped} · échecs ${stats.failed}`);
    if (errors.length) {
        console.error('\nErreurs :');
        for (const e of errors) console.error(`  - ${e}`);
    }
    if (!APPLY) console.log('\nDry-run terminé. Relancez avec --apply pour écrire.');
    if (stats.failed > 0) process.exit(1);
}

main().catch(e => { console.error('Échec de la migration :', e); process.exit(1); });
