/**
 * Backfill — scelle rétroactivement les notes de frais existantes.
 *
 * Décision D3 : après ce backfill, il n'existe plus qu'une seule façon d'obtenir
 * le PDF d'une note non-brouillon — le lire depuis R2. Le repli de génération à
 * la volée de `GET /api/expenses/[id]/pdf` peut alors être retiré (étape 7.3).
 *
 * ⚠️ DATES. Décision D7 : la date de signature est celle du SCELLEMENT RÉEL, pas
 * la date historique de l'événement. Acrobat affichera donc la date du backfill,
 * même pour une note de 2025. Sans horodatage RFC-3161, injecter une date passée
 * reviendrait à fabriquer une antériorité sur un document comptable. La date
 * métier est conservée dans `signatureRevisions.businessDate`.
 *
 * ⚠️ NOTES LONGUES (§K13). Une note de plus de 14 postes produit un PDF de deux
 * pages ; le widget serait estampillé page 1 et le bloc signature partirait page 2.
 * Ces notes sont scellées SANS widget visible — les trois signatures existent
 * cryptographiquement, seul le rendu visuel manque. On ne peut pas les refuser
 * rétroactivement, et les laisser sans PDF violerait la couverture à 100 %.
 *
 * Idempotent : `WHERE r2Key IS NULL` exclut naturellement ce qui est déjà scellé,
 * donc une reprise après interruption ne duplique rien.
 *
 * Usage :
 *   npx tsx scripts/backfill-signed-pdfs.ts                 # dry-run (défaut)
 *   npx tsx scripts/backfill-signed-pdfs.ts --env .env.preview
 *   npx tsx scripts/backfill-signed-pdfs.ts --apply         # exécution réelle
 *   npx tsx scripts/backfill-signed-pdfs.ts --apply --limit 10
 *   npx tsx scripts/backfill-signed-pdfs.ts --apply --report-id <id>
 */

import dotenv from 'dotenv';

// Cible l'environnement passé en `--env` (défaut : .env.local).
const envFile = (() => {
    const i = process.argv.indexOf('--env');
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : '.env.local';
})();
dotenv.config({ path: envFile });

const APPLY = process.argv.includes('--apply');
const LIMIT = (() => {
    const i = process.argv.indexOf('--limit');
    return i !== -1 && process.argv[i + 1] ? Number(process.argv[i + 1]) : null;
})();
const ONLY_ID = (() => {
    const i = process.argv.indexOf('--report-id');
    return i !== -1 ? process.argv[i + 1] : null;
})();

interface Stats { scanned: number; sealed: number; skipped: number; failed: number; }

