import type { InStatement, ResultSet } from '@libsql/client';

/**
 * Logique d'ajustement de stock, partagée par `POST /api/inventory/adjust`
 * (un mouvement, admin de l'UL) et `POST /api/qr-stock/[token]/adjust`
 * (panier de mouvements, accès par QR Code).
 *
 * La forme est en trois temps — lecture groupée, planification pure, exécution
 * par paquets — et non « une instruction à la fois ». Motif : un panier de 25
 * mouvements coûterait 125 à 175 allers-retours séquentiels sous un `BEGIN
 * IMMEDIATE` unique, or une transaction d'écriture SQLite verrouille la base
 * ENTIÈRE : sa durée de vie est une indisponibilité en écriture pour toute
 * l'application. En trois phases, la transaction ne paie que ~3 allers-retours,
 * quel que soit le nombre de mouvements.
 *
 * Corollaire : la validation, le DDL et la résolution du token se font AVANT
 * d'ouvrir la transaction. Un lecteur qui mesurerait 8 allers-retours sur la
 * requête complète ne doit pas « optimiser » en les déplaçant dedans — ce
 * serait annuler tout le gain.
 */

/**
 * Dénominateur commun entre le client `db` et une transaction `tx` : les deux
 * savent exécuter une instruction et un paquet d'instructions. Typage
 * structurel plutôt qu'un import de la classe concrète, pour que la lib reste
 * testable sans base et indifférente au fait d'être appelée dans ou hors
 * transaction.
 */
export type SqlExecutor = {
    execute(stmt: InStatement): Promise<ResultSet>;
    batch(stmts: InStatement[]): Promise<ResultSet[]>;
};

/** Lot d'un article, tel que le planificateur le fait évoluer en mémoire. */
export interface ItemBatchState {
    itemId: string;
    batches: { id: string; quantity: number; expiryDate: string | null }[];
}

export interface StockMovement {
    itemId: string;
    change: number;
    /** Ignoré quand `change < 0` : un retrait suit toujours l'ordre FEFO. */
    expiryDate?: string | null;
    note?: string | null;
    /** Découpage d'un lot sans date vers un lot daté — `/api/inventory/adjust` uniquement. */
    deductFromNoDate?: boolean;
}

/**
 * FEFO — *first expired, first out*. Les lots sans date passent en dernier :
 * ils ne périment pas, donc rien n'oblige à les consommer en premier.
 *
 * Cette clause existait en trois exemplaires littéraux (`adjust/route.ts`,
 * `batches/route.ts`, et ici) ; les trois pointent désormais sur celle-ci.
 */
export const FEFO_ORDER_BY = 'CASE WHEN expiryDate IS NULL THEN 1 ELSE 0 END, expiryDate ASC';

/**
 * Resynchronisation de `InvItem.quantity` sur la somme de ses lots.
 *
 * SOUS-REQUÊTE CORRÉLÉE, et non un total calculé en mémoire puis réécrit : la
 * base recalcule la somme au moment de l'écriture, si bien qu'un lot inséré par
 * un écrivain concurrent entre la lecture et l'écriture est COMPTÉ et non
 * écrasé. Sur `/api/inventory/adjust`, dont la lecture est hors transaction,
 * persister un total lu avant élargirait la fenêtre de perte de mise à jour au
 * lieu de la réduire.
 *
 * `COALESCE(…, 0)` est obligatoire : `InvItem.quantity` est `NOT NULL`, et un
 * article dont tous les lots sont vides ferait sinon écrire `NULL`.
 *
 * `quantity > 0` : « somme des lots non vides ». Aucune contrainte de schéma ne
 * garantit qu'un lot ne puisse être négatif — l'invariant tient par convention
 * sur tous les sites d'écriture de `InvBatch`, et ce filtre borne les dégâts
 * si l'un d'eux venait à le rompre.
 *
 * Args attendus : `[itemId, itemId]`.
 */
export const RESYNC_ITEM_QUANTITY_SQL = `
    UPDATE "InvItem"
       SET quantity = (SELECT COALESCE(SUM(quantity), 0)
                         FROM "InvBatch"
                        WHERE itemId = ? AND quantity > 0),
           updatedAt = CURRENT_TIMESTAMP
     WHERE id = ?`;

