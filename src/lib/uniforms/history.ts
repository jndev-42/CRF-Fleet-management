import { db } from '@/lib/db';
import { HISTORY_PAGE_SIZE } from './constants';

export const HISTORY_TYPES = ['all', 'loan', 'return', 'wash'] as const;
export type HistoryTypeFilter = (typeof HISTORY_TYPES)[number];
export type HistoryEventType = Exclude<HistoryTypeFilter, 'all'>;

export interface HistoryPiece {
    loanId: string;
    itemName: string;
    sizeLabel: string;
}

/**
 * Un mouvement du journal. `at` est l'instant de l'événement ; `key` est son
 * identifiant stable (`loan:<lot>`, `return:<lot>:<instant>:<premier prêt>`, `wash:<prêt>`).
 */
export interface HistoryEvent {
    key: string;
    type: HistoryEventType;
    at: string;
    batchId: string;
    borrowerName: string | null;
    borrowerEmail: string | null;
    /** Emprunt uniquement : `app` ou `qr`. */
    source: 'app' | 'qr' | null;
    /** Rendu uniquement : état de la pièce et commentaire. */
    returnedClean: boolean | null;
    returnComment: string | null;
    /** Lavage uniquement. */
    washedByName: string | null;
    pieces: HistoryPiece[];
}

export interface HistoryPage {
    events: HistoryEvent[];
    nextCursor: string | null;
    hasMore: boolean;
}

export interface HistoryQuery {
    type?: HistoryTypeFilter;
    q?: string;
    cursor?: string | null;
    limit?: number;
}

interface Cursor {
    at: string;
    key: string;
}

export function encodeCursor(c: Cursor): string {
    return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
}

/** `null` si le curseur est illisible ou mal formé. */
export function decodeCursor(raw: string): Cursor | null {
    try {
        const v: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
        if (v && typeof v === 'object') {
            const { at, key } = v as Record<string, unknown>;
            if (typeof at === 'string' && typeof key === 'string' && at !== '' && key !== '') return { at, key };
        }
    } catch {
        // curseur invalide : traité comme tel par l'appelant
    }
    return null;
}

/** Échappe `%`, `_` et `\` pour un `LIKE ... ESCAPE '\'`. */
function likePattern(q: string): string {
    return `%${q.replace(/[\\%_]/g, c => `\\${c}`)}%`;
}

function parsePieces(raw: unknown): HistoryPiece[] {
    try {
        const arr: unknown = JSON.parse(String(raw));
        if (!Array.isArray(arr)) return [];
        return arr.map(p => ({
            loanId: String(p.loanId),
            itemName: String(p.itemName),
            sizeLabel: String(p.sizeLabel),
        }));
    } catch {
        return [];
    }
}

const PIECES_JSON = `json_group_array(json_object('loanId', loanId, 'itemName', itemName, 'sizeLabel', sizeLabel))`;

const MATCH_SQL = `(COALESCE(b.borrowerName, '') LIKE ? ESCAPE '\\' OR COALESCE(b.borrowerEmail, '') LIKE ? ESCAPE '\\'
                    OR i.name LIKE ? ESCAPE '\\' OR s.label LIKE ? ESCAPE '\\')`;
const MATCH_ARGS = 4;

/**
 * Journal chronologique (le plus récent d'abord) des emprunts, rendus et
 * lavages des pièces de `ulId`, QUELLE QUE SOIT l'UL de l'emprunteur. Les
 * articles et tailles archivés restent inclus.
 *
 * Vue calculée à partir des colonnes existantes, sans table d'événements :
 *  - emprunt : un par lot (`UniformLoanBatch.createdAt`) ;
 *  - rendu : une pièce, ou les pièces d'un même « Tout rendre » (même lot, même
 *    `returnedAt`, même état et même commentaire ; la clé ajoute le plus petit
 *    identifiant de prêt du groupe, unique même si deux groupes partagent lot et instant) ;
 *  - lavage : un par pièce lavée.
 *
 * Pagination keyset sur `(at DESC, key DESC)`. La recherche porte sur
 * l'emprunteur (nom, e-mail), l'article, la taille et, pour les lavages, la
 * personne qui a lavé ; un emprunt ou un rendu qui correspond garde toutes ses pièces.
 */
