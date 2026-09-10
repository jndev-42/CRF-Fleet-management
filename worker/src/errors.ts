/**
 * Erreurs typées, alignées sur `src/lib/renault.ts` côté application.
 *
 * La distinction porte une conséquence métier précise : seule `AUTH` autorise
 * l'appelant à basculer un credential en `ERROR`. Élargir ce déclencheur ferait
 * passer toute la flotte en bandeau rouge au premier incident réseau — c'est le
 * contrat que `vehicle-connection.ts` fait déjà respecter pour Renault.
 */
export type WorkerErrorKind = 'AUTH' | 'TRANSIENT';

export class WorkerError extends Error {
    constructor(
        readonly kind: WorkerErrorKind,
        message: string,
        /**
         * Étapes franchies avant l'échec.
         *
         * Sans elle, un échec tardif — l'échange de jetons, par exemple — ne dit
         * rien de ce qui a réussi avant, et on relance un parcours de 60 s pour
         * apprendre ce que le run précédent savait déjà.
         */
        readonly trace: string[] = []
    ) {
        super(message);
        this.name = 'WorkerError';
    }
}

export const authError = (m: string, trace: string[] = []) => new WorkerError('AUTH', m, trace);
export const transientError = (m: string, trace: string[] = []) => new WorkerError('TRANSIENT', m, trace);
