/**
 * Rangement par UL des objets R2 référencés en base — logique de
 * `scripts/move-r2-objects-to-ul-folders.ts`, sortie du script pour être testée.
 *
 *   - `Vehicle.photoR2Key`            `vehicle-photos/{id}/{att}.jpg`   → `vehicle-photos/{UL}/{nom}/{att}.jpg`
 *   - `VehicleDocument.r2Key`         `vehicle-guides/{id}/{att}.pdf`   → `vehicle-documents/{UL}/{nom}/{att}.pdf`
 *     (+ `Vehicle.guideR2Key` égal, repointé dans la même transaction)
 *   - `ExpenseReport.pendingReceiptKeys` (brouillons) `expenses-staging/{stagingId}/{f}`
 *                                                     → `expenses-staging/{UL}/{stagingId}/{f}`
 *
 * Le nom de fichier final est conservé : une clé déjà à la bonne place n'est pas
 * touchée, une clé sous un ancien slug ou un ancien nom de véhicule est regroupée.
 * Ordre : copie → UPDATE gardé (`WHERE … = <ancienne valeur>`) → suppression de
 * l'ancienne clé (seulement avec `deleteOld`, après UPDATE réussi, et si plus rien
 * ne la référence). La base et R2 sont INJECTÉS (le script passe les vrais, les
 * tests une base SQLite en mémoire et un faux bucket).
 */

import {
    EXPENSE_STAGING_PREFIX,
    LEGACY_VEHICLE_GUIDE_PREFIX,
    VEHICLE_DOCUMENT_PREFIX,
    VEHICLE_PHOTO_PREFIX,
    expenseUlSegment,
    hasDotSegment,
    parseExpenseStagingKey,
    vehicleMediaFolder,
} from '@/lib/r2';
import { toMediaUlSegment } from '@/lib/media/refs';

type SqlArg = string | null;
type Stmt = { sql: string; args: SqlArg[] };

/** Sous-ensemble du client libSQL utilisé (le vrai `db` comme un client `file::memory:`). */
export interface RelocationDb {
    execute(stmt: string | Stmt): Promise<{ rows: Record<string, unknown>[]; rowsAffected: number }>;
    batch(stmts: Stmt[], mode: 'write'): Promise<{ rowsAffected: number }[]>;
}

/** Bucket R2 (lecture, écriture, existence, suppression). */
export interface RelocationStore {
    get(key: string): Promise<Buffer | null>;
    put(key: string, body: Buffer, contentType: string): Promise<void>;
    head(key: string): Promise<boolean>;
    delete(key: string): Promise<void>;
}

export interface RelocationLogger {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
}

export type RelocationKind = 'vehicle-photo' | 'vehicle-document' | 'expense-staging';

const KIND_LABELS: Record<RelocationKind, string> = {
    'vehicle-photo': 'Photo du véhicule',
    'vehicle-document': 'Document du véhicule',
    'expense-staging': 'Justificatifs du brouillon',
};

/** Une ligne à ranger : ses clés actuelles et l'UL qui les range. */
export interface RelocationRow {
    kind: RelocationKind;
    /** Id de la ligne repointée (Vehicle, VehicleDocument ou ExpenseReport). */
    rowId: string;
    /** Libellé lisible (nom du véhicule, id de note). */
    label: string;
    ulSegment: string | null;
    vehicleId?: string;
    vehicleName?: string;
    /** Valeur brute de la colonne (clé, ou JSON des justificatifs). */
    current: string;
    /** Document : `Vehicle.guideR2Key` du véhicule (repointé s'il est égal). */
    guideR2Key?: string | null;
}

export interface KeyMove {
    from: string;
    to: string;
}

export interface RelocationJournalEntry {
    kind: RelocationKind;
    table: string;
    rowId: string;
    moves: KeyMove[];
    guideRepointed: boolean;
    deleted: string[];
}

export type RelocationResult =
    | { status: 'moved' | 'planned'; moves: KeyMove[]; guideRepointed: boolean; deleted: string[]; warnings: string[] }
    | { status: 'unchanged' }
    | { status: 'skipped'; reason: string; moves?: KeyMove[] }
    | { status: 'error'; reason: string };