/**
 * SQLite plafonne le nombre de variables liées d'une requête (999 par défaut).
 * Les identifiants d'articles sont découpés avant d'alimenter un `IN (?, ?, …)`.
 */
const SQLITE_VAR_CHUNK = 500;

/** Les écritures partent par paquets plutôt qu'une par une — cf. en-tête du fichier. */
const WRITE_BATCH_SIZE = 500;

/** Comparateur FEFO, transposition exacte de {@link FEFO_ORDER_BY}. */
function compareFefo(
    a: { expiryDate: string | null },
    b: { expiryDate: string | null },
): number {
    if (a.expiryDate === null && b.expiryDate === null) return 0;
    if (a.expiryDate === null) return 1;
    if (b.expiryDate === null) return -1;
    return a.expiryDate < b.expiryDate ? -1 : a.expiryDate > b.expiryDate ? 1 : 0;
}

/**
 * Charge l'état des lots des articles demandés, en une requête par tranche de
 * `SQLITE_VAR_CHUNK` articles.
 *
 * TOUS les lots sont chargés, y compris ceux à quantité nulle : un filtre
 * `quantity > 0` à la lecture ferait recréer un doublon portant une
 * `expiryDate` déjà présente, et le stock se peuplerait de lignes fantômes.
 *
 * La Map est pré-remplie avec chaque `itemId` demandé : un article sans lot
 * existe et rend `batches: []`. Un `itemId` absent de la Map signale donc un
 * article inconnu de l'appelant, et non un article vide.
 */
export async function loadItemBatchStates(
    exec: SqlExecutor,
    itemIds: string[],
): Promise<Map<string, ItemBatchState>> {
    const states = new Map<string, ItemBatchState>();
    const uniqueIds = [...new Set(itemIds)];
    for (const itemId of uniqueIds) {
        states.set(itemId, { itemId, batches: [] });
    }

    for (let i = 0; i < uniqueIds.length; i += SQLITE_VAR_CHUNK) {
        const chunk = uniqueIds.slice(i, i + SQLITE_VAR_CHUNK);
        const placeholders = chunk.map(() => '?').join(', ');
        const res = await exec.execute({
            sql: `SELECT id, itemId, quantity, expiryDate FROM "InvBatch"
                   WHERE itemId IN (${placeholders})
                   ORDER BY itemId ASC, ${FEFO_ORDER_BY}`,
            args: chunk,
        });
        for (const row of res.rows ?? []) {
            const itemId = String(row.itemId);
            states.get(itemId)?.batches.push({
                id: String(row.id),
                quantity: Number(row.quantity),
                expiryDate: (row.expiryDate as string | null) ?? null,
            });
        }
    }

    return states;
}

export type PlanStockMovementResult =
    | { statements: InStatement[]; newQuantity: number }
    | { error: 'ITEM_NOT_FOUND' | 'NO_DATE_INSUFFICIENT' };

/**
 * Traduit un mouvement en instructions SQL, sans aucune E/S.
 *
 * `states` est modifié EN PLACE : appliquer plusieurs mouvements à la suite
 * part donc toujours de l'état laissé par le précédent, sans fenêtre entre
 * lecture et écriture. Ne pas planifier les mouvements en parallèle, ni les
 * regrouper par article en perdant l'ordre du panier.
 *
 * L'ordre des instructions émises est significatif — écritures de lot, PUIS
 * resynchronisation, PUIS journal : `RESYNC_ITEM_QUANTITY_SQL` est une
 * sous-requête, elle doit voir les écritures du mouvement pour les compter.
 * `db.batch` / `tx.batch` exécutent séquentiellement dans la transaction.
 *
 * `newQuantity` est le total PRÉVU, destiné à la réponse HTTP. Le total
 * persisté est celui que la base calcule ; les deux ne divergent que si un
 * écrivain concurrent s'est intercalé, auquel cas la base a raison. Ne pas en
 * déduire une décision.
 *
 * `crypto.randomUUID()` est la seule impureté, assumée et bornée.
 */
