/**
 * Médias côté serveur : segment UL, liste et suppression d'un dossier R2 (préfixe,
 * voir `refs.ts`), et liaison d'une référence à son enregistrement. Une référence
 * qui n'est pas une référence R2 (id Drive résiduel, `mock-…`) ne désigne aucun
 * fichier : rien à lister ni à supprimer.
 */

import { db } from '@/lib/db';
import { getErrorMessage } from '@/lib/utils/error';
import {
    displayNameOfKey,
    isR2Ref,
    mimeTypeOfKey,
    parseMediaFolderRef,
    toMediaUlSegment,
    validateMediaKey,
    type MediaType,
} from '@/lib/media/refs';

/** Segment UL des clés R2 (`expenseUlSegment`, caractères initiaux non sûrs retirés). */
export async function ulSegmentOf(ulId: string): Promise<string> {
    const { expenseUlSegment } = await import('@/lib/r2');
    const res = await db.execute({ sql: `SELECT slug FROM "UniteLocale" WHERE id = ?`, args: [ulId] });
    return toMediaUlSegment(expenseUlSegment(res.rows[0]?.slug, ulId));
}

export interface MediaFileEntry {
    id: string;
    name: string;
    mimeType: string;
}

/** Fichiers valides d'un dossier R2 (clés triées), avec nom affichable et type MIME. */
export async function listMediaFiles(folderRef: string): Promise<(MediaFileEntry & { stage: string | null })[]> {
    const { listObjects } = await import('@/lib/r2');
    const keys = (await listObjects(`${folderRef}/`)).sort();
    return keys.flatMap((key) => {
        const parsed = validateMediaKey(key);
        if (!parsed || parsed.folderRef !== folderRef) return [];
        return [{ id: key, name: displayNameOfKey(key), mimeType: mimeTypeOfKey(key), stage: parsed.stage }];
    });
}

/** Colonnes qui portent une référence média (préfixe ou clé R2). */
export const MEDIA_REF_COLUMNS = [
    { table: 'Trip', column: 'driveFolderId' },
    { table: 'IncidentReport', column: 'driveFolderId' },
    { table: 'ExpenseReport', column: 'driveFolderId' },
    { table: 'mission_reports', column: 'drive_folder_id' },
    { table: 'mission_reports', column: 'signed_report_drive_id' },
] as const;

export type MediaRefTable = (typeof MEDIA_REF_COLUMNS)[number]['table'];

/** Lignes à ignorer : l'enregistrement lui-même, ou ceux qu'on supprime. */
export interface MediaRefExclusion {
    table: MediaRefTable;
    rowIds: string[];
}

/** La référence est-elle portée par un enregistrement (hors exclusions) ? */
export async function isMediaRefReferenced(ref: string, exclude: MediaRefExclusion[] = []): Promise<boolean> {
    for (const { table, column } of MEDIA_REF_COLUMNS) {
        const ids = exclude.filter((e) => e.table === table).flatMap((e) => e.rowIds);
        const notIn = ids.length ? ` AND id NOT IN (${ids.map(() => '?').join(', ')})` : '';
        const res = await db.execute({
            sql: `SELECT 1 FROM "${table}" WHERE ${column} = ?${notIn} LIMIT 1`,
            args: [ref, ...ids],
        });
        if (res.rows.length > 0) return true;
    }
    return false;
}

/**
 * Supprime un dossier média : préfixe R2 COMPLET (tous ses objets). Une référence
 * non R2 (id Drive résiduel) ne désigne aucun fichier : rien à faire. Ne lève
 * jamais : un échec, ou une référence R2 qui n'est pas un dossier complet, est
 * journalisé (la suppression métier est maintenue, un orphelin est inoffensif).
 * Renvoie `true` si le nettoyage a réussi.
 */
export async function deleteMediaFolder(ref: string | null | undefined): Promise<boolean> {
    if (!ref || !isR2Ref(ref)) return true;
    try {
        if (!parseMediaFolderRef(ref)) {
            console.error(`[media] suppression refusée : ${ref} n'est pas un dossier média complet`);
            return false;
        }
        const { deletePrefix } = await import('@/lib/r2');
        await deletePrefix(ref);
        return true;
    } catch (e: unknown) {
        console.error(`[media] suppression du dossier ${ref} impossible :`, getErrorMessage(e));
        return false;
    }
}

