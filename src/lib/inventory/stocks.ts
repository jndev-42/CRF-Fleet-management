import { db } from '@/lib/db';
import type { InStatement } from '@libsql/client';

/**
 * Projection publique d'un stock. `qrToken` en est DÉLIBÉRÉMENT absent : la
 * colonne est un secret — quiconque la détient peut ajuster le stock sans
 * aucun contrôle de rôle ni d'UL. La diffuser à chaque chargement de la page
 * Inventaire reviendrait à donner le QR à toute l'UL en permanence. D'où
 * l'absence de `SELECT *` sur cette table partout où la ligne est renvoyée
 * au client.
 */
export interface InvStockListRow {
    id: string;
    name: string;
    ulId: string;
    isDefault: number;
    createdAt: string;
    updatedAt: string;
}

export async function ensureStockTableExists(): Promise<void> {
    await db.execute(`
        CREATE TABLE IF NOT EXISTS "InvStockList" (
            "id"        TEXT NOT NULL PRIMARY KEY,
            "name"      TEXT NOT NULL,
            "ulId"      TEXT NOT NULL DEFAULT 'default',
            "isDefault" INTEGER NOT NULL DEFAULT 0,
            "qrToken"   TEXT,
            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Ensure stockId column exists on InvItem
    const invItemCols = await db.execute(`PRAGMA table_info("InvItem")`);
    if (invItemCols?.rows && !invItemCols.rows.some((r: Record<string, unknown>) => r.name === 'stockId')) {
        try {
            await db.execute(`ALTER TABLE "InvItem" ADD COLUMN "stockId" TEXT REFERENCES "InvStockList"("id") ON DELETE CASCADE`);
        } catch (e) {
            console.error('Column stockId might already exist:', e);
        }
    }

    // Colonne qrToken : gardée par son propre PRAGMA (base déjà créée sans elle).
    const stockListCols = await db.execute(`PRAGMA table_info("InvStockList")`);
    if (stockListCols?.rows && !stockListCols.rows.some((r: Record<string, unknown>) => r.name === 'qrToken')) {
        try {
            await db.execute(`ALTER TABLE "InvStockList" ADD COLUMN "qrToken" TEXT`);
        } catch (e) {
            console.error('Column qrToken might already exist:', e);
        }
    }

    // Index : garde SÉPARÉE, sur PRAGMA index_list. Elle couvre d'un seul tenant
    // la base neuve (colonne créée par le CREATE TABLE ci-dessus, donc jamais
    // entrée dans la garde de colonne) et la base migrée. Émettre le CREATE INDEX
    // hors garde le ferait payer au chemin chaud de GET /api/inventory à CHAQUE
    // requête : cette fonction est appelée depuis getOrCreateDefaultStock.
    const stockListIdx = await db.execute(`PRAGMA index_list("InvStockList")`);
    if (stockListIdx?.rows && !stockListIdx.rows.some((r: Record<string, unknown>) => r.name === 'InvStockList_qrToken_key')) {
        try {
            await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS "InvStockList_qrToken_key" ON "InvStockList"("qrToken") WHERE "qrToken" IS NOT NULL`);
        } catch (e) {
            console.error('Index InvStockList_qrToken_key:', e);
        }
    }
}

