import { db } from '@/lib/db';
import { UniformError } from './errors';

/**
 * Une pièce est INDISPONIBLE tant qu'elle n'est pas rendue, ou qu'elle a été
 * rendue sale et n'a pas encore été marquée lavée.
 *
 * Le disponible n'est jamais stocké : il se dérive de `UniformSize.quantity`
 * (le parc possédé) moins ces pièces. Un compteur tenu à part divergerait des
 * lignes d'emprunt au premier incident ; ici l'admin peut corriger le parc sans
 * toucher aux emprunts. Fragment partagé par toutes les requêtes du module —
 * la même règle ne doit pas être réécrite deux fois.
 */
export const UNAVAILABLE_LOAN_SQL = `(l.returnedAt IS NULL OR (l.returnedClean = 0 AND l.washedAt IS NULL))`;

export interface UniformSizeView {
    id: string;
    label: string;
    quantity: number;
    /** Borné à 0 : un parc réduit sous le nombre de pièces sorties n'affiche pas de négatif. */
    available: number;
}

export interface UniformItemView {
    id: string;
    name: string;
    sizes: UniformSizeView[];
}

export const MAX_NAME_LENGTH = 100;
export const MAX_LABEL_LENGTH = 30;
export const MAX_QUANTITY = 10_000;

/**
 * Catalogue d'une UL : articles et tailles non archivés, avec leur disponible.
 * Un article sans taille est renvoyé (l'onglet Gestion en a besoin) ; c'est
 * à l'écran d'emprunt de l'écarter.
 */
export async function listCatalog(ulId: string): Promise<UniformItemView[]> {
    const res = await db.execute({
        sql: `SELECT i.id AS itemId, i.name AS itemName,
                     s.id AS sizeId, s.label AS sizeLabel, s.quantity AS quantity,
                     (SELECT COUNT(*) FROM "UniformLoan" l WHERE l.sizeId = s.id AND ${UNAVAILABLE_LOAN_SQL}) AS unavailable
                FROM "UniformItem" i
                LEFT JOIN "UniformSize" s ON s.itemId = i.id AND s.archivedAt IS NULL
               WHERE i.ulId = ? AND i.archivedAt IS NULL
               ORDER BY i.name COLLATE NOCASE ASC, i.id ASC, s.createdAt ASC, s.rowid ASC`,
        args: [ulId],
    });

    const items: UniformItemView[] = [];
    const byId = new Map<string, UniformItemView>();
    for (const row of res.rows) {
        const itemId = String(row.itemId);
        let item = byId.get(itemId);
        if (!item) {
            item = { id: itemId, name: String(row.itemName), sizes: [] };
            byId.set(itemId, item);
            items.push(item);
        }
        if (row.sizeId !== null && row.sizeId !== undefined) {
            const quantity = Number(row.quantity);
            item.sizes.push({
                id: String(row.sizeId),
                label: String(row.sizeLabel),
                quantity,
                available: Math.max(0, quantity - Number(row.unavailable)),
            });
        }
    }
    return items;
}

// ── Gestion du catalogue ──────────────────────────────────────────────────────

export interface UniformItemRef {
    id: string;
    ulId: string;
    archived: boolean;
}

export interface UniformSizeRef {
    id: string;
    itemId: string;
    ulId: string;
    /** Vrai si la taille OU son article est archivé. */
    archived: boolean;
}

/** Article, archivé ou non — l'appelant décide du 404 et du cloisonnement d'UL. */
export async function getItemRef(itemId: string): Promise<UniformItemRef | null> {
    const res = await db.execute({
        sql: `SELECT id, ulId, archivedAt FROM "UniformItem" WHERE id = ?`,
        args: [itemId],
    });
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return { id: String(row.id), ulId: String(row.ulId), archived: row.archivedAt !== null };
}

/** Taille rattachée à `itemId`, archivée ou non. */
export async function getSizeRef(itemId: string, sizeId: string): Promise<UniformSizeRef | null> {
    const res = await db.execute({
        sql: `SELECT s.id, s.itemId, s.archivedAt, i.ulId, i.archivedAt AS itemArchivedAt
                FROM "UniformSize" s JOIN "UniformItem" i ON i.id = s.itemId
               WHERE s.id = ? AND s.itemId = ?`,
        args: [sizeId, itemId],
    });
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
        id: String(row.id),
        itemId: String(row.itemId),
        ulId: String(row.ulId),
        archived: row.archivedAt !== null || row.itemArchivedAt !== null,
    };
}

async function assertItemNameFree(ulId: string, name: string, exceptId: string | null): Promise<void> {
    const res = await db.execute({
        sql: `SELECT id FROM "UniformItem"
               WHERE ulId = ? AND archivedAt IS NULL AND name = ? COLLATE NOCASE AND id != ?`,
        args: [ulId, name, exceptId ?? ''],
    });
    if (res.rows.length > 0) {
        throw new UniformError(409, `Un article « ${name} » existe déjà`);
    }
}