/** Segment UL d'une ligne ; `null` sans UL (ligne sautée, jamais rangée sous une UL inventée). */
export function relocationUlSegment(slug: unknown, ulId: unknown): string | null {
    return ulId && ulId !== 'default' ? toMediaUlSegment(expenseUlSegment(slug, String(ulId))) : null;
}

const FILE_RE = /^[A-Za-z0-9._-]+$/;

/**
 * Destination d'une clé de véhicule : même nom de fichier, sous
 * `{préfixe}/{UL}/{nom du véhicule}/`. `null` si la clé n'est pas une clé de ce
 * type (autre préfixe, `..`, nom de fichier invalide) : elle n'est pas touchée.
 */
export function relocatedVehicleKey(
    kind: 'vehicle-photo' | 'vehicle-document', key: string, ulSegment: string, vehicleName: unknown,
): string | null {
    if (hasDotSegment(key)) return null;
    const parts = key.split('/');
    const accepted = kind === 'vehicle-photo' ? [VEHICLE_PHOTO_PREFIX] : [VEHICLE_DOCUMENT_PREFIX, LEGACY_VEHICLE_GUIDE_PREFIX];
    if (!accepted.includes(parts[0]) || parts.length < 3 || parts.length > 4) return null;
    const file = parts[parts.length - 1];
    if (!FILE_RE.test(file)) return null;
    const prefix = kind === 'vehicle-photo' ? VEHICLE_PHOTO_PREFIX : VEHICLE_DOCUMENT_PREFIX;
    return `${vehicleMediaFolder(prefix, ulSegment, vehicleName)}/${file}`;
}

/** Destination d'une clé de justificatif : `expenses-staging/{UL}/{stagingId}/{fichier}` ; `null` si invalide. */
export function relocatedStagingKey(key: string, ulSegment: string): string | null {
    const parsed = parseExpenseStagingKey(key);
    if (!parsed) return null;
    return `${EXPENSE_STAGING_PREFIX}/${ulSegment}/${parsed.stagingId}/${parsed.file}`;
}

/** Type de l'objet d'après ses octets (`%PDF`), jamais d'après l'extension de la clé. */
export function contentTypeOfBody(body: Buffer): string {
    return body.subarray(0, 4).toString('latin1') === '%PDF' ? 'application/pdf' : 'image/jpeg';
}

/** Lignes portant une clé à ranger (ou déjà rangée : `relocateRow` répond alors `unchanged`). */
export async function readRelocationRows(db: RelocationDb): Promise<RelocationRow[]> {
    const rows: RelocationRow[] = [];

    const photos = await db.execute(`
        SELECT v.id, v.name, v.ulId, ul.slug, v.photoR2Key AS ref
        FROM Vehicle v LEFT JOIN "UniteLocale" ul ON ul.id = v.ulId
        WHERE v.photoR2Key IS NOT NULL AND v.photoR2Key != ''
        ORDER BY v.id`);
    for (const r of photos.rows) {
        rows.push({
            kind: 'vehicle-photo', rowId: String(r.id), label: String(r.name ?? r.id),
            ulSegment: relocationUlSegment(r.slug, r.ulId), vehicleId: String(r.id), vehicleName: String(r.name ?? ''),
            current: String(r.ref),
        });
    }

    const documents = await db.execute(`
        SELECT d.id, d.r2Key AS ref, v.id AS vehicleId, v.name, v.ulId, ul.slug, v.guideR2Key
        FROM VehicleDocument d LEFT JOIN Vehicle v ON v.id = d.vehicleId
        LEFT JOIN "UniteLocale" ul ON ul.id = v.ulId
        ORDER BY d.vehicleId, d.id`);
    for (const r of documents.rows) {
        rows.push({
            kind: 'vehicle-document', rowId: String(r.id), label: `${String(r.name ?? '?')} · document ${String(r.id)}`,
            ulSegment: r.vehicleId ? relocationUlSegment(r.slug, r.ulId) : null,
            vehicleId: r.vehicleId ? String(r.vehicleId) : undefined, vehicleName: String(r.name ?? ''),
            current: String(r.ref), guideR2Key: r.guideR2Key == null ? null : String(r.guideR2Key),
        });
    }

    // ⚠️ Jamais de `SELECT *` sur les notes (signatures base64 volumineuses).
    const drafts = await db.execute(`
        SELECT er.id, er.ulId, ul.slug, er.pendingReceiptKeys AS ref
        FROM "ExpenseReport" er LEFT JOIN "UniteLocale" ul ON ul.id = er.ulId
        WHERE er.status = 'brouillon' AND er.pendingReceiptKeys IS NOT NULL AND er.pendingReceiptKeys != ''
        ORDER BY er.id`);
    for (const r of drafts.rows) {
        rows.push({
            kind: 'expense-staging', rowId: String(r.id), label: `note ${String(r.id)}`,
            ulSegment: relocationUlSegment(r.slug, r.ulId), current: String(r.ref),
        });
    }
    return rows;
}

