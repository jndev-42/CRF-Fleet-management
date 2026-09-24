import type { InStatement } from '@libsql/client';
import { db } from '@/lib/db';
import { UniformError } from './errors';
import { UNAVAILABLE_LOAN_SQL } from './catalog';
import { UL_LOANS_LIMIT } from './constants';

/** Identité persistée sur un emprunt, un rendu ou un lavage. */
export interface UniformActor {
    id: string;
    name: string | null;
    email: string | null;
}

/**
 * Résout l'utilisateur de session vers son `User.id` en base.
 *
 * `session.user.id` peut être un email de repli en dev (cf. `/api/missions`) :
 * sans résolution, l'emprunteur ne retrouverait pas ses propres emprunts et le
 * contrôle « seul l'emprunteur rend » refuserait le vrai propriétaire.
 */
export async function resolveActor(user: { id?: string | null; email?: string | null; name?: string | null }): Promise<UniformActor> {
    let id = user.id ?? null;
    if (user.email) {
        const res = await db.execute({ sql: `SELECT id FROM "User" WHERE email = ?`, args: [user.email] });
        if (res.rows.length > 0) id = String(res.rows[0].id);
    }
    // Repli sur l'email. Sans aucun identifiant, on refuse plutôt que d'inventer
    // un emprunteur partagé : tous ses « emprunts » seraient rendables par tous.
    const resolved = id ?? user.email ?? null;
    if (!resolved) throw new UniformError(401, 'Session sans identifiant utilisateur');
    return { id: resolved, name: user.name ?? null, email: user.email ?? null };
}

export interface LoanLine {
    sizeId: string;
    quantity: number;
}

export const MAX_LOAN_PIECES = 50;

/**
 * Valide un panier : une ligne `UniformLoan` par pièce, sous un même
 * `UniformLoanBatch`. Seule écriture d'emprunt du module — l'appli et le QR
 * l'appellent toutes deux, seul `ulId` (UL active ou UL du token) diffère.
 *
 * Le calcul du disponible et les INSERT partagent la même transaction
 * d'écriture : deux validations simultanées sur la dernière pièce ne peuvent
 * pas réussir toutes les deux. Tout-ou-rien — une taille insuffisante annule
 * le panier entier (409), aucune ligne n'est créée.
 *
 * @throws UniformError 404 si une taille est inconnue, archivée ou hors de `ulId` ;
 *                      409 si le disponible ne suffit plus.
 */
export async function createLoanBatch(params: {
    ulId: string;
    borrower: UniformActor;
    lines: LoanLine[];
    source: 'app' | 'qr';
}): Promise<{ batchId: string; count: number }> {
    const { ulId, borrower, lines, source } = params;

    // Deux lignes sur la même taille sont fusionnées : le contrôle de dispo
    // doit porter sur le total demandé, pas ligne par ligne.
    const requested = new Map<string, number>();
    for (const line of lines) {
        requested.set(line.sizeId, (requested.get(line.sizeId) ?? 0) + line.quantity);
    }
    const sizeIds = [...requested.keys()];
    const total = [...requested.values()].reduce((a, b) => a + b, 0);
    if (total > MAX_LOAN_PIECES) {
        throw new UniformError(400, `Maximum ${MAX_LOAN_PIECES} pièces par emprunt`);
    }

    const tx = await db.transaction('write');
    try {
        const placeholders = sizeIds.map(() => '?').join(', ');
        const res = await tx.execute({
            sql: `SELECT s.id, s.label, s.quantity, i.name AS itemName,
                         (SELECT COUNT(*) FROM "UniformLoan" l WHERE l.sizeId = s.id AND ${UNAVAILABLE_LOAN_SQL}) AS unavailable
                    FROM "UniformSize" s JOIN "UniformItem" i ON i.id = s.itemId
                   WHERE s.id IN (${placeholders})
                     AND i.ulId = ?
                     AND s.archivedAt IS NULL AND i.archivedAt IS NULL`,
            args: [...sizeIds, ulId],
        });
        if (res.rows.length !== sizeIds.length) {
            throw new UniformError(404, 'Article introuvable dans ce catalogue');
        }

        for (const row of res.rows) {
            const available = Math.max(0, Number(row.quantity) - Number(row.unavailable));
            const wanted = requested.get(String(row.id)) ?? 0;
            if (wanted > available) {
                throw new UniformError(
                    409,
                    `Plus assez de « ${String(row.itemName)} ${String(row.label)} » disponibles (${available} restant${available > 1 ? 's' : ''})`,
                );
            }
        }

        const batchId = crypto.randomUUID();
        const now = new Date().toISOString();
        const writes: InStatement[] = [{
            sql: `INSERT INTO "UniformLoanBatch" (id, ulId, borrowerId, borrowerName, borrowerEmail, source, createdAt)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`,
            args: [batchId, ulId, borrower.id, borrower.name, borrower.email, source, now],
        }];
        for (const [sizeId, quantity] of requested) {
            for (let i = 0; i < quantity; i++) {
                writes.push({
                    sql: `INSERT INTO "UniformLoan" (id, batchId, sizeId, borrowerId, borrowedAt) VALUES (?, ?, ?, ?, ?)`,
                    args: [crypto.randomUUID(), batchId, sizeId, borrower.id, now],
                });
            }
        }
        await tx.batch(writes);
        await tx.commit();
        return { batchId, count: total };
    } catch (e) {
        // Rollback isolé : son propre échec masquerait la cause réelle.
        try { await tx.rollback(); } catch { /* transaction déjà close */ }
        throw e;
    }
}