export async function getOrCreateDefaultStock(ulId: string): Promise<InvStockListRow> {
    await ensureStockTableExists();

    const existingStocks = await db.execute({
        sql: `SELECT id, name, ulId, isDefault, createdAt, updatedAt FROM "InvStockList" WHERE ulId = ? ORDER BY isDefault DESC, createdAt ASC`,
        args: [ulId],
    });

    let defaultStock: InvStockListRow;

    if (!existingStocks?.rows || existingStocks.rows.length === 0) {
        const id = crypto.randomUUID();
        const name = 'Stock Principal';
        await db.execute({
            sql: `INSERT INTO "InvStockList" (id, name, ulId, isDefault) VALUES (?, ?, ?, 1)`,
            args: [id, name, ulId],
        });

        const createdRes = await db.execute({
            sql: `SELECT id, name, ulId, isDefault, createdAt, updatedAt FROM "InvStockList" WHERE id = ?`,
            args: [id],
        });
        defaultStock = (createdRes?.rows?.[0] as unknown as InvStockListRow) || {
            id,
            name,
            ulId,
            isDefault: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
    } else {
        defaultStock = existingStocks.rows[0] as unknown as InvStockListRow;
    }

    // Assign any orphan items with null stockId to default stock
    await db.execute({
        sql: `UPDATE "InvItem" SET stockId = ? WHERE (stockId IS NULL OR stockId = '') AND ulId = ?`,
        args: [defaultStock.id, ulId],
    });

    return defaultStock;
}

/** Ligne d'item lue sur le stock source, restreinte aux colonnes recopiées. */
interface SourceItemRow {
    id: string;
    name: string;
    category: string | null;
    minStock: number | null;
    notes: string | null;
}

/** Lot lu sur le stock source. */
interface SourceBatchRow {
    itemId: string;
    quantity: number;
    expiryDate: string | null;
}

export interface DuplicateStockParams {
    /** Stock à copier. Doit appartenir à `ulId`, sinon la duplication est refusée. */
    sourceStockId: string;
    /** Nom du stock à créer (déjà trimé par l'appelant). */
    name: string;
    ulId: string;
    /** Auteur enregistré dans les lignes d'historique « Import initial ». */
    userName: string;
    /** `false` : copier les articles seuls (quantité à zéro, aucun lot, aucun historique). */
    copyStock: boolean;
}

export interface DuplicateStockResult extends InvStockListRow {
    itemsCopied: number;
    batchesCopied: number;
}

/**
 * SQLite plafonne le nombre de variables liées d'une requête (999 par défaut).
 * Les identifiants d'items sont donc découpés avant d'alimenter un `IN (?, ?, …)`.
 */
const SQLITE_VAR_CHUNK = 500;

/**
 * Les écritures sont groupées par paquets plutôt qu'envoyées une par une : une
 * duplication émet 1 + 2N instructions, soit plusieurs milliers d'allers-retours
 * réseau vers Turso sur un gros stock — largement au-delà du budget de la route.
 */
const WRITE_BATCH_SIZE = 500;

/**
 * Duplique un stock vers un **nouveau** stock de la même UL.
 *
 * Les articles (nom, catégorie, seuil mini, notes) sont toujours copiés. Quand
 * `copyStock` est vrai, les lots `InvBatch` sont recopiés à l'identique — quantités
 * et dates de péremption étant portées par la même ligne, elles sont indissociables —
 * et une unique ligne d'historique « Import initial » est écrite par article non vide.
 *
 * L'historique `InvStockLog` du stock source n'est jamais recopié : c'est un journal
 * d'audit, et cloner des mouvements qui n'ont pas eu lieu dans le nouveau stock
 * produirait un historique mensonger.
 *
 * Toutes les écritures sont faites dans une seule transaction : en cas d'échec, aucun
 * stock partiel ne subsiste.
 *
 * @returns `null` si le stock source est introuvable dans cette UL (l'appelant traduit en 404).
 */
export async function duplicateStock(params: DuplicateStockParams): Promise<DuplicateStockResult | null> {
    const { sourceStockId, name, ulId, userName, copyStock } = params;

    // Hors transaction : cette fonction contient du DDL (CREATE / ALTER TABLE).
    await ensureStockTableExists();

    // Les lectures sont faites dans la transaction : sinon un ajustement concurrent
    // entre la lecture des articles et celle des lots produirait la copie d'un
    // instantané qui n'a jamais existé de façon cohérente.
    const tx = await db.transaction('write');
    try {
        const sourceRes = await tx.execute({
            sql: `SELECT id, name FROM "InvStockList" WHERE id = ? AND ulId = ?`,
            args: [sourceStockId, ulId],
        });
        if (!sourceRes?.rows || sourceRes.rows.length === 0) {
            await tx.rollback();
            return null;
        }
        const sourceName = String(sourceRes.rows[0].name);

        // Le filtre `ulId` est répété ici : un article mal rattaché ne doit jamais
        // franchir la frontière d'UL, même si son `stockId` désigne bien le stock source.
        const itemsRes = await tx.execute({
            sql: `SELECT id, name, category, minStock, notes FROM "InvItem" WHERE stockId = ? AND ulId = ? ORDER BY id ASC`,
            args: [sourceStockId, ulId],
        });
        const sourceItems = (itemsRes.rows ?? []) as unknown as SourceItemRow[];

        // Un seul SELECT par tranche d'articles plutôt qu'une requête par article.
        // Le découpage porte sur les articles, jamais sur les lots : tous les lots
        // d'un article tombent donc toujours dans la même requête.
        const batchesByItem = new Map<string, SourceBatchRow[]>();
        if (copyStock) {
            for (let i = 0; i < sourceItems.length; i += SQLITE_VAR_CHUNK) {
                const chunk = sourceItems.slice(i, i + SQLITE_VAR_CHUNK);
                const placeholders = chunk.map(() => '?').join(', ');
                const batchesRes = await tx.execute({
                    sql: `SELECT itemId, quantity, expiryDate FROM "InvBatch" WHERE itemId IN (${placeholders}) ORDER BY itemId ASC, id ASC`,
                    args: chunk.map(item => item.id),
                });
                for (const row of batchesRes.rows ?? []) {
                    const batch = row as unknown as SourceBatchRow;
                    const existing = batchesByItem.get(batch.itemId);
                    if (existing) {
                        existing.push(batch);
                    } else {
                        batchesByItem.set(batch.itemId, [batch]);
                    }
                }
            }
        }

        const newStockId = crypto.randomUUID();
        let batchesCopied = 0;

        // Les instructions sont d'abord assemblées en mémoire, puis envoyées par paquets.
        // L'ordre est significatif : le stock avant ses articles, un article avant ses lots.
        const writes: InStatement[] = [{
            sql: `INSERT INTO "InvStockList" (id, name, ulId, isDefault) VALUES (?, ?, ?, 0)`,
            args: [newStockId, name, ulId],
        }];

        for (const item of sourceItems) {
            const batches = batchesByItem.get(item.id) ?? [];
            // La somme des lots fait foi : un `InvItem.quantity` hérité qui divergerait
            // de ses lots ne se propage pas au nouveau stock.
            const total = batches.reduce((sum, batch) => sum + Number(batch.quantity), 0);
            const newItemId = crypto.randomUUID();

            writes.push({
                sql: `INSERT INTO "InvItem" (id, stockId, name, category, quantity, minStock, notes, ulId, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                args: [
                    newItemId,
                    newStockId,
                    item.name,
                    item.category ?? null,
                    copyStock ? total : 0,
                    item.minStock ?? null,
                    item.notes ?? null,
                    ulId,
                ],
            });

            if (!copyStock) continue;

            for (const batch of batches) {
                writes.push({
                    sql: `INSERT INTO "InvBatch" (id, itemId, quantity, expiryDate) VALUES (?, ?, ?, ?)`,
                    args: [crypto.randomUUID(), newItemId, Number(batch.quantity), batch.expiryDate ?? null],
                });
                batchesCopied++;
            }

            // `!== 0` et non `> 0` : un total négatif hérité doit lui aussi laisser une
            // trace. Un stock non nul sans ligne d'historique serait exactement le
            // genre d'historique mensonger que cette conception cherche à éviter.
            if (total !== 0) {
                writes.push({
                    sql: `INSERT INTO "InvStockLog" (id, itemId, "change", userName, note) VALUES (?, ?, ?, ?, ?)`,
                    args: [
                        crypto.randomUUID(),
                        newItemId,
                        total,
                        userName,
                        `Import initial — dupliqué depuis ${sourceName}`,
                    ],
                });
            }
        }

        for (let i = 0; i < writes.length; i += WRITE_BATCH_SIZE) {
            // `tx.batch` interrompt le paquet à la première erreur mais ne défait rien
            // de lui-même : le `rollback` du `catch` reste indispensable. Aucun `COMMIT`
            // intermédiaire n'est émis, les paquets déjà passés sont donc défaits aussi.
            await tx.batch(writes.slice(i, i + WRITE_BATCH_SIZE));
        }

        // La ligne est relue plutôt que reconstruite à la main, pour que l'appelant
        // reçoive un `InvStockListRow` complet (`createdAt` / `updatedAt` inclus).
        const createdRes = await tx.execute({
            sql: `SELECT id, name, ulId, isDefault, createdAt, updatedAt FROM "InvStockList" WHERE id = ?`,
            args: [newStockId],
        });
        const created = createdRes.rows[0] as unknown as InvStockListRow;

        await tx.commit();

        return { ...created, itemsCopied: sourceItems.length, batchesCopied };
    } catch (e) {
        // Le rollback est isolé : s'il échoue à son tour (transaction déjà avortée par
        // SQLite), c'est sa propre erreur qui remonterait et masquerait la cause réelle.
        try {
            await tx.rollback();
        } catch {
            // Transaction déjà close : rien à défaire.
        }
        throw e;
    }
}

// ── Token QR d'un stock ───────────────────────────────────────────────────────

/**
 * Retourne le token QR du stock, en le créant à la première demande.
 *
 * @returns `null` si le stock n'existe pas (l'appelant traduit en 404).
 */
export async function getOrCreateStockQrToken(stockId: string): Promise<string | null> {
    // Hors transaction : cette fonction contient du DDL (CREATE / ALTER TABLE).
    await ensureStockTableExists();

    const res = await db.execute({
        sql: `SELECT id, qrToken FROM "InvStockList" WHERE id = ?`,
        args: [stockId],
    });
    if (!res?.rows || res.rows.length === 0) return null;

    const existing = res.rows[0].qrToken as string | null;
    if (existing) return existing;

    const token = crypto.randomUUID();
    await db.execute({
        sql: `UPDATE "InvStockList" SET qrToken = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
        args: [token, stockId],
    });
    return token;
}

/**
 * Remplace le token du stock : les QR déjà imprimés cessent d'être valides.
 * C'est le seul moyen de couper une fuite de token.
 *
 * @returns `null` si le stock n'existe pas.
 */
export async function regenerateStockQrToken(stockId: string): Promise<string | null> {
    await ensureStockTableExists();

    const token = crypto.randomUUID();
    const res = await db.execute({
        sql: `UPDATE "InvStockList" SET qrToken = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
        args: [token, stockId],
    });
    if (res.rowsAffected === 0) return null;
    return token;
}

/**
 * Résout le stock désigné par un token de QR Code.
 *
 * AUCUN filtre d'UL : c'est la décision de conception de cette fonctionnalité —
 * quiconque tient le QR papier peut consulter et ajuster le stock, quelle que
 * soit son unité locale. La traçabilité nominative dans `InvStockLog` est le
 * garde-fou, pas une barrière d'UL.
 *
 * `ensureStockTableExists()` n'est DÉLIBÉRÉMENT pas appelée : c'est le chemin
 * chaud de chaque scan, et un `SELECT` sur une colonne absente lève — signal
 * correct d'une migration de production non faite, plutôt qu'un DDL silencieux
 * à chaque requête.
 */
export async function resolveStockByQrToken(token: string): Promise<{ id: string; name: string } | null> {
    const res = await db.execute({
        sql: `SELECT id, name FROM "InvStockList" WHERE qrToken = ?`,
        args: [token],
    });
    if (!res?.rows || res.rows.length === 0) return null;
    return { id: String(res.rows[0].id), name: String(res.rows[0].name) };
}
