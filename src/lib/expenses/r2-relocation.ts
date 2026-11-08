/**
 * Rangement des PDF scellés des notes de frais par UL sur R2.
 *
 * Utilisé par `scripts/move-expense-pdfs-to-ul-folders.ts`. Les accès R2 et SQL
 * sont INJECTÉS : la logique se teste sans réseau et reste indépendante du client.
 *
 * Pour une note scellée :
 *   - chaque révision (`r2Key` + `signatureRevisions[].r2Key`) est copiée sous
 *     `ndf-revisions/{segment UL}/` (jamais d'écrasement : une cible déjà
 *     présente n'est pas recopiée) ;
 *   - la base est repointée par un UPDATE gardé (concurrence) ;
 *   - la copie publiée `ndf/{segment UL}/{id}.pdf` est réécrite depuis la
 *     révision courante (contenu identique ⇒ ETag identique ⇒ Drive ne bouge pas) ;
 *   - avec `deleteOld`, les anciennes clés déplacées sont supprimées APRÈS l'UPDATE.
 */

import { buildExpensePublishedKey } from '@/lib/r2';

const REVISIONS_PREFIX = 'ndf-revisions/';

/** Ligne minimale d'une note scellée, telle que la lit le script. */
export interface RelocationRow {
    id: string;
    /** Segment UL déjà assaini (voir `expenseUlSegment`). */
    segment: string;
    r2Key: string | null;
    /** Colonne brute `signatureRevisions` (JSON), ou null. */
    signatureRevisions: string | null;
}

export interface RelocationDeps {
    get(key: string): Promise<Buffer | null>;
    put(key: string, body: Buffer): Promise<void>;
    head(key: string): Promise<boolean>;
    delete(key: string): Promise<void>;
    execute(stmt: { sql: string; args: (string | null)[] }): Promise<{ rowsAffected: number }>;
}

export interface RelocationOptions {
    apply: boolean;
    deleteOld: boolean;
}

export interface RelocationMove {
    from: string;
    to: string;
    /** La révision a été (ou serait) copiée ; false si la cible existait déjà. */
    copied: boolean;
}

export type RelocationStatus = 'moved' | 'unchanged' | 'skipped' | 'error';

export interface RelocationResult {
    id: string;
    status: RelocationStatus;
    moves: RelocationMove[];
    publishedKey: string | null;
    /** Anciennes clés supprimées (ou à supprimer en dry-run). */
    deleted: string[];
    /** Motif pour `skipped` / `error`. */
    reason?: string;
}

/**
 * Nouvelle clé d'une révision : `ndf-revisions/{segment}/{nom}`.
 *
 * Une clé déjà sous `ndf-revisions/` garde son dernier segment (cas d'un slug
 * renommé) ; une ancienne clé `{id}/v{n}-{attempt}.pdf` a ses segments joints
 * par `-`, ce qui donne le même nom que `buildExpenseKey`.
 */
export function relocatedRevisionKey(oldKey: string, segment: string): string {
    const parts = oldKey.split('/').filter(Boolean);
    const name = oldKey.startsWith(REVISIONS_PREFIX)
        ? parts[parts.length - 1]
        : parts.join('-');
    return `${REVISIONS_PREFIX}${segment}/${name}`;
}

