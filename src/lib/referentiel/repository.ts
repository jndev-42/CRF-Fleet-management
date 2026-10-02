import { db } from '@/lib/db';

/** Pages indexées par appel à `process` : assez peu pour rester sous `maxDuration`. */
export const PAGES_PER_BATCH = 80;

/** Durée de validité des URL signées : dépôt (15 min) et lecture (1 h). */
export const UPLOAD_URL_TTL_SEC = 15 * 60;
export const READ_URL_TTL_SEC = 60 * 60;

export interface ReadyReferentiel {
    id: string;
    fileName: string;
    r2Key: string;
    pageCount: number;
    readyAt: string | null;
}

/** Le référentiel actif (il n'y en a qu'un `ready`), ou `null`. */
export async function getReadyReferentiel(): Promise<ReadyReferentiel | null> {
    const res = await db.execute(
        `SELECT id, fileName, r2Key, pageCount, readyAt FROM Referentiel
          WHERE status = 'ready' ORDER BY readyAt DESC LIMIT 1`,
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
        id: String(row.id),
        fileName: String(row.fileName),
        r2Key: String(row.r2Key),
        pageCount: Number(row.pageCount ?? 0),
        readyAt: row.readyAt == null ? null : String(row.readyAt),
    };
}
