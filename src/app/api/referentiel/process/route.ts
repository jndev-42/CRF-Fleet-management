/**
 * POST /api/referentiel/process — SUPER_ADMIN : indexe le PDF déposé, par lots.
 *
 * Piloté par le navigateur : il rappelle la route avec `fromPage` jusqu'à `done`.
 * Chaque appel indexe au plus PAGES_PER_BATCH pages (et s'arrête avant
 * `maxDuration`), en lisant le PDF par requêtes `Range` sur R2.
 *
 *  - 1er appel (`uploading`) : vérifie la signature `%PDF`, fixe `pageCount`,
 *    abandonne tout autre import en cours.
 *  - appel suivant le dernier lot (`fromPage = pageCount + 1`) : bascule SEULE, en
 *    UNE transaction — la nouvelle version passe `ready`, les anciennes disparaissent
 *    et l'index FTS est reconstruit (la recherche ne voit jamais un état vide). Puis
 *    l'ancien objet R2 est supprimé. Séparée de l'extraction pour garder tout le
 *    budget de `maxDuration`.
 */
import { NextResponse } from 'next/server';
import type { Transaction } from '@libsql/client';
import { z } from 'zod';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { isSuperAdmin } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { getErrorMessage } from '@/lib/utils/error';
import { deleteObject, getObjectRange, getObjectSize } from '@/lib/r2';
import { hasPdfSignature } from '@/lib/vehicleGuide';
import { countPages, extractPages, type PdfSource } from '@/lib/referentiel/extract';
import { PAGES_PER_BATCH } from '@/lib/referentiel/repository';
import { REFERENTIEL_REBUILD_SQL } from '@/lib/referentiel/schema';
import { applyFicheNames } from '@/lib/referentiel/pageTitle';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Marge sous `maxDuration` : on rend la main avant que Vercel ne coupe la fonction. */
const BATCH_TIME_BUDGET_MS = 40_000;

const processSchema = z.object({
    id: z.string().min(1),
    fromPage: z.number().int().min(1),
}).strict();

const NOT_PDF_ERROR = 'Le fichier doit être un PDF.';

/** Supprime un objet R2 sans jamais faire échouer l'appelant : un orphelin est inoffensif. */
async function deleteObjectQuietly(key: string): Promise<void> {
    try {
        await deleteObject(key);
    } catch (e: unknown) {
        console.error('referentiel: suppression R2 échouée', key, getErrorMessage(e));
    }
}

/** Le PDF déposé sur R2, lu par plages d'octets (jamais en entier). */
function r2Source(key: string): PdfSource {
    return {
        async size() {
            const size = await getObjectSize(key);
            if (size === null) throw new Error('Objet R2 introuvable');
            return size;
        },
        async read(start, end) {
            const bytes = await getObjectRange(key, start, end - 1);
            if (!bytes) throw new Error('Objet R2 introuvable');
            return bytes;
        },
    };
}

/**
 * Titres de toutes les pages, lus par paquets de 200 (≈ 20 Ko par réponse). À l'origine
 * un contournement de @libsql/client 0.5.6, qui ne terminait jamais une réponse HTTP de
 * plus de ~64 Ko ; le client actuel (fetch natif) n'a plus ce défaut, mais des réponses
 * bornées gardent la bascule prévisible. Voir aussi `scripts/dev-db-init.ts`.
 */
const TITLES_PAGE_SIZE = 200;
const RENAME_BATCH_SIZE = 100;

async function readTitles(tx: Transaction, id: string): Promise<{ page: number; title: string }[]> {
    const titles: { page: number; title: string }[] = [];
    for (let after = 0; ;) {
        const res = await tx.execute({
            sql: `SELECT page, title FROM ReferentielPage WHERE referentielId = ? AND page > ? ORDER BY page LIMIT ?`,
            args: [id, after, TITLES_PAGE_SIZE],
        });
        for (const r of res.rows) titles.push({ page: Number(r.page), title: String(r.title ?? '') });
        if (res.rows.length < TITLES_PAGE_SIZE) return titles;
        after = titles[titles.length - 1].page;
    }
}

async function markFailed(id: string): Promise<void> {
    await db.execute({ sql: `UPDATE Referentiel SET status = 'failed' WHERE id = ?`, args: [id] });
}

/**
 * Bascule atomique vers la nouvelle version ; renvoie les clés R2 devenues orphelines,
 * ou `null` si l'import a été abandonné entre-temps (rien n'est alors modifié).
 *
 * Tout AUTRE import est purgé, quel que soit son statut : un dépôt jamais terminé
 * (`uploading`) ne doit ni rester « en cours » indéfiniment ni laisser son objet R2.
 */