export async function listUlHistory(ulId: string, query: HistoryQuery = {}): Promise<HistoryPage> {
    const limit = query.limit ?? HISTORY_PAGE_SIZE;
    const type = query.type ?? 'all';
    const q = query.q?.trim() ?? '';
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;

    const pattern = likePattern(q);
    // Les paramètres suivent l'ordre d'apparition des `?` dans la requête.
    const matchArgs: string[] = q ? Array(MATCH_ARGS).fill(pattern) : [];
    const washArgs: string[] = q ? [...matchArgs, pattern] : [];
    const matchSql = q ? MATCH_SQL : '1';
    const washMatchSql = q ? `(${MATCH_SQL} OR COALESCE(l.washedByName, '') LIKE ? ESCAPE '\\')` : '1';

    const where: string[] = [];
    const whereArgs: (string | number)[] = [];
    if (type !== 'all') { where.push('type = ?'); whereArgs.push(type); }
    if (q) where.push('m = 1');
    if (cursor) {
        where.push('(at < ? OR (at = ? AND key < ?))');
        whereArgs.push(cursor.at, cursor.at, cursor.key);
    }

    const res = await db.execute({
        sql: `WITH piece AS (
                SELECT l.id AS loanId, l.batchId, b.createdAt AS batchAt, b.borrowerName, b.borrowerEmail, b.source,
                       i.name AS itemName, s.label AS sizeLabel,
                       l.returnedAt, l.returnedClean, l.returnComment, l.washedAt, l.washedByName,
                       CASE WHEN ${matchSql} THEN 1 ELSE 0 END AS m,
                       CASE WHEN ${washMatchSql} THEN 1 ELSE 0 END AS wm
                  FROM "UniformLoan" l
                  JOIN "UniformLoanBatch" b ON b.id = l.batchId
                  JOIN "UniformSize" s ON s.id = l.sizeId
                  JOIN "UniformItem" i ON i.id = s.itemId
                 WHERE i.ulId = ?
              ),
              ev AS (
                SELECT 'loan' AS type, batchAt AS at, 'loan:' || batchId AS key, batchId,
                       borrowerName, borrowerEmail, source,
                       NULL AS returnedClean, NULL AS returnComment, NULL AS washedByName,
                       ${PIECES_JSON} AS pieces, MAX(m) AS m
                  FROM piece GROUP BY batchId
                UNION ALL
                SELECT 'return', returnedAt, 'return:' || batchId || ':' || returnedAt || ':' || MIN(loanId), batchId,
                       borrowerName, borrowerEmail, NULL,
                       returnedClean, returnComment, NULL,
                       ${PIECES_JSON}, MAX(m)
                  FROM piece WHERE returnedAt IS NOT NULL
                  GROUP BY batchId, returnedAt, returnedClean, returnComment
                UNION ALL
                SELECT 'wash', washedAt, 'wash:' || loanId, batchId,
                       borrowerName, borrowerEmail, NULL,
                       NULL, NULL, washedByName,
                       ${PIECES_JSON}, MAX(wm)
                  FROM piece WHERE washedAt IS NOT NULL
                  GROUP BY loanId
              )
              SELECT * FROM ev
               ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
               ORDER BY at DESC, key DESC
               LIMIT ?`,
        args: [...matchArgs, ...washArgs, ulId, ...whereArgs, limit + 1],
    });

    const hasMore = res.rows.length > limit;
    const events: HistoryEvent[] = res.rows.slice(0, limit).map(row => ({
        key: String(row.key),
        type: String(row.type) as HistoryEventType,
        at: String(row.at),
        batchId: String(row.batchId),
        borrowerName: (row.borrowerName as string | null) ?? null,
        borrowerEmail: (row.borrowerEmail as string | null) ?? null,
        source: row.source === 'qr' ? 'qr' : row.source === 'app' ? 'app' : null,
        returnedClean: row.returnedClean === null || row.returnedClean === undefined ? null : Number(row.returnedClean) === 1,
        returnComment: (row.returnComment as string | null) ?? null,
        washedByName: (row.washedByName as string | null) ?? null,
        pieces: parsePieces(row.pieces),
    }));
    const last = events[events.length - 1];
    return {
        events,
        hasMore,
        nextCursor: hasMore && last ? encodeCursor({ at: last.at, key: last.key }) : null,
    };
}