/**
 * Supprime un fichier média : clé R2 (rapport signé). Une référence non R2 ne
 * désigne aucun fichier : rien à faire. Ne lève jamais.
 */
export async function deleteMediaFile(ref: string | null | undefined): Promise<boolean> {
    if (!ref || !isR2Ref(ref)) return true;
    try {
        const { deleteMediaKey } = await import('@/lib/r2');
        await deleteMediaKey(ref);
        return true;
    } catch (e: unknown) {
        console.error(`[media] suppression du fichier ${ref} impossible :`, getErrorMessage(e));
        return false;
    }
}

/**
 * Supprime les fichiers d'une référence (dossier ou fichier), en best-effort,
 * seulement si AUCUN autre enregistrement ne la référence (hors `exclude`).
 * À appeler APRÈS la suppression de l'enregistrement, ou en l'excluant.
 */
export async function deleteMediaRefIfUnshared(
    ref: string | null | undefined,
    kind: 'folder' | 'file',
    exclude: MediaRefExclusion[] = [],
): Promise<boolean> {
    if (!ref) return true;
    try {
        if (await isMediaRefReferenced(ref, exclude)) return true;
    } catch (e: unknown) {
        console.error(`[media] vérification du partage de ${ref} impossible, fichiers conservés :`, getErrorMessage(e));
        return false;
    }
    return kind === 'file' ? deleteMediaFile(ref) : deleteMediaFolder(ref);
}

/**
 * Une référence peut-elle être écrite sur cet enregistrement ?
 *   - référence non R2 (id Drive résiduel) : seulement si elle n'est pas déjà portée par un
 *     AUTRE enregistrement (elle ne désigne aucun fichier) ;
 *   - référence R2 : du bon type et de la bonne forme (dossier, ou clé pour le rapport
 *     signé), segment UL égal à celui d'une des UL de l'enregistrement, et portée par
 *     aucun AUTRE enregistrement.
 * Renvoie `null` si elle est acceptable, sinon le message du 400.
 */
export async function assertRefBindable(
    ref: string | null | undefined,
    opts: { type: MediaType; kind?: 'folder' | 'file'; table: MediaRefTable; rowId: string | null; ulIds: (string | null | undefined)[] },
): Promise<string | null> {
    if (!ref) return null;
    const exclude: MediaRefExclusion[] = opts.rowId ? [{ table: opts.table, rowIds: [opts.rowId] }] : [];
    if (isR2Ref(ref)) {
        const parsed = opts.kind === 'file'
            ? (() => { const k = validateMediaKey(ref); return k ? { type: k.type, ulSegment: k.folderRef.split('/')[1] } : null; })()
            : parseMediaFolderRef(ref);
        if (!parsed || parsed.type !== opts.type) return 'Référence de fichiers invalide.';
        const ulIds = [...new Set(opts.ulIds.filter((u): u is string => !!u && u !== 'default'))];
        const segments = await Promise.all(ulIds.map((u) => ulSegmentOf(u)));
        if (!segments.includes(parsed.ulSegment)) return "Ces fichiers n'appartiennent pas à l'unité locale de cet enregistrement.";
    }
    if (await isMediaRefReferenced(ref, exclude)) return 'Ces fichiers sont déjà rattachés à un autre enregistrement.';
    return null;
}

/** UL de rattachement d'un utilisateur (`UserUL`, `is_home` d'abord), ou `null`. */
export async function homeUlOf(userId: string | null | undefined): Promise<string | null> {
    if (!userId) return null;
    const res = await db.execute({
        sql: `SELECT ulId FROM "UserUL" WHERE userId = ? ORDER BY is_home DESC, ulId LIMIT 1`,
        args: [userId],
    });
    return (res.rows[0]?.ulId as string | undefined) ?? null;
}

/** L'utilisateur est-il membre de l'UL (`UserUL`) ? */
export async function isUlMember(userId: string | null | undefined, ulId: string): Promise<boolean> {
    if (!userId) return false;
    const res = await db.execute({ sql: `SELECT 1 FROM "UserUL" WHERE userId = ? AND ulId = ? LIMIT 1`, args: [userId, ulId] });
    return res.rows.length > 0;
}
