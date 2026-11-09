/**
 * Garde des scripts de migration R2 (`scripts/migrate-drive-images-to-r2.ts`,
 * `scripts/move-expense-pdfs-to-ul-folders.ts`, `scripts/move-r2-objects-to-ul-folders.ts`).
 *
 * `src/lib/r2.ts` retombe sur le bucket de PRODUCTION (`expenses-reports`) quand
 * `R2_BUCKET` est absent : un script lancé avec un fichier d'env de preview
 * incomplet écrirait (et supprimerait, avec `--delete-old`) en production. Les
 * scripts exigent donc un `R2_BUCKET` explicite et l'affichent dans leur bandeau.
 */

export class MissingR2BucketError extends Error {}

/** Bucket R2 explicitement configuré (fichier `--env` ou environnement), sinon lève. */
export function requireExplicitR2Bucket(env: Record<string, string | undefined> = process.env): string {
    const bucket = env.R2_BUCKET?.trim();
    if (!bucket) {
        throw new MissingR2BucketError(
            "R2_BUCKET n'est pas défini dans l'environnement chargé : refus de lancer la migration " +
            '(sans lui, le bucket de production serait utilisé par défaut). Ajoutez R2_BUCKET=<bucket> au fichier --env.',
        );
    }
    return bucket;
}
