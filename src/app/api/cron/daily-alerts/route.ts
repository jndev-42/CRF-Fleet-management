import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { unauthorizedResponse } from '@/lib/apiAuth';
import { getErrorMessage } from '@/lib/utils/error';
import { parisToday } from '@/lib/themes/catalog';
import {
    activeAlertKeys,
    buildDesinfMessage,
    buildStockDigestTitle,
    buildStockDigestMessage,
    detectDesinfAlerts,
    detectStockDigests,
    isLow,
    normalizeDay,
    restrictDigest,
    staleItemLowKeys,
    type DesinfVehicle,
    type StockBatch,
    type StockItem,
} from '@/lib/alerts/detect';
import { claimKeys, deleteKeys, loadSentKeys, purgeOldAlerts } from '@/lib/alerts/store';

/** Libère des clés réservées sans jamais lever (appelé depuis un catch). */
async function releaseQuietly(keys: string[]): Promise<void> {
    try {
        await deleteKeys(keys);
    } catch (e: unknown) {
        console.error('[daily-alerts] libération des clés impossible :', getErrorMessage(e));
    }
}

// Route sécurisée par Vercel Cron (CRON_SECRET), sans auth NextAuth.
export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return unauthorizedResponse();
    }

    try {
        const today = parisToday();

        // Première lecture de la table : si elle est absente, on échoue (500) AVANT tout envoi.
        const sentKeys = await loadSentKeys();

        const vehiclesRes = await db.execute(`
            SELECT id, name, ulId, nextDesinfMaxDate
            FROM "Vehicle"
            WHERE desinfTracking = 1 AND nextDesinfMaxDate IS NOT NULL AND ulId IS NOT NULL AND ulId != 'default'
        `);
        const vehicles: DesinfVehicle[] = vehiclesRes.rows.flatMap(row => {
            const nextDesinfMaxDate = normalizeDay(row.nextDesinfMaxDate);
            return nextDesinfMaxDate
                ? [{ id: row.id as string, name: row.name as string, ulId: row.ulId as string, nextDesinfMaxDate }]
                : [];
        });

        const batchesRes = await db.execute(`
            SELECT b.id AS batchId, b.itemId, i.name AS itemName, i.ulId, b.expiryDate
            FROM "InvBatch" b
            JOIN "InvItem" i ON b.itemId = i.id
            WHERE b.quantity > 0 AND b.expiryDate IS NOT NULL AND i.ulId IS NOT NULL AND i.ulId != 'default'
        `);
        const batches: StockBatch[] = batchesRes.rows.flatMap(row => {
            const expiryDate = normalizeDay(row.expiryDate);
            return expiryDate
                ? [{
                    batchId: row.batchId as string,
                    itemId: row.itemId as string,
                    itemName: row.itemName as string,
                    ulId: row.ulId as string,
                    expiryDate,
                }]
                : [];
        });

        const itemsRes = await db.execute(`
            SELECT id, name, ulId, quantity, minStock
            FROM "InvItem"
            WHERE minStock IS NOT NULL AND ulId IS NOT NULL AND ulId != 'default'
        `);
        const items: StockItem[] = itemsRes.rows.map(row => ({
            id: row.id as string,
            name: row.name as string,
            ulId: row.ulId as string,
            quantity: Number(row.quantity),
            minStock: Number(row.minStock),
        }));

        // Un produit repassé au-dessus de son minimum (ou supprimé) perd sa clé :
        // la prochaine chute sous le minimum déclenchera une nouvelle alerte.
        const lowItemIds = new Set(items.filter(isLow).map(item => item.id));
        const stale = staleItemLowKeys(sentKeys, lowItemIds);
        await deleteKeys(stale);
        stale.forEach(key => sentKeys.delete(key));

        const ulRes = await db.execute(`SELECT id, name FROM "UniteLocale"`);
        const ulNames = new Map(ulRes.rows.map(row => [row.id as string, row.name as string]));

        const { sendPushNotification } = await import('@/lib/push');
        let desinfAlerts = 0;
        let stockDigests = 0;

        // Isolation par véhicule : une erreur n'empêche pas les autres.
        for (const alert of detectDesinfAlerts(vehicles, today, sentKeys)) {
            let claimed: string[] = [];
            try {
                claimed = await claimKeys([alert.key]);
                if (claimed.length === 0) continue;
                const { title, message } = buildDesinfMessage(alert);
                const sent = await sendPushNotification({
                    roles: ['ADMIN', 'CHVPSP'],
                    headings: { fr: title, en: title },
                    contents: { fr: message, en: message },
                    url: `/vehicles/${encodeURIComponent(alert.vehicle.name)}`,
                    ulId: alert.vehicle.ulId,
                });
                if (sent === false) {
                    await deleteKeys(claimed);
                    continue;
                }
                desinfAlerts++;
            } catch (e: unknown) {
                await releaseQuietly(claimed);
                console.error('[daily-alerts] désinfection ignorée', alert.vehicle.id, getErrorMessage(e));
            }
        }

        // Isolation par UL.
        for (const digest of detectStockDigests(batches, items, today, sentKeys)) {
            let claimed: string[] = [];
            try {
                claimed = await claimKeys(digest.keys);
                if (claimed.length === 0) continue;
                const mine = restrictDigest(digest, new Set(claimed));
                const title = buildStockDigestTitle(ulNames.get(digest.ulId) ?? null);
                const message = buildStockDigestMessage(mine);
                const sent = await sendPushNotification({
                    roles: ['ADMIN'],
                    headings: { fr: title, en: title },
                    contents: { fr: message, en: message },
                    url: '/inventory',
                    ulId: digest.ulId,
                });
                if (sent === false) {
                    await deleteKeys(claimed);
                    continue;
                }
                stockDigests++;
            } catch (e: unknown) {
                await releaseQuietly(claimed);
                console.error('[daily-alerts] résumé de stock ignoré', digest.ulId, getErrorMessage(e));
            }
        }

        try {
            await purgeOldAlerts(activeAlertKeys(vehicles, batches, items, today));
        } catch (e: unknown) {
            console.error('[daily-alerts] purge impossible :', getErrorMessage(e));
        }

        return NextResponse.json({ success: true, desinfAlerts, stockDigests });
    } catch (error: unknown) {
        console.error('Error daily alerts:', getErrorMessage(error));
        return NextResponse.json({ success: false, error: 'Cron Failed' }, { status: 500 });
    }
}
