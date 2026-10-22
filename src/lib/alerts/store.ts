import { db } from '@/lib/db';
import { ALERT_RETENTION_DAYS } from './detect';

/** Toutes les clés déjà envoyées. Lève si la table est absente (migration non jouée). */
export async function loadSentKeys(): Promise<Set<string>> {
    const res = await db.execute(`SELECT "key" FROM "ScheduledAlert"`);
    return new Set(res.rows.map(row => row.key as string));
}

/**
 * Réserve les clés avant l'envoi : seules celles que CE run a insérées lui reviennent,
 * ce qui empêche deux exécutions simultanées d'envoyer deux fois la même alerte.
 */
export async function claimKeys(keys: string[]): Promise<string[]> {
    if (keys.length === 0) return [];
    const results = await db.batch(
        keys.map(key => ({ sql: `INSERT OR IGNORE INTO "ScheduledAlert" ("key") VALUES (?)`, args: [key] })),
        'write',
    );
    return keys.filter((_, i) => results[i].rowsAffected > 0);
}

export async function deleteKeys(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await db.batch(
        keys.map(key => ({ sql: `DELETE FROM "ScheduledAlert" WHERE "key" = ?`, args: [key] })),
        'write',
    );
}

/**
 * Supprime les clés plus vieilles que la rétention, sauf celles dont la condition est
 * toujours vraie (`activeKeys`) : les purger relancerait l'alerte. Retourne leur nombre.
 */
export async function purgeOldAlerts(activeKeys: ReadonlySet<string>): Promise<number> {
    const res = await db.execute({
        sql: `SELECT "key" FROM "ScheduledAlert" WHERE "sentAt" < datetime('now', ?)`,
        args: [`-${ALERT_RETENTION_DAYS} days`],
    });
    const expired = res.rows.map(row => row.key as string).filter(key => !activeKeys.has(key));
    await deleteKeys(expired);
    return expired.length;
}
