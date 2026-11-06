/**
 * Recopie prod → démo, partagée entre le cron de 23h59 et le bouton réservé au
 * SUPER_ADMIN (`POST /api/demo/refresh`) : remplace la base démo par une copie de la
 * prod, puis vide les fichiers R2 de démo (`demo/`).
 *
 * Côté prod : uniquement des `SELECT` paginés. Le verrou vit donc dans la base démo,
 * dans une table que `cloneDatabase` ne supprime jamais.
 *
 * Bail de 6 min, supérieur au `maxDuration` de 5 min des deux routes appelantes : un
 * verrou expiré vient forcément d'une fonction tuée, et la recopie suivante le reprend.
 *
 * Ne lève jamais : tout échec est journalisé (`[demo] …`) et renvoyé dans le résultat.
 */
import type { Client } from '@libsql/client';
import { demoDb, prodDb } from '@/lib/db';
import { purgeDemoObjects } from '@/lib/r2';
import { getErrorMessage } from '@/lib/utils/error';
import { cloneDatabase, DEMO_REFRESH_LOCK_TABLE } from './cloneDatabase';
import { isDemoDbSameAsProd } from './readOnly';

export const DEMO_REFRESH_LEASE_MS = 6 * 60 * 1000;

export type DemoRefreshResult =
    | { status: 'not-configured' }
    | { status: 'locked' }
    | { status: 'failed' }
    /** `purged` : fichiers R2 de démo supprimés, `null` si la purge a échoué. */
    | { status: 'ok'; tables: number; rows: number; durationMs: number; purged: number | null };

/** Prend le verrou en une requête atomique. Renvoie sa date de prise, ou `null` s'il est tenu. */
async function acquireLock(client: Client): Promise<string | null> {
    await client.execute(`CREATE TABLE IF NOT EXISTS "${DEMO_REFRESH_LOCK_TABLE}" (
        "id"        INTEGER PRIMARY KEY CHECK ("id" = 1),
        "startedAt" TEXT NOT NULL
    )`);
    const now = Date.now();
    const startedAt = new Date(now).toISOString();
    const res = await client.execute({
        sql: `INSERT INTO "${DEMO_REFRESH_LOCK_TABLE}" (id, startedAt) VALUES (1, ?)
              ON CONFLICT(id) DO UPDATE SET startedAt = excluded.startedAt WHERE startedAt < ?`,
        args: [startedAt, new Date(now - DEMO_REFRESH_LEASE_MS).toISOString()],
    });
    return res.rowsAffected > 0 ? startedAt : null;
}

/** Libère le verrou s'il est encore le nôtre. Un échec est journalisé : le bail expirera. */
async function releaseLock(client: Client, startedAt: string): Promise<void> {
    try {
        await client.execute({
            sql: `DELETE FROM "${DEMO_REFRESH_LOCK_TABLE}" WHERE id = 1 AND startedAt = ?`,
            args: [startedAt],
        });
    } catch (e: unknown) {
        console.error('[demo] verrou de recopie non libéré :', getErrorMessage(e));
    }
}

async function cloneAndPurge(target: Client): Promise<DemoRefreshResult> {
    const started = Date.now();
    let summary: Awaited<ReturnType<typeof cloneDatabase>> | null = null;
    try {
        summary = await cloneDatabase(prodDb, target);
        console.log(`[demo] base démo recopiée depuis la prod : ${summary.tables} table(s), ${summary.rows} ligne(s) en ${summary.durationMs} ms`);
    } catch (e: unknown) {
        console.error(`[demo] recopie de la base démo impossible après ${Date.now() - started} ms :`, getErrorMessage(e));
    }
    // Fichiers écrits en démo (préfixe R2 `demo/`) : vidés avec la base, même après un
    // échec de recopie, sans jamais toucher une vraie clé.
    let purged: number | null = null;
    try {
        purged = await purgeDemoObjects();
        console.log(`[demo] ${purged} fichier(s) R2 de démo supprimé(s)`);
    } catch (e: unknown) {
        console.error('[demo] purge des fichiers R2 de démo impossible :', getErrorMessage(e));
    }
    return summary ? { status: 'ok', ...summary, purged } : { status: 'failed' };
}

export async function refreshDemoDatabase(): Promise<DemoRefreshResult> {
    // Garde-fou : une URL démo égale à la prod ferait supprimer toutes les tables de la prod.
    if (isDemoDbSameAsProd()) {
        console.error('[demo] recopie refusée : TURSO_DEMO_DATABASE_URL désigne la base de production');
        return { status: 'not-configured' };
    }
    if (!demoDb) return { status: 'not-configured' };

    let lock: string | null;
    try {
        lock = await acquireLock(demoDb);
    } catch (e: unknown) {
        console.error('[demo] recopie de la base démo impossible (verrou) :', getErrorMessage(e));
        return { status: 'failed' };
    }
    if (!lock) {
        console.log('[demo] recopie ignorée : une recopie est déjà en cours');
        return { status: 'locked' };
    }

    try {
        return await cloneAndPurge(demoDb);
    } finally {
        await releaseLock(demoDb, lock);
    }
}