/** Dossier UL d'une clé `ndf-revisions/{x}/…`, ou null. */
function revisionFolder(key: string): string | null {
    if (!key.startsWith(REVISIONS_PREFIX)) return null;
    const parts = key.split('/');
    return parts.length >= 3 ? parts[1] : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseRevisions(raw: string | null): unknown[] | null {
    if (!raw || !raw.trim()) return [];
    try {
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

export async function relocateReport(
    row: RelocationRow,
    deps: RelocationDeps,
    opts: RelocationOptions,
): Promise<RelocationResult> {
    const result: RelocationResult = { id: row.id, status: 'unchanged', moves: [], publishedKey: null, deleted: [] };
    if (!row.r2Key) return { ...result, status: 'skipped', reason: 'brouillon (pas de PDF scellé)' };

    const revisions = parseRevisions(row.signatureRevisions);
    if (!revisions) return { ...result, status: 'error', reason: 'signatureRevisions illisible (JSON invalide)' };

    // Toutes les clés distinctes à ranger : la courante et celles du journal.
    const oldKeys = new Set<string>([row.r2Key]);
    for (const rev of revisions) {
        if (isRecord(rev) && typeof rev.r2Key === 'string' && rev.r2Key) oldKeys.add(rev.r2Key);
    }
    const mapping = new Map<string, string>();
    for (const k of oldKeys) mapping.set(k, relocatedRevisionKey(k, row.segment));

    try {
        // 1. Copie des révisions vers leur nouvelle clé (jamais d'écrasement).
        for (const [from, to] of mapping) {
            if (from === to) continue;
            if (await deps.head(to)) {
                result.moves.push({ from, to, copied: false });
                continue;
            }
            if (opts.apply) {
                const buf = await deps.get(from);
                if (!buf) return { ...result, status: 'error', reason: `objet source absent : ${from}` };
                await deps.put(to, buf);
            } else if (!(await deps.head(from))) {
                return { ...result, status: 'error', reason: `objet source absent : ${from}` };
            }
            result.moves.push({ from, to, copied: true });
        }

        const newCurrent = mapping.get(row.r2Key)!;
        const publishedKey = buildExpensePublishedKey(row.segment, row.id);
        result.publishedKey = publishedKey;
        const changed = mapping.size > 0 && [...mapping].some(([f, t]) => f !== t);

        // Dossier(s) UL d'origine différents du dossier courant (slug renommé).
        const staleFolders = new Set<string>();
        for (const k of oldKeys) {
            const folder = revisionFolder(k);
            if (folder && folder !== row.segment) staleFolders.add(folder);
        }

        // Clés à supprimer avec --delete-old : anciennes clés déplacées, clés
        // héritées (`{id}/{reste}`) d'une révision déjà rangée lors d'un passage
        // précédent (elles ne sont plus en base), et copie publiée restée dans
        // l'ancien dossier d'un slug renommé. Les deux dernières sont vérifiées par
        // `head`. Même liste en dry-run et en exécution.
        const collectDeletions = async (): Promise<string[]> => {
            const targets = new Set(mapping.values());
            const out = new Set<string>();
            for (const [f, t] of mapping) if (f !== t) out.add(f);
            const prefix = `${REVISIONS_PREFIX}${row.segment}/${row.id}-`;
            for (const t of targets) {
                if (!t.startsWith(prefix)) continue;
                const legacy = `${row.id}/${t.slice(prefix.length)}`;
                if (!targets.has(legacy) && !out.has(legacy) && await deps.head(legacy)) out.add(legacy);
            }
            for (const folder of staleFolders) {
                const stalePublished = buildExpensePublishedKey(folder, row.id);
                if (stalePublished !== publishedKey && await deps.head(stalePublished)) out.add(stalePublished);
            }
            return [...out];
        };

        if (!opts.apply) {
            if (opts.deleteOld) result.deleted = await collectDeletions();
            result.status = changed ? 'moved' : 'unchanged';
            return result;
        }

        // 2. Base : UPDATE gardé contre un scellement survenu entre-temps.
        if (changed) {
            const nextRevisions = revisions.map(rev =>
                isRecord(rev) && typeof rev.r2Key === 'string' && mapping.has(rev.r2Key) ? { ...rev, r2Key: mapping.get(rev.r2Key) } : rev);
            const res = await deps.execute({
                sql: `UPDATE "ExpenseReport" SET r2Key = ?, signatureRevisions = ?
                      WHERE id = ? AND r2Key IS ? AND signatureRevisions IS ?`,
                args: [
                    newCurrent,
                    // Journal vide à l'origine : on ne fabrique rien.
                    row.signatureRevisions === null ? null : JSON.stringify(nextRevisions),
                    row.id, row.r2Key, row.signatureRevisions,
                ],
            });
            if (res.rowsAffected !== 1) {
                return { ...result, status: 'skipped', publishedKey: null, reason: 'note modifiée entre-temps (r2Key ou journal changé), non migrée' };
            }
            result.status = 'moved';
        }

        // 3. Copie publiée, réécrite depuis la révision courante.
        const current = await deps.get(newCurrent);
        if (!current) return { ...result, status: 'error', reason: `révision courante absente : ${newCurrent}` };
        await deps.put(publishedKey, current);

        // 4. Nettoyage, seulement après un UPDATE réussi.
        if (opts.deleteOld) {
            for (const key of await collectDeletions()) {
                await deps.delete(key);
                result.deleted.push(key);
            }
        }
        return result;
    } catch (e: unknown) {
        return { ...result, status: 'error', reason: e instanceof Error ? e.message : String(e) };
    }
}