// ── Bandeau : emprunts en cours de l'utilisateur ──────────────────────────────

export interface MyLoanPiece {
    loanId: string;
    itemName: string;
    sizeLabel: string;
    borrowedAt: string;
}

export interface MyLoanBatch {
    batchId: string;
    ulName: string | null;
    createdAt: string;
    pieces: MyLoanPiece[];
}

/**
 * Pièces non rendues de l'emprunteur, groupées par emprunt validé. Toutes UL
 * confondues : un bénévole qui a emprunté via le QR d'une autre UL doit
 * retrouver ses pièces quelle que soit son UL active.
 */
export async function listMyOpenLoans(borrowerId: string): Promise<MyLoanBatch[]> {
    const res = await db.execute({
        sql: `SELECT b.id AS batchId, b.createdAt AS batchCreatedAt, ul.name AS ulName,
                     l.id AS loanId, l.borrowedAt, i.name AS itemName, s.label AS sizeLabel
                FROM "UniformLoan" l
                JOIN "UniformLoanBatch" b ON b.id = l.batchId
                JOIN "UniformSize" s ON s.id = l.sizeId
                JOIN "UniformItem" i ON i.id = s.itemId
                LEFT JOIN "UniteLocale" ul ON ul.id = b.ulId
               WHERE l.borrowerId = ? AND l.returnedAt IS NULL
               ORDER BY b.createdAt DESC, b.id, i.name COLLATE NOCASE, s.label, l.id`,
        args: [borrowerId],
    });

    const batches: MyLoanBatch[] = [];
    const byId = new Map<string, MyLoanBatch>();
    for (const row of res.rows) {
        const batchId = String(row.batchId);
        let batch = byId.get(batchId);
        if (!batch) {
            batch = {
                batchId,
                ulName: (row.ulName as string | null) ?? null,
                createdAt: String(row.batchCreatedAt),
                pieces: [],
            };
            byId.set(batchId, batch);
            batches.push(batch);
        }
        batch.pieces.push({
            loanId: String(row.loanId),
            itemName: String(row.itemName),
            sizeLabel: String(row.sizeLabel),
            borrowedAt: String(row.borrowedAt),
        });
    }
    return batches;
}

// ── Rendu ─────────────────────────────────────────────────────────────────────

export interface ReturnInput {
    returnedClean: boolean;
    comment: string | null;
}

/**
 * Rend une pièce. Uniquement par son emprunteur : le filtre `borrowerId` est
 * DANS l'UPDATE, et une pièce d'autrui répond 404 comme une pièce inconnue —
 * l'identifiant ne doit pas servir d'oracle (même convention que `isOutsideUl`
 * sur `POST /api/trips`).
 *
 * @throws UniformError 404 (inconnue ou d'autrui), 409 (déjà rendue).
 */
export async function returnLoan(loanId: string, borrowerId: string, input: ReturnInput): Promise<void> {
    const res = await db.execute({
        sql: `UPDATE "UniformLoan"
                 SET returnedAt = ?, returnedClean = ?, returnComment = ?
               WHERE id = ? AND borrowerId = ? AND returnedAt IS NULL`,
        args: [new Date().toISOString(), input.returnedClean ? 1 : 0, input.comment, loanId, borrowerId],
    });
    if (res.rowsAffected > 0) return;

    const check = await db.execute({
        sql: `SELECT returnedAt FROM "UniformLoan" WHERE id = ? AND borrowerId = ?`,
        args: [loanId, borrowerId],
    });
    if (check.rows.length === 0) throw new UniformError(404, 'Emprunt introuvable');
    throw new UniformError(409, 'Cette pièce a déjà été rendue');
}