async function assertSizeLabelFree(itemId: string, label: string, exceptId: string | null): Promise<void> {
    const res = await db.execute({
        sql: `SELECT id FROM "UniformSize"
               WHERE itemId = ? AND archivedAt IS NULL AND label = ? COLLATE NOCASE AND id != ?`,
        args: [itemId, label, exceptId ?? ''],
    });
    if (res.rows.length > 0) {
        throw new UniformError(409, `La taille « ${label} » existe déjà pour cet article`);
    }
}

/** Crée un article et ses tailles initiales dans l'UL, en une seule écriture groupée. */
export async function createItem(
    ulId: string,
    name: string,
    sizes: { label: string; quantity: number }[],
): Promise<{ id: string }> {
    await assertItemNameFree(ulId, name, null);

    const labels = new Set<string>();
    for (const size of sizes) {
        const key = size.label.toLowerCase();
        if (labels.has(key)) {
            throw new UniformError(400, `La taille « ${size.label} » est saisie deux fois`);
        }
        labels.add(key);
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.batch([
        {
            sql: `INSERT INTO "UniformItem" (id, ulId, name, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)`,
            args: [id, ulId, name, now, now],
        },
        ...sizes.map(size => ({
            sql: `INSERT INTO "UniformSize" (id, itemId, label, quantity, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`,
            args: [crypto.randomUUID(), id, size.label, size.quantity, now, now],
        })),
    ], 'write');
    return { id };
}

export async function renameItem(itemId: string, ulId: string, name: string): Promise<void> {
    await assertItemNameFree(ulId, name, itemId);
    await db.execute({
        sql: `UPDATE "UniformItem" SET name = ?, updatedAt = ? WHERE id = ?`,
        args: [name, new Date().toISOString(), itemId],
    });
}

export async function addSize(itemId: string, label: string, quantity: number): Promise<{ id: string }> {
    await assertSizeLabelFree(itemId, label, null);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.execute({
        sql: `INSERT INTO "UniformSize" (id, itemId, label, quantity, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [id, itemId, label, quantity, now, now],
    });
    return { id };
}

export async function updateSize(
    itemId: string,
    sizeId: string,
    patch: { label?: string; quantity?: number },
): Promise<void> {
    if (patch.label !== undefined) {
        await assertSizeLabelFree(itemId, patch.label, sizeId);
    }
    const sets: string[] = [];
    const args: (string | number)[] = [];
    if (patch.label !== undefined) { sets.push('label = ?'); args.push(patch.label); }
    if (patch.quantity !== undefined) { sets.push('quantity = ?'); args.push(patch.quantity); }
    sets.push('updatedAt = ?');
    args.push(new Date().toISOString());
    await db.execute({
        sql: `UPDATE "UniformSize" SET ${sets.join(', ')} WHERE id = ?`,
        args: [...args, sizeId],
    });
}

/**
 * Archive un article ou une taille. Refusé tant qu'une pièce concernée n'est
 * pas rendue : l'emprunteur perdrait la ligne de son bandeau, et l'onglet
 * Emprunts afficherait une pièce sortie d'un article introuvable au catalogue.
 * Une pièce rendue sale non lavée n'empêche PAS l'archivage : elle est rendue.
 *
 * Contrôle et écriture dans la même transaction : un emprunt validé entre les
 * deux passerait sinon.
 */
async function archiveWhereNoOpenLoan(
    sizeFilterSql: string,
    targetId: string,
    updateSql: string,
): Promise<void> {
    const tx = await db.transaction('write');
    try {
        const open = await tx.execute({
            sql: `SELECT COUNT(*) AS c FROM "UniformLoan" l
                   WHERE l.returnedAt IS NULL AND l.sizeId IN (${sizeFilterSql})`,
            args: [targetId],
        });
        if (Number(open.rows[0].c) > 0) {
            await tx.rollback();
            throw new UniformError(409, 'Des pièces sont encore empruntées : impossible de retirer tant qu\'elles ne sont pas rendues');
        }
        await tx.execute({ sql: updateSql, args: [new Date().toISOString(), targetId] });
        await tx.commit();
    } catch (e) {
        try { await tx.rollback(); } catch { /* transaction déjà close */ }
        throw e;
    }
}

export async function archiveItem(itemId: string): Promise<void> {
    await archiveWhereNoOpenLoan(
        `SELECT id FROM "UniformSize" WHERE itemId = ?`,
        itemId,
        `UPDATE "UniformItem" SET archivedAt = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
    );
}

export async function archiveSize(sizeId: string): Promise<void> {
    await archiveWhereNoOpenLoan(
        `SELECT ?`,
        sizeId,
        `UPDATE "UniformSize" SET archivedAt = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
    );
}
