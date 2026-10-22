/**
 * Persistance d'un scellement : écriture R2 puis mise à jour transactionnelle.
 *
 * ORDRE IMPOSÉ, et il compte :
 *   1. `PUT R2` sur une clé NEUVE — ne peut rien détruire, puisqu'elle n'existait pas
 *   2. `db.transaction('write')` — statut, `r2Key` et journal des révisions
 *
 * Si le PUT échoue : la base est intacte, l'opération est rejouable telle quelle.
 * Si la transaction échoue : l'objet R2 reste orphelin, inoffensif et ignoré —
 * seul le `r2Key` en base fait foi.
 *
 * L'ordre inverse (UPDATE puis PUT) exigerait une compensation après panne. Or une
 * compensation est du code qui s'exécute APRÈS la panne qu'elle répare : sur un
 * lambda tué entre les deux, elle ne tourne jamais et la base pointe une clé
 * inexistante — le PDF d'une note validée renverrait 404.
 */

import { db } from '@/lib/db';
import { putObject } from '@/lib/r2';
import { appendRevision, type SealResult } from './sealing';

export class PersistSealError extends Error {}
/** La transition n'a pas eu lieu : statut déjà changé par un appel concurrent. */
export class ConcurrentTransitionError extends PersistSealError {}

export interface PersistOptions {
    reportId: string;
    /**
     * Un scellement, ou une SUITE de scellements enchaînés en mémoire — chacun
     * posé sur le buffer du précédent (signature combinée du président). Seul le
     * dernier buffer, qui contient tous les autres, est écrit sur R2 ; toutes les
     * révisions entrent au journal dans la même transaction.
     */
    seal: SealResult | SealResult[];
    /** Statut attendu AVANT la transition — garde contre la concurrence. */
    expectedStatus: string;
    /** Statut après la transition. */
    nextStatus: string;
    /** Colonnes supplémentaires à écrire, hors statut / r2Key / signatureRevisions. */
    extraColumns?: Record<string, string | number | null>;
}

/**
 * Écrit le PDF scellé sur R2 puis valide la transition en base.
 *
 * @throws {ConcurrentTransitionError} si le statut a changé entre-temps.
 */
export async function persistSealed(opts: PersistOptions): Promise<void> {
    const { reportId, expectedStatus, nextStatus } = opts;
    const seals = Array.isArray(opts.seal) ? opts.seal : [opts.seal];
    if (seals.length === 0) throw new PersistSealError('Aucun scellement à persister.');
    const last = seals[seals.length - 1];

    // Une suite n'a de sens que si chaque buffer prolonge le précédent : sinon le
    // document final ne contiendrait pas toutes les signatures journalisées.
    for (let i = 1; i < seals.length; i++) {
        const prev = seals[i - 1].buffer;
        if (!seals[i].buffer.subarray(0, prev.length).equals(prev)) {
            throw new PersistSealError('Suite de scellements incohérente : un buffer ne prolonge pas le précédent.');
        }
    }

    // Colonnes portées par les scellements (ex. `workflowVersion`), puis celles de
    // l'appelant, qui priment.
    const extraColumns: Record<string, string | number | null> = {
        ...Object.assign({}, ...seals.map(s => s.columns ?? {})),
        ...(opts.extraColumns ?? {}),
    };

    // 1. R2 d'abord : clé neuve, écriture non destructive. Le dernier buffer
    // contient tous les précédents.
    await putObject(last.key, last.buffer);

    // 2. Base ensuite, dans une transaction.
    const tx = await db.transaction('write');
    try {
        const current = await tx.execute({
            sql: `SELECT signatureRevisions FROM "ExpenseReport" WHERE id = ?`,
            args: [reportId],
        });
        // Seul le dernier buffer est écrit : chaque révision de la suite pointe
        // donc vers sa clé, la seule qui existe sur R2.
        const revisions = appendRevision(
            current.rows[0]?.signatureRevisions,
            ...seals.map(s => ({ ...s.revision, r2Key: last.key })),
        );

        const extraKeys = Object.keys(extraColumns);
        const setClause = [
            'status = ?', 'r2Key = ?', 'signatureRevisions = ?', 'updatedAt = ?',
            ...extraKeys.map(k => `"${k}" = ?`),
        ].join(', ');

        const res = await tx.execute({
            // Le `AND status = ?` neutralise deux appels concurrents : le second
            // ne modifie aucune ligne et sera rejeté ci-dessous.
            sql: `UPDATE "ExpenseReport" SET ${setClause} WHERE id = ? AND status = ?`,
            args: [
                nextStatus, last.key, revisions, new Date().toISOString(),
                ...extraKeys.map(k => extraColumns[k]),
                reportId, expectedStatus,
            ],
        });

        if (res.rowsAffected !== 1) {
            await tx.rollback();
            throw new ConcurrentTransitionError(
                'La note de frais a changé d\'état entre-temps. Rechargez la page et réessayez.'
            );
        }

        await tx.commit();
    } catch (e: unknown) {
        try { await tx.rollback(); } catch { /* déjà terminée */ }
        throw e;
    }
}
