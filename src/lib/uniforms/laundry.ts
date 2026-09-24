import { db } from '@/lib/db';
import { UniformError } from './errors';
import type { UniformActor } from './loans';

export interface LaundryPiece {
    loanId: string;
    itemName: string;
    sizeLabel: string;
    returnedAt: string;
    returnComment: string | null;
}

/**
 * Pièces rendues sales, pas encore lavées, des articles de `ulId`.
 *
 * Le nom de l'emprunteur n'est PAS renvoyé : la liste est ouverte à tout compte
 * actif, et via le QR à des bénévoles d'autres UL. Le commentaire de rendu
 * suffit à savoir quoi faire de la pièce.
 */
export async function listLaundry(ulId: string): Promise<LaundryPiece[]> {
    const res = await db.execute({
        sql: `SELECT l.id AS loanId, i.name AS itemName, s.label AS sizeLabel,
                     l.returnedAt, l.returnComment
                FROM "UniformLoan" l
                JOIN "UniformSize" s ON s.id = l.sizeId
                JOIN "UniformItem" i ON i.id = s.itemId
               WHERE i.ulId = ?
                 AND l.returnedAt IS NOT NULL AND l.returnedClean = 0 AND l.washedAt IS NULL
               ORDER BY l.returnedAt ASC, l.id`,
        args: [ulId],
    });
    return res.rows.map(row => ({
        loanId: String(row.loanId),
        itemName: String(row.itemName),
        sizeLabel: String(row.sizeLabel),
        returnedAt: String(row.returnedAt),
        returnComment: (row.returnComment as string | null) ?? null,
    }));
}

/**
 * Marque lavée une pièce rendue sale : elle redevient disponible. Trace qui et
 * quand. Le périmètre `ulId` est dans l'UPDATE : une pièce d'une autre UL
 * répond 404 comme une pièce inconnue.
 *
 * @throws UniformError 404 (inconnue ou hors UL), 409 (déjà lavée ou pas à laver).
 */
export async function markWashed(loanId: string, ulId: string, washer: UniformActor): Promise<void> {
    const res = await db.execute({
        sql: `UPDATE "UniformLoan"
                 SET washedAt = ?, washedBy = ?, washedByName = ?
               WHERE id = ?
                 AND returnedAt IS NOT NULL AND returnedClean = 0 AND washedAt IS NULL
                 AND sizeId IN (SELECT s.id FROM "UniformSize" s JOIN "UniformItem" i ON i.id = s.itemId WHERE i.ulId = ?)`,
        args: [new Date().toISOString(), washer.id, washer.name ?? washer.email, loanId, ulId],
    });
    if (res.rowsAffected > 0) return;

    const check = await db.execute({
        sql: `SELECT l.washedAt FROM "UniformLoan" l
                JOIN "UniformSize" s ON s.id = l.sizeId
                JOIN "UniformItem" i ON i.id = s.itemId
               WHERE l.id = ? AND i.ulId = ?`,
        args: [loanId, ulId],
    });
    if (check.rows.length === 0) throw new UniformError(404, 'Pièce introuvable');
    if (check.rows[0].washedAt !== null) throw new UniformError(409, 'Cette pièce a déjà été marquée lavée');
    throw new UniformError(409, 'Cette pièce n\'est pas à laver');
}