/** Guides `Vehicle.guideR2Key` sans document correspondant : signalés, jamais déplacés seuls. */
export async function readOrphanGuides(db: RelocationDb): Promise<{ vehicleId: string; key: string }[]> {
    const res = await db.execute(`
        SELECT v.id, v.guideR2Key FROM Vehicle v
        WHERE v.guideR2Key IS NOT NULL AND v.guideR2Key != ''
          AND NOT EXISTS (SELECT 1 FROM VehicleDocument d WHERE d.r2Key = v.guideR2Key)
        ORDER BY v.id`);
    return res.rows.map((r) => ({ vehicleId: String(r.id), key: String(r.guideR2Key) }));
}

/** La clé est-elle encore référencée en base (n'importe quelle colonne rangée ici) ? */
async function isReferenced(db: RelocationDb, key: string): Promise<boolean> {
    const checks: Stmt[] = [
        { sql: `SELECT 1 FROM Vehicle WHERE photoR2Key = ? OR guideR2Key = ? LIMIT 1`, args: [key, key] },
        { sql: `SELECT 1 FROM VehicleDocument WHERE r2Key = ? LIMIT 1`, args: [key] },
        {
            // Élément exact du tableau JSON (pas une sous-chaîne) ; un JSON invalide est ignoré.
            sql: `SELECT 1 FROM "ExpenseReport" er, json_each(er.pendingReceiptKeys) k
                  WHERE er.pendingReceiptKeys IS NOT NULL AND json_valid(er.pendingReceiptKeys) AND k.value = ? LIMIT 1`,
            args: [key],
        },
    ];
    for (const stmt of checks) {
        if ((await db.execute(stmt)).rows.length > 0) return true;
    }
    return false;
}

/** Clés actuelles → destinations, ou raison de sauter la ligne. */
function planMoves(row: RelocationRow): { keys: string[]; moves: KeyMove[] } | { reason: string } {
    if (!row.ulSegment) return { reason: 'aucune UL' };
    const ulSegment = row.ulSegment;
    if (row.kind === 'expense-staging') {
        let keys: unknown;
        try { keys = JSON.parse(row.current); } catch { return { reason: 'pendingReceiptKeys illisible' }; }
        if (!Array.isArray(keys) || keys.some((k) => typeof k !== 'string')) return { reason: 'pendingReceiptKeys illisible' };
        const moves: KeyMove[] = [];
        for (const key of keys as string[]) {
            const to = relocatedStagingKey(key, ulSegment);
            if (!to) return { reason: `clé hors dépôt de justificatifs : ${key}` };
            if (to !== key) moves.push({ from: key, to });
        }
        return { keys: keys as string[], moves };
    }
    const to = relocatedVehicleKey(row.kind, row.current, ulSegment, row.vehicleName);
    if (!to) return { reason: `clé inattendue : ${row.current}` };
    return { keys: [row.current], moves: to === row.current ? [] : [{ from: row.current, to }] };
}

/**
 * Range une ligne. Sans `apply`, n'écrit rien (lectures seules : existence des
 * sources) et renvoie le plan. Ne lève jamais : une erreur devient `status: 'error'`.
 */
