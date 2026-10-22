/**
 * Tests d'intégration — GET /api/cron/daily-alerts.
 * Route déclenchée par Vercel Cron, sécurisée par CRON_SECRET (pas de NextAuth).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/lib/push', () => ({ sendPushNotification: vi.fn().mockResolvedValue(true) }));

import { GET } from '@/app/api/cron/daily-alerts/route';
import { sendPushNotification } from '@/lib/push';
import { parisToday } from '@/lib/themes/catalog';
import { addDays } from '@/lib/alerts/detect';
import { SCHEDULED_ALERT_DDL } from '@/lib/alerts/schema';
import { db, seedVehicle, seedInvItem, seedInvBatch, seedUniteLocale } from './setup';

const mockedPush = vi.mocked(sendPushNotification);
const today = () => parisToday();

function makeRequest(secret?: string): Request {
    return new Request('http://localhost/api/cron/daily-alerts', {
        headers: secret ? { authorization: `Bearer ${secret}` } : {},
    });
}

async function sentKeys(): Promise<string[]> {
    const res = await db.execute(`SELECT "key" FROM "ScheduledAlert" ORDER BY "key"`);
    return res.rows.map(r => r.key as string);
}

describe('GET /api/cron/daily-alerts', () => {
    const savedSecret = process.env.CRON_SECRET;

    beforeEach(() => {
        mockedPush.mockClear();
        mockedPush.mockResolvedValue(true);
        delete process.env.CRON_SECRET;
    });
    afterEach(() => {
        if (savedSecret === undefined) delete process.env.CRON_SECRET;
        else process.env.CRON_SECRET = savedSecret;
    });

    it('401 si CRON_SECRET est défini et l\'en-tête est faux', async () => {
        process.env.CRON_SECRET = 'secret';
        expect((await GET(makeRequest('mauvais'))).status).toBe(401);
        expect(mockedPush).not.toHaveBeenCalled();
    });

    it('200 sans notification quand rien n\'est à signaler', async () => {
        process.env.CRON_SECRET = 'secret';
        const res = await GET(makeRequest('secret'));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true, desinfAlerts: 0, stockDigests: 0 });
        expect(mockedPush).not.toHaveBeenCalled();
    });

    it('désinfection J-10 : une notification ADMIN + CHVPSP de l\'UL, puis rien le lendemain', async () => {
        await seedVehicle({ id: 'v1', name: 'VPSP 182', type: 'VPSP', desinfTracking: 1, nextDesinfMaxDate: addDays(today(), 10) });

        const res = await GET(makeRequest());
        expect(await res.json()).toEqual({ success: true, desinfAlerts: 1, stockDigests: 0 });
        expect(mockedPush).toHaveBeenCalledTimes(1);
        expect(mockedPush.mock.calls[0][0]).toMatchObject({
            roles: ['ADMIN', 'CHVPSP'],
            ulId: 'ul-paris-18',
            url: `/vehicles/${encodeURIComponent('VPSP 182')}`,
        });

        mockedPush.mockClear();
        expect(await (await GET(makeRequest())).json()).toMatchObject({ desinfAlerts: 0 });
        expect(mockedPush).not.toHaveBeenCalled();
    });

    it('désinfection dépassée après « bientôt due » : une notification « dépassée »', async () => {
        const date = addDays(today(), -1);
        await seedVehicle({ id: 'v1', name: 'VPSP 182', type: 'VPSP', desinfTracking: 1, nextDesinfMaxDate: date });
        await db.execute({ sql: `INSERT INTO "ScheduledAlert" ("key") VALUES (?)`, args: [`desinf-soon:v1:${date}`] });

        await GET(makeRequest());
        expect(mockedPush).toHaveBeenCalledTimes(1);
        expect(mockedPush.mock.calls[0][0].headings.fr).toContain('dépassée');
        expect(await sentKeys()).toContain(`desinf-overdue:v1:${date}`);
    });

    it('désinfection déjà dépassée à la première détection : seule « dépassée » part', async () => {
        await seedVehicle({ id: 'v1', name: 'VPSP 182', type: 'VPSP', desinfTracking: 1, nextDesinfMaxDate: addDays(today(), -5) });
        await GET(makeRequest());
        expect(mockedPush).toHaveBeenCalledTimes(1);
        expect((await sentKeys()).filter(k => k.startsWith('desinf-soon'))).toEqual([]);
    });

    it('nouvelle échéance (+3 mois) : aucune alerte avant J-14', async () => {
        await seedVehicle({ id: 'v1', name: 'VPSP 182', type: 'VPSP', desinfTracking: 1, nextDesinfMaxDate: addDays(today(), 90) });
        await GET(makeRequest());
        expect(mockedPush).not.toHaveBeenCalled();
    });

    it('véhicule non suivi : rien', async () => {
        await seedVehicle({ id: 'v1', desinfTracking: 0, nextDesinfMaxDate: addDays(today(), -3) });
        await GET(makeRequest());
        expect(mockedPush).not.toHaveBeenCalled();
    });

    it('stock : un résumé par UL, limité aux ADMIN de l\'UL', async () => {
        await seedInvItem({ id: 'ia', name: 'Compresses', ulId: 'ul-a', quantity: 1, minStock: 5 });
        await seedInvBatch({ id: 'ba1', itemId: 'ia', expiryDate: addDays(today(), 10) });
        await seedInvBatch({ id: 'ba2', itemId: 'ia', expiryDate: addDays(today(), -2) });
        await seedInvItem({ id: 'ib', name: 'Gants', ulId: 'ul-b', quantity: 9 });
        await seedInvBatch({ id: 'bb1', itemId: 'ib', expiryDate: addDays(today(), 5) });
        await seedInvBatch({ id: 'bb2', itemId: 'ib', quantity: 0, expiryDate: addDays(today(), 5) });

        const res = await GET(makeRequest());
        expect(await res.json()).toEqual({ success: true, desinfAlerts: 0, stockDigests: 2 });
        const calls = mockedPush.mock.calls.map(c => c[0]);
        expect(calls.map(c => c.ulId).sort()).toEqual(['ul-a', 'ul-b']);
        for (const call of calls) {
            expect(call.roles).toEqual(['ADMIN']);
            expect(call.url).toBe('/inventory');
        }
        const a = calls.find(c => c.ulId === 'ul-a')!;
        expect(a.contents.fr).toContain('1 lot bientôt périmé, 1 lot périmé, 1 produit sous le stock minimum');
        expect(calls.find(c => c.ulId === 'ul-b')!.contents.fr).toContain('1 lot bientôt périmé');

        mockedPush.mockClear();
        await GET(makeRequest());
        expect(mockedPush).not.toHaveBeenCalled();
    });

    it('stock : le titre du résumé porte le nom de l\'UL', async () => {
        await seedUniteLocale({ id: 'ul-a', name: 'Paris 18', slug: 'paris-18' });
        await seedInvItem({ id: 'ia', name: 'Compresses', ulId: 'ul-a', quantity: 1, minStock: 5 });
        await GET(makeRequest());
        expect(mockedPush.mock.calls[0][0].headings.fr).toBe('Inventaire : alertes du jour (Paris 18)');
    });

    it('véhicule sans UL et produit d\'UL « default » : aucune notification', async () => {
        await seedVehicle({ id: 'v1', desinfTracking: 1, nextDesinfMaxDate: addDays(today(), 3), ulId: null });
        await seedVehicle({ id: 'v2', name: 'V2', desinfTracking: 1, nextDesinfMaxDate: addDays(today(), 3), ulId: 'default' });
        await seedInvItem({ id: 'id1', ulId: 'default', quantity: 0, minStock: 5 });
        await seedInvBatch({ id: 'bd1', itemId: 'id1', expiryDate: addDays(today(), -1) });
        await seedInvItem({ id: 'in1', ulId: null, quantity: 0, minStock: 5 });
        expect(await (await GET(makeRequest())).json()).toEqual({ success: true, desinfAlerts: 0, stockDigests: 0 });
        expect(mockedPush).not.toHaveBeenCalled();
    });

    it('dates illisibles ignorées (chaîne vide, datetime ISO accepté)', async () => {
        await seedVehicle({ id: 'v1', name: 'V1', desinfTracking: 1, nextDesinfMaxDate: '' });
        await seedVehicle({ id: 'v2', name: 'V2', desinfTracking: 1, nextDesinfMaxDate: `${addDays(today(), 3)}T08:00:00.000Z` });
        expect(await (await GET(makeRequest())).json()).toMatchObject({ desinfAlerts: 1 });
        expect(await sentKeys()).toEqual([`desinf-soon:v2:${addDays(today(), 3)}`]);
    });

    it('deux exécutions simultanées : une seule notification', async () => {
        await seedVehicle({ id: 'v1', desinfTracking: 1, nextDesinfMaxDate: addDays(today(), 3) });
        await seedInvItem({ id: 'ia', ulId: 'ul-a', quantity: 0, minStock: 5 });
        await Promise.all([GET(makeRequest()), GET(makeRequest())]);
        expect(mockedPush).toHaveBeenCalledTimes(2); // 1 désinfection + 1 résumé, pas 4
    });

    it('stock réapprovisionné puis retombé : nouvelle alerte', async () => {
        await seedInvItem({ id: 'ia', name: 'Compresses', ulId: 'ul-a', quantity: 1, minStock: 5 });
        await GET(makeRequest());
        expect(mockedPush).toHaveBeenCalledTimes(1);
        expect(await sentKeys()).toContain('item-low:ia');

        await db.execute(`UPDATE "InvItem" SET quantity = 10 WHERE id = 'ia'`);
        mockedPush.mockClear();
        await GET(makeRequest());
        expect(mockedPush).not.toHaveBeenCalled();
        expect(await sentKeys()).not.toContain('item-low:ia');

        await db.execute(`UPDATE "InvItem" SET quantity = 1 WHERE id = 'ia'`);
        await GET(makeRequest());
        expect(mockedPush).toHaveBeenCalledTimes(1);
    });

    it('envoi en échec : la clé n\'est pas enregistrée (nouvel essai le lendemain)', async () => {
        await seedVehicle({ id: 'v1', desinfTracking: 1, nextDesinfMaxDate: addDays(today(), 3) });
        mockedPush.mockResolvedValueOnce(false);
        expect(await (await GET(makeRequest())).json()).toMatchObject({ desinfAlerts: 0 });
        expect(await sentKeys()).toEqual([]);
        await GET(makeRequest());
        expect(await sentKeys()).toHaveLength(1);
    });

    it('une erreur sur un véhicule n\'empêche pas les autres', async () => {
        await seedVehicle({ id: 'v1', name: 'V1', desinfTracking: 1, nextDesinfMaxDate: addDays(today(), 3) });
        await seedVehicle({ id: 'v2', name: 'V2', desinfTracking: 1, nextDesinfMaxDate: addDays(today(), 4) });
        mockedPush.mockRejectedValueOnce(new Error('boom'));
        expect(await (await GET(makeRequest())).json()).toMatchObject({ desinfAlerts: 1 });
    });

    it('purge les clés de plus de 400 jours', async () => {
        await db.execute(`INSERT INTO "ScheduledAlert" ("key", "sentAt") VALUES ('vieux', datetime('now', '-401 days')), ('recent', datetime('now', '-399 days'))`);
        await GET(makeRequest());
        expect(await sentKeys()).toEqual(['recent']);
    });

    it('ne purge pas une clé ancienne dont la condition est toujours vraie', async () => {
        await seedInvItem({ id: 'ia', ulId: 'ul-a', quantity: 0, minStock: 5 });
        await db.execute(`INSERT INTO "ScheduledAlert" ("key", "sentAt") VALUES ('item-low:ia', datetime('now', '-500 days'))`);
        await GET(makeRequest());
        expect(mockedPush).not.toHaveBeenCalled();
        expect(await sentKeys()).toEqual(['item-low:ia']);
    });

    it('500 sans notification si la table est absente', async () => {
        await seedVehicle({ id: 'v1', desinfTracking: 1, nextDesinfMaxDate: addDays(today(), 3) });
        await db.execute(`DROP TABLE "ScheduledAlert"`);
        try {
            const res = await GET(makeRequest());
            expect(res.status).toBe(500);
            expect(mockedPush).not.toHaveBeenCalled();
        } finally {
            await db.execute(SCHEDULED_ALERT_DDL);
        }
    });
});