export function planStockMovement(
    states: Map<string, ItemBatchState>,
    movement: StockMovement,
    /**
     * `InvStockLog.userName` est `NOT NULL`. La route QR passe donc un repli
     * `'Inconnu'`. `/api/inventory/adjust` conserve son `|| null` historique —
     * un changement ici serait un changement de comportement sur une route de
     * production, pas une amélioration de la lib.
     */
    userName: string | null,
): PlanStockMovementResult {
    const state = states.get(movement.itemId);
    if (!state) {
        return { error: 'ITEM_NOT_FOUND' };
    }

    const { itemId, change } = movement;
    // `|| null` et non `?? null` : une chaîne vide vaut « sans date », comme
    // dans la route d'origine.
    const targetExpiry = movement.expiryDate || null;
    const statements: InStatement[] = [];

    if (change > 0) {
        // Découpage optionnel : le stock sans date alimente un lot daté.
        if (movement.deductFromNoDate && targetExpiry) {
            const noDateBatch = state.batches.find(b => b.expiryDate === null);
            if (!noDateBatch || noDateBatch.quantity < change) {
                return { error: 'NO_DATE_INSUFFICIENT' };
            }
            statements.push({
                sql: `UPDATE "InvBatch" SET quantity = quantity - ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
                args: [change, noDateBatch.id],
            });
            noDateBatch.quantity -= change;
        }

        const existing = state.batches.find(b => b.expiryDate === targetExpiry);
        if (existing) {
            statements.push({
                sql: `UPDATE "InvBatch" SET quantity = quantity + ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
                args: [change, existing.id],
            });
            existing.quantity += change;
        } else {
            const newBatchId = crypto.randomUUID();
            statements.push({
                sql: `INSERT INTO "InvBatch" (id, itemId, quantity, expiryDate) VALUES (?, ?, ?, ?)`,
                args: [newBatchId, itemId, change, targetExpiry],
            });
            state.batches.push({ id: newBatchId, quantity: change, expiryDate: targetExpiry });
        }
    } else if (change < 0) {
        let remainingToRemove = Math.abs(change);

        // Le tri est refait ici plutôt que tenu pour acquis : un mouvement
        // précédent du même panier a pu créer un lot, ajouté en fin de liste.
        // Sur un mouvement isolé, la liste est déjà triée et le tri est un no-op.
        const candidates = state.batches.filter(b => b.quantity > 0).sort(compareFefo);

        for (const batch of candidates) {
            if (remainingToRemove <= 0) break;

            if (batch.quantity <= remainingToRemove) {
                statements.push({
                    sql: `UPDATE "InvBatch" SET quantity = 0, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
                    args: [batch.id],
                });
                remainingToRemove -= batch.quantity;
                batch.quantity = 0;
            } else {
                statements.push({
                    sql: `UPDATE "InvBatch" SET quantity = quantity - ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
                    args: [remainingToRemove, batch.id],
                });
                batch.quantity -= remainingToRemove;
                remainingToRemove = 0;
            }
        }
        // Le reliquat non servi est volontairement perdu : le plancher est 0,
        // et le journal garde la valeur DEMANDÉE.
    }

    statements.push({ sql: RESYNC_ITEM_QUANTITY_SQL, args: [itemId, itemId] });

    statements.push({
        sql: `INSERT INTO "InvStockLog" (id, itemId, "change", userName, note) VALUES (?, ?, ?, ?, ?)`,
        args: [crypto.randomUUID(), itemId, change, userName, movement.note || null],
    });

    const newQuantity = state.batches.reduce((sum, b) => (b.quantity > 0 ? sum + b.quantity : sum), 0);
    return { statements, newQuantity };
}

/** Envoie les instructions par paquets, dans l'ordre. */
export async function runStatements(exec: SqlExecutor, statements: InStatement[]): Promise<void> {
    for (let i = 0; i < statements.length; i += WRITE_BATCH_SIZE) {
        // `batch` interrompt le paquet à la première erreur mais ne défait rien
        // de lui-même : le `rollback` de l'appelant reste indispensable.
        await exec.batch(statements.slice(i, i + WRITE_BATCH_SIZE));
    }
}