export async function relocateRow(
    row: RelocationRow,
    deps: { db: RelocationDb; store: RelocationStore },
    opts: { apply: boolean; deleteOld: boolean },
): Promise<RelocationResult> {
    const { db, store } = deps;
    try {
        const plan = planMoves(row);
        if ('reason' in plan) return { status: 'skipped', reason: plan.reason };
        const { moves } = plan;
        if (moves.length === 0) return { status: 'unchanged' };

        // Sources présentes ? Une seule absente : ligne sautée, base intacte.
        for (const m of moves) {
            if (!(await store.head(m.from))) {
                return { status: 'skipped', reason: `objet source absent : ${m.from}`, moves };
            }
        }

        const guideMatches = row.kind === 'vehicle-document' && row.guideR2Key === row.current;
        if (!opts.apply) {
            return { status: 'planned', moves, guideRepointed: guideMatches, deleted: opts.deleteOld ? moves.map((m) => m.from) : [], warnings: [] };
        }

        // 1. Copie (une cible déjà présente — passage interrompu — n'est pas réécrite).
        const written: string[] = [];
        for (const m of moves) {
            if (await store.head(m.to)) continue;
            const body = await store.get(m.from);
            if (!body) {
                await cleanup(db, store, written);
                return { status: 'skipped', reason: `objet source absent : ${m.from}`, moves };
            }
            await store.put(m.to, body, contentTypeOfBody(body));
            written.push(m.to);
        }

        // 2. UPDATE gardé sur l'ancienne valeur.
        let updated = false;
        let guideRepointed = false;
        if (row.kind === 'vehicle-photo') {
            const res = await db.execute({
                sql: `UPDATE Vehicle SET photoR2Key = ? WHERE id = ? AND photoR2Key = ?`,
                args: [moves[0].to, row.rowId, row.current],
            });
            updated = res.rowsAffected > 0;
        } else if (row.kind === 'vehicle-document') {
            const [doc, guide] = await db.batch([
                { sql: `UPDATE VehicleDocument SET r2Key = ? WHERE id = ? AND r2Key = ?`, args: [moves[0].to, row.rowId, row.current] },
                {
                    // Seulement si le document vient d'être repointé (même transaction).
                    sql: `UPDATE Vehicle SET guideR2Key = ? WHERE id = ? AND guideR2Key = ?
                          AND EXISTS (SELECT 1 FROM VehicleDocument WHERE id = ? AND r2Key = ?)`,
                    args: [moves[0].to, row.vehicleId ?? null, row.current, row.rowId, moves[0].to],
                },
            ], 'write');
            updated = doc.rowsAffected > 0;
            guideRepointed = guide.rowsAffected > 0;
        } else {
            const keys = (plan.keys).map((k) => moves.find((m) => m.from === k)?.to ?? k);
            const res = await db.execute({
                sql: `UPDATE "ExpenseReport" SET pendingReceiptKeys = ? WHERE id = ? AND status = 'brouillon' AND pendingReceiptKeys = ?`,
                args: [JSON.stringify(keys), row.rowId, row.current],
            });
            updated = res.rowsAffected > 0;
        }

        if (!updated) {
            // Modifiée entre-temps : la copie n'est référencée nulle part.
            await cleanup(db, store, written);
            return { status: 'skipped', reason: 'modifiée entre la lecture et la mise à jour (copie supprimée)', moves };
        }

        // 3. Suppression des anciennes clés, après UPDATE réussi.
        const deleted: string[] = [];
        const warnings: string[] = [];
        if (opts.deleteOld) {
            for (const m of moves) {
                if (await isReferenced(db, m.from)) {
                    warnings.push(`${m.from} encore référencée ailleurs : conservée`);
                    continue;
                }
                try {
                    await store.delete(m.from);
                    deleted.push(m.from);
                } catch (e: unknown) {
                    warnings.push(`suppression de ${m.from} impossible : ${e instanceof Error ? e.message : String(e)}`);
                }
            }
        }
        return { status: 'moved', moves, guideRepointed, deleted, warnings };
    } catch (e: unknown) {
        return { status: 'error', reason: e instanceof Error ? e.message : String(e) };
    }
}

/** Supprime les copies écrites par ce passage, sauf si une autre ligne les référence déjà. */
async function cleanup(db: RelocationDb, store: RelocationStore, written: string[]): Promise<void> {
    for (const key of written) {
        if (await isReferenced(db, key)) continue;
        await store.delete(key).catch(() => undefined);
    }
}

const TABLE_OF: Record<RelocationKind, string> = {
    'vehicle-photo': 'Vehicle.photoR2Key',
    'vehicle-document': 'VehicleDocument.r2Key',
    'expense-staging': 'ExpenseReport.pendingReceiptKeys',
};

export interface RelocationStats {
    moved: number;
    planned: number;
    unchanged: number;
    skipped: number;
    failed: number;
    deleted: number;
}

export type RelocationExitCode = 0 | 1 | 2;