async function activate(id: string): Promise<string[] | null> {
    const tx = await db.transaction('write');
    try {
        // Conditionnel : un import marqué `failed` pendant qu'un de ses lots tournait ne s'active pas.
        const switched = await tx.execute({
            sql: `UPDATE Referentiel SET status = 'ready', readyAt = CURRENT_TIMESTAMP WHERE id = ? AND status = 'processing'`,
            args: [id],
        });
        if (switched.rowsAffected === 0) {
            await tx.rollback();
            return null;
        }
        const stale = await tx.execute({ sql: `SELECT r2Key FROM Referentiel WHERE id != ?`, args: [id] });
        await tx.execute({ sql: `DELETE FROM ReferentielPage WHERE referentielId != ?`, args: [id] });
        await tx.execute({ sql: `DELETE FROM Referentiel WHERE id != ?`, args: [id] });
        // Les pages de suite reprennent le nom de fiche lu sur leur page de couverture.
        const renamed = applyFicheNames(await readTitles(tx, id));
        // Par paquets, comme `readTitles` : un batch renvoie un résultat par instruction.
        for (let i = 0; i < renamed.length; i += RENAME_BATCH_SIZE) {
            await tx.batch(renamed.slice(i, i + RENAME_BATCH_SIZE).map(({ page, title }) => ({
                sql: `UPDATE ReferentielPage SET title = ? WHERE referentielId = ? AND page = ?`,
                args: [title, id, page],
            })));
        }
        await tx.execute(REFERENTIEL_REBUILD_SQL);
        await tx.commit();
        return stale.rows.map(r => String(r.r2Key));
    } catch (e: unknown) {
        await tx.rollback();
        throw e;
    }
}

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) return unauthorizedResponse();
        if (!isSuperAdmin(session.user.roles || [])) return forbiddenResponse();

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Corps invalide' }, { status: 400 });
        }
        const parsed = processSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Données invalides', details: parsed.error.issues }, { status: 400 });
        }
        const { id, fromPage } = parsed.data;

        const found = await db.execute({
            sql: `SELECT r2Key, status, pageCount, processedPages FROM Referentiel WHERE id = ?`,
            args: [id],
        });
        const row = found.rows[0];
        if (!row) return NextResponse.json({ error: 'Import introuvable' }, { status: 404 });

        const r2Key = String(row.r2Key);
        let status = String(row.status);
        let pageCount = row.pageCount == null ? 0 : Number(row.pageCount);
        const processedPages = Number(row.processedPages ?? 0);

        if (status === 'ready' || status === 'failed') {
            return NextResponse.json({ error: `Import déjà terminé (${status})` }, { status: 409 });
        }

        if (status === 'uploading') {
            const head = await getObjectRange(r2Key, 0, 3);
            if (!head) return NextResponse.json({ error: "Le fichier n'a pas été déposé" }, { status: 400 });
            if (!hasPdfSignature(head)) {
                await deleteObjectQuietly(r2Key);
                await db.execute({ sql: `DELETE FROM Referentiel WHERE id = ?`, args: [id] });
                return NextResponse.json({ error: NOT_PDF_ERROR }, { status: 400 });
            }

            // Un seul import actif : le précédent traitement est abandonné.
            await db.execute({
                sql: `UPDATE Referentiel SET status = 'failed' WHERE id != ? AND status = 'processing'`,
                args: [id],
            });

            try {
                pageCount = await countPages(r2Source(r2Key));
            } catch (e: unknown) {
                await markFailed(id);
                console.error('referentiel: lecture du PDF échouée', getErrorMessage(e));
                return NextResponse.json({ error: 'PDF illisible' }, { status: 400 });
            }
            if (pageCount < 1) {
                await markFailed(id);
                return NextResponse.json({ error: 'PDF vide' }, { status: 400 });
            }
            await db.execute({
                sql: `UPDATE Referentiel SET status = 'processing', pageCount = ?, processedPages = 0 WHERE id = ?`,
                args: [pageCount, id],
            });
            status = 'processing';
        }

        // Reprise : on peut rejouer un lot déjà fait, pas en sauter un.
        if (fromPage > processedPages + 1) {
            return NextResponse.json({ error: `Reprise attendue à la page ${processedPages + 1}` }, { status: 409 });
        }

        // Toutes les pages sont indexées : cet appel ne fait QUE la bascule, avec tout
        // son budget de temps (reconstruction de l'index comprise).
        if (fromPage > pageCount) {
            const orphanKeys = await activate(id);
            if (!orphanKeys) return NextResponse.json({ error: 'Import abandonné' }, { status: 409 });
            for (const key of orphanKeys.filter(k => k !== r2Key)) await deleteObjectQuietly(key);
            return NextResponse.json({ id, status: 'ready', processedPages: pageCount, pageCount, done: true });
        }

        const toPage = Math.min(fromPage + PAGES_PER_BATCH - 1, pageCount);
        let pages;
        try {
            pages = await extractPages(
                r2Source(r2Key),
                fromPage,
                toPage,
                { deadline: Date.now() + BATCH_TIME_BUDGET_MS },
            );
        } catch (e: unknown) {
            await markFailed(id);
            console.error('referentiel: extraction échouée', getErrorMessage(e));
            return NextResponse.json({ error: "Échec de l'extraction du texte" }, { status: 500 });
        }

        if (pages.length > 0) {
            await db.batch(
                pages.map(p => ({
                    sql: `INSERT OR REPLACE INTO ReferentielPage (referentielId, page, title, body) VALUES (?, ?, ?, ?)`,
                    args: [id, p.page, p.title, p.body],
                })),
                'write',
            );
        }
        const lastPage = pages.length > 0 ? pages[pages.length - 1].page : fromPage - 1;
        const newProcessed = Math.max(processedPages, lastPage);
        await db.execute({ sql: `UPDATE Referentiel SET processedPages = ? WHERE id = ?`, args: [newProcessed, id] });

        // Même au dernier lot, la bascule attend l'appel suivant (`fromPage = pageCount + 1`) :
        // enchaînée ici, elle dépassait `maxDuration` après un lot d'extraction complet.
        return NextResponse.json({
            id,
            status: 'processing',
            processedPages: newProcessed,
            pageCount,
            done: false,
        });
    } catch (e: unknown) {
        console.error('POST /api/referentiel/process error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