/**
 * « Tout rendre » : rend d'un coup les pièces restantes d'un emprunt, avec le
 * même état et le même commentaire. Les pièces déjà rendues gardent le leur.
 *
 * @returns le nombre de pièces rendues par cet appel.
 * @throws UniformError 404 (inconnu ou d'autrui), 409 (plus rien à rendre).
 */
export async function returnBatch(batchId: string, borrowerId: string, input: ReturnInput): Promise<number> {
    const batch = await db.execute({
        sql: `SELECT id FROM "UniformLoanBatch" WHERE id = ? AND borrowerId = ?`,
        args: [batchId, borrowerId],
    });
    if (batch.rows.length === 0) throw new UniformError(404, 'Emprunt introuvable');

    const res = await db.execute({
        sql: `UPDATE "UniformLoan"
                 SET returnedAt = ?, returnedClean = ?, returnComment = ?
               WHERE batchId = ? AND borrowerId = ? AND returnedAt IS NULL`,
        args: [new Date().toISOString(), input.returnedClean ? 1 : 0, input.comment, batchId, borrowerId],
    });
    if (res.rowsAffected === 0) throw new UniformError(409, 'Toutes les pièces de cet emprunt ont déjà été rendues');
    return res.rowsAffected;
}

// ── Vue gestionnaire : qui a emprunté quoi ────────────────────────────────────

export interface UlLoanRow {
    loanId: string;
    batchId: string;
    borrowerName: string | null;
    borrowerEmail: string | null;
    itemName: string;
    sizeLabel: string;
    borrowedAt: string;
    returnedAt: string | null;
    returnedClean: boolean | null;
    returnComment: string | null;
    washedAt: string | null;
    washedByName: string | null;
}


/**
 * Emprunts portant sur les articles de `ulId`, QUELLE QUE SOIT l'UL de
 * l'emprunteur : c'est l'UL propriétaire des pièces qui en suit la sortie.
 * Les articles et tailles archivés restent inclus — l'historique est intact.
 *
 * Plafonné à `UL_LOANS_LIMIT` lignes, les plus récentes : une ligne de plus est
 * lue pour signaler la troncature (`truncated`) au lieu de la taire.
 */
export async function listUlLoans(ulId: string, status: 'open' | 'all'): Promise<{ loans: UlLoanRow[]; truncated: boolean }> {
    const res = await db.execute({
        sql: `SELECT l.id AS loanId, l.batchId, b.borrowerName, b.borrowerEmail,
                     i.name AS itemName, s.label AS sizeLabel,
                     l.borrowedAt, l.returnedAt, l.returnedClean, l.returnComment,
                     l.washedAt, l.washedByName
                FROM "UniformLoan" l
                JOIN "UniformLoanBatch" b ON b.id = l.batchId
                JOIN "UniformSize" s ON s.id = l.sizeId
                JOIN "UniformItem" i ON i.id = s.itemId
               WHERE i.ulId = ? ${status === 'open' ? 'AND l.returnedAt IS NULL' : ''}
               ORDER BY l.borrowedAt DESC, b.id, i.name COLLATE NOCASE, s.label, l.id
               LIMIT ${UL_LOANS_LIMIT + 1}`,
        args: [ulId],
    });
    const truncated = res.rows.length > UL_LOANS_LIMIT;
    const loans = res.rows.slice(0, UL_LOANS_LIMIT).map(row => ({
        loanId: String(row.loanId),
        batchId: String(row.batchId),
        borrowerName: (row.borrowerName as string | null) ?? null,
        borrowerEmail: (row.borrowerEmail as string | null) ?? null,
        itemName: String(row.itemName),
        sizeLabel: String(row.sizeLabel),
        borrowedAt: String(row.borrowedAt),
        returnedAt: (row.returnedAt as string | null) ?? null,
        returnedClean: row.returnedClean === null ? null : Number(row.returnedClean) === 1,
        returnComment: (row.returnComment as string | null) ?? null,
        washedAt: (row.washedAt as string | null) ?? null,
        washedByName: (row.washedByName as string | null) ?? null,
    }));
    return { loans, truncated };
}