/** 1 si au moins un échec, sinon 2 si au moins une ligne sautée, sinon 0. */
export function relocationExitCode(stats: Pick<RelocationStats, 'failed' | 'skipped'>): RelocationExitCode {
    if (stats.failed > 0) return 1;
    return stats.skipped > 0 ? 2 : 0;
}

export interface RelocationRun {
    stats: RelocationStats;
    failures: string[];
    skipped: string[];
    journal: RelocationJournalEntry[];
    exitCode: RelocationExitCode;
}

/** Lit les lignes, range chacune, journalise le plan et le bilan ; n'écrit rien sans `apply`. */
export async function runR2Relocation(opts: {
    db: RelocationDb;
    store: RelocationStore;
    apply: boolean;
    deleteOld: boolean;
    log: RelocationLogger;
    /** Appelé pour chaque ligne repointée, AU FIL de l'exécution (journal persistant). */
    onJournal?: (entry: RelocationJournalEntry) => void;
}): Promise<RelocationRun> {
    const { db, store, apply, deleteOld, log } = opts;
    const stats: RelocationStats = { moved: 0, planned: 0, unchanged: 0, skipped: 0, failed: 0, deleted: 0 };
    const failures: string[] = [];
    const skipped: string[] = [];
    const journal: RelocationJournalEntry[] = [];

    const rows = await readRelocationRows(db);
    log.info(`${rows.length} ligne(s) référençant des objets R2 à ranger.\n`);

    for (const row of rows) {
        const label = `${KIND_LABELS[row.kind]} — ${row.label}`;
        const result = await relocateRow(row, { db, store }, { apply, deleteOld });
        switch (result.status) {
            case 'unchanged':
                stats.unchanged++;
                break;
            case 'planned':
            case 'moved': {
                stats[result.status]++;
                stats.deleted += apply ? result.deleted.length : 0;
                log.info(`  ${apply ? '✓' : '→'} ${label}${result.guideRepointed ? ' (+ guide du véhicule)' : ''}`);
                for (const m of result.moves) log.info(`      ${m.from} → ${m.to}`);
                for (const d of result.deleted) log.info(`      ${apply ? 'supprimé' : 'à supprimer si plus référencée'} : ${d}`);
                for (const w of result.warnings) log.warn(`      ! ${w}`);
                if (apply && result.warnings.some((w) => w.startsWith('suppression'))) {
                    stats.failed++;
                    failures.push(`${label} : ancienne clé non supprimée`);
                }
                if (apply) {
                    const entry: RelocationJournalEntry = {
                        kind: row.kind, table: TABLE_OF[row.kind], rowId: row.rowId,
                        moves: result.moves, guideRepointed: result.guideRepointed, deleted: result.deleted,
                    };
                    journal.push(entry);
                    opts.onJournal?.(entry);
                }
                break;
            }
            case 'skipped':
                stats.skipped++;
                skipped.push(`${label} : ${result.reason}`);
                log.warn(`  ! ${label} sautée : ${result.reason}`);
                for (const m of result.moves ?? []) log.warn(`      ${m.from} → ${m.to}`);
                break;
            case 'error':
                stats.failed++;
                failures.push(`${label} : ${result.reason}`);
                log.error(`  ✗ ${label} : ${result.reason}`);
                break;
        }
    }

    for (const g of await readOrphanGuides(db)) {
        stats.skipped++;
        const msg = `Guide du véhicule ${g.vehicleId} (${g.key}) sans document correspondant : lancer d'abord scripts/add-vehicle-documents.ts`;
        skipped.push(msg);
        log.warn(`  ! ${msg}`);
    }

    log.info(
        `\n${apply ? `Rangées ${stats.moved}` : `À ranger ${stats.planned}`} · déjà rangées ${stats.unchanged}` +
        ` · sautées ${stats.skipped} · échecs ${stats.failed}${deleteOld && apply ? ` · anciennes clés supprimées ${stats.deleted}` : ''}`,
    );
    if (skipped.length) {
        log.warn('\nLignes sautées (base intacte) :');
        for (const s of skipped) log.warn(`  - ${s}`);
    }
    if (failures.length) {
        log.error('\nÉchecs :');
        for (const f of failures) log.error(`  - ${f}`);
    }
    return { stats, failures, skipped, journal, exitCode: relocationExitCode(stats) };
}