async function main(): Promise<void> {
    const { db } = await import('../src/lib/db');
    const { generateExpensePdf, countItems } = await import('../src/lib/expenses/pdf');
    const { sealPdf, decodeSignatureImage, assertSigningCertConfigured } = await import('../src/lib/pdf/signature');
    const { putObject, buildExpenseKey, newAttemptId, assertR2Configured } = await import('../src/lib/r2');
    const { SIGNATURE_WIDGET_RECTS, MAX_ITEMS_SINGLE_PAGE } = await import('../src/lib/expenses/signature-layout');
    const sharp = (await import('sharp')).default;

    /**
     * Apparence de repli pour une signature « typed » sans image.
     *
     * Les notes antérieures peuvent porter une signature saisie au clavier, sans
     * tracé manuscrit enregistré. Le PDF d'origine affichait alors le nom en
     * italique bleu ; sans repli, la colonne resterait vide et le document scellé
     * serait moins lisible que celui qu'il remplace.
     *
     * Reproduit le style de `ExpensePdfDocument` : Helvetica-BoldOblique, #002B49.
     */
    async function nameAppearance(name: string): Promise<Buffer> {
        const escaped = name.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!));
        return sharp(Buffer.from(
            `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="100">
               <text x="12" y="62" font-family="Helvetica,Arial,sans-serif" font-size="30"
                     font-weight="bold" font-style="italic" fill="#002B49">${escaped}</text>
             </svg>`
        )).png().toBuffer();
    }

    /** Image de signature si elle existe, sinon apparence dérivée du nom. */
    async function appearanceFor(sig: { image?: string; name?: string } | null, fallbackName: string): Promise<Buffer | null> {
        const decoded = decodeSignatureImage(sig?.image);
        if (decoded) return decoded;
        const label = sig?.name || fallbackName;
        return label ? nameAppearance(label) : null;
    }

    // Échouer tôt et lisiblement plutôt qu'au premier scellement.
    assertSigningCertConfigured();
    if (APPLY) assertR2Configured();

    console.log(APPLY ? '=== BACKFILL — EXÉCUTION RÉELLE ===' : '=== BACKFILL — DRY-RUN (aucune écriture) ===');
    console.log(`Environnement : ${envFile}`);
    console.log(`Base cible    : ${(process.env.TURSO_DATABASE_URL || '').replace(/^libsql:\/\//, '').split('.')[0]}`);

    const where = ONLY_ID
        ? { sql: `SELECT * FROM "ExpenseReport" WHERE id = ?`, args: [ONLY_ID] }
        : {
            sql: `SELECT * FROM "ExpenseReport"
                  WHERE status != 'brouillon' AND (r2Key IS NULL OR r2Key = '')
                  ORDER BY submittedAt ASC` + (LIMIT ? ` LIMIT ${LIMIT}` : ''),
            args: [] as string[],
        };

    const rows = (await db.execute(where)).rows;
    const stats: Stats = { scanned: rows.length, sealed: 0, skipped: 0, failed: 0 };
    console.log(`${rows.length} note(s) à traiter.\n`);

    for (const row of rows) {
        const id = row.id as string;
        const status = row.status as string;
        const itemCount = countItems(row.items as string);
        const tooLong = itemCount > MAX_ITEMS_SINGLE_PAGE;

        // Une note déjà scellée est ignorée : c'est ce qui rend le script rejouable.
        if (row.r2Key) { stats.skipped++; console.log(`  = ${id} déjà scellée`); continue; }

        const parse = (raw: unknown) => {
            if (typeof raw !== 'string' || !raw.trim()) return null;
            try { return JSON.parse(raw); } catch { return null; }
        };
        const userSig = parse(row.userSignature);
        const valSig = parse(row.validatorSignature);

        // Nombre de scellements à poser, déduit du statut atteint.
        const steps = 1
            + (row.validatedAt || row.rejectedAt ? 1 : 0)
            + (row.paidAt ? 1 : 0);

        if (!APPLY) {
            console.log(
                `  · ${id} [${status}] ${itemCount} postes → ${steps} signature(s)` +
                (tooLong ? '  ⚠️ >14 postes : scellement SANS widget visible' : '')
            );
            continue;
        }

        try {
            const now = new Date();
            let buf = await generateExpensePdf(id, { forSealing: true });
            const revisions: unknown[] = [];
            let key = '';

            const seal = async (
                step: 1 | 2 | 3, role: string, reason: string,
                name: string, image: Buffer | null, rect: readonly number[] | null,
                businessDate: string | null,
            ) => {
                buf = await sealPdf(buf, {
                    reason, name, signingTime: now,
                    // Notes longues : aucun widget, l'invisibilité évite le
                    // problème de page (le widget serait toujours posé page 1).
                    ...(rect && image && !tooLong ? { widgetRect: rect, appearancePng: image } : {}),
                    ...(step === 1 ? { docMdpLevel: 2 as const } : {}),
                });
                key = buildExpenseKey(id, step, newAttemptId());
                revisions.push({
                    step, signerId: null, signerName: name, role,
                    signedAt: now.toISOString(), businessDate, backfilled: true, r2Key: key,
                });
            };

            await seal(1, 'Demandeur', 'Soumission (scellée rétroactivement)',
                userSig?.name || (row.userName as string) || 'Demandeur',
                await appearanceFor(userSig, (row.userName as string) || ''), SIGNATURE_WIDGET_RECTS.demandeur,
                (row.submittedAt as string) || null);

            if (row.validatedAt || row.rejectedAt) {
                await seal(2, 'Valideur',
                    row.rejectedAt ? 'Refus (scellé rétroactivement)' : 'Validation (scellée rétroactivement)',
                    valSig?.name || 'Valideur',
                    await appearanceFor(valSig, ''), SIGNATURE_WIDGET_RECTS.valideur,
                    (row.validatedAt as string) || (row.rejectedAt as string) || null);
            }

            if (row.paidAt) {
                // Scellement #3 : jamais de widget, y compris hors notes longues.
                await seal(3, 'Payeur', 'Paiement (scellé rétroactivement)', 'Trésorier', null, null,
                    (row.paidAt as string) || null);
            }

            // R2 d'abord, base ensuite — même ordre que sur le chemin nominal.
            await putObject(key, buf);
            await db.execute({
                sql: `UPDATE "ExpenseReport" SET r2Key = ?, signatureRevisions = ?, updatedAt = ? WHERE id = ?`,
                args: [key, JSON.stringify(revisions), new Date().toISOString(), id],
            });

            stats.sealed++;
            console.log(`  + ${id} [${status}] ${revisions.length} signature(s) → ${key}${tooLong ? ' (sans widget)' : ''}`);
        } catch (e: unknown) {
            stats.failed++;
            console.error(`  ✗ ${id} : ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    console.log(`\nParcourues ${stats.scanned} · scellées ${stats.sealed} · ignorées ${stats.skipped} · échecs ${stats.failed}`);

    if (APPLY) {
        const remaining = await db.execute(
            `SELECT COUNT(*) AS n FROM "ExpenseReport" WHERE status != 'brouillon' AND (r2Key IS NULL OR r2Key = '')`
        );
        const n = Number(remaining.rows[0]?.n ?? 0);
        console.log(`Restant à sceller : ${n}`);
        if (n === 0) {
            console.log('Couverture complète — le repli de génération à la volée peut être retiré (étape 7.3).');
        }
    } else {
        console.log('\nDry-run terminé. Relancez avec --apply pour écrire.');
    }
}

main().catch(e => { console.error('Échec du backfill :', e); process.exit(1); });
