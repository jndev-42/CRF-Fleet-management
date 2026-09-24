import { db } from '@/lib/db';

/**
 * Token QR « Uniformes » d'une UL — colonne `UniteLocale.uniformQrToken`.
 *
 * DISTINCT de `UniteLocale.qrToken`, qui ouvre le dépôt d'un compte rendu de
 * mission : les deux QR sont affichés à des endroits différents (vestiaire /
 * poste) et la fuite de l'un ne doit pas ouvrir l'autre.
 */

/**
 * Retourne le token, en le créant à la première demande.
 *
 * UPDATE conditionnel (`uniformQrToken IS NULL`) puis relecture : deux
 * premières demandes concurrentes ne laissent qu'un gagnant, et chacune
 * renvoie la valeur retenue.
 *
 * @returns `null` si l'UL n'existe pas.
 */
export async function getOrCreateUniformQrToken(ulId: string): Promise<string | null> {
    const res = await db.execute({
        sql: `SELECT uniformQrToken FROM "UniteLocale" WHERE id = ?`,
        args: [ulId],
    });
    if (res.rows.length === 0) return null;

    const existing = res.rows[0].uniformQrToken as string | null;
    if (existing) return existing;

    await db.execute({
        sql: `UPDATE "UniteLocale" SET uniformQrToken = ? WHERE id = ? AND uniformQrToken IS NULL`,
        args: [crypto.randomUUID(), ulId],
    });
    const winner = await db.execute({
        sql: `SELECT uniformQrToken FROM "UniteLocale" WHERE id = ?`,
        args: [ulId],
    });
    return (winner.rows[0]?.uniformQrToken as string | null) ?? null;
}

/**
 * Remplace le token : les QR déjà imprimés cessent d'être valides. Seul moyen
 * de couper une fuite.
 *
 * @returns `null` si l'UL n'existe pas.
 */
export async function regenerateUniformQrToken(ulId: string): Promise<string | null> {
    const token = crypto.randomUUID();
    const res = await db.execute({
        sql: `UPDATE "UniteLocale" SET uniformQrToken = ? WHERE id = ?`,
        args: [token, ulId],
    });
    return res.rowsAffected === 0 ? null : token;
}

/**
 * Résout l'UL désignée par un token « Uniformes ». AUCUN filtre de rôle ni
 * d'UL : la possession du QR fait foi, comme pour les véhicules et les stocks.
 */
export async function resolveUlByUniformQrToken(token: string): Promise<{ id: string; name: string } | null> {
    const res = await db.execute({
        sql: `SELECT id, name FROM "UniteLocale" WHERE uniformQrToken = ?`,
        args: [token],
    });
    if (res.rows.length === 0) return null;
    return { id: String(res.rows[0].id), name: String(res.rows[0].name) };
}
