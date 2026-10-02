/**
 * Tests d'intégration — journal d'audit.
 *
 *  GET /api/audit-logs   SUPER_ADMIN — plus récentes d'abord, filtre personne,
 *                        pagination par curseur, fenêtre de 30 jours
 *  recordAudit / purgeAuditLogs sur la vraie base
 */
import { vi, describe, it, expect } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/auth';
import { db } from './setup';
import { GET } from '@/app/api/audit-logs/route';
import { purgeAuditLogs, recordAudit } from '@/lib/audit/log';

const mockedAuth = vi.mocked(auth as unknown as () => Promise<unknown>);

const DAY = 24 * 60 * 60 * 1000;

function asSuperAdmin() {
    mockedAuth.mockResolvedValue({ user: { id: 'sa', email: 'super@croix-rouge.fr', roles: ['SUPER_ADMIN'] } });
}

async function seed(id: string, actorEmail: string, ageMs: number, status = 200) {
    await db.execute({
        sql: `INSERT INTO "AuditLog" (id, createdAt, actorEmail, method, path, action, entityType, entityId, status)
              VALUES (?, ?, ?, 'DELETE', ?, ?, 'vehicle', ?, ?)`,
        args: [id, new Date(Date.now() - ageMs).toISOString(), actorEmail, `/api/vehicles/${id}`, "Suppression d'un véhicule", id, status],
    });
}

function get(query = '') {
    return GET(new Request(`http://localhost/api/audit-logs${query}`));
}

describe('GET /api/audit-logs', () => {
    it('401 sans session', async () => {
        mockedAuth.mockResolvedValue(null);
        expect((await get()).status).toBe(401);
    });

    it('403 pour un ADMIN', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'a', email: 'admin@croix-rouge.fr', roles: ['ADMIN'] } });
        expect((await get()).status).toBe(403);
    });

    it('403 pour un SUPER_ADMIN inactif', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'a', email: 'super@croix-rouge.fr', roles: ['SUPER_ADMIN', 'INACTIF'] } });
        expect((await get()).status).toBe(403);
    });

    it.each([
        ['?limit=5000', 'limite'],
        ['?limit=0', 'limite'],
        ['?before=hier', 'before'],
        ['?userEmail=pas-un-email', 'e-mail'],
    ])('400 Zod pour %s', async (query, word) => {
        asSuperAdmin();
        const res = await get(query);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBe('Paramètres invalides');
        expect(JSON.stringify(body.details).toLowerCase()).toContain(word);
    });

    it('renvoie les entrées les plus récentes en premier, au plus 50 par défaut', async () => {
        asSuperAdmin();
        for (let i = 0; i < 55; i++) await seed(`v${i}`, 'a@croix-rouge.fr', i * 60_000);
        const res = await get();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.entries).toHaveLength(50);
        expect(body.entries[0].id).toBe('v0');
        expect(body.entries[49].id).toBe('v49');
        expect(body.nextBefore).toBe(body.entries[49].createdAt);

        const next = await (await get(`?before=${encodeURIComponent(body.nextBefore)}`)).json();
        expect(next.entries.map((e: { id: string }) => e.id)).toEqual(['v50', 'v51', 'v52', 'v53', 'v54']);
        expect(next.nextBefore).toBeNull();
    });

    it('filtre sur une personne', async () => {
        asSuperAdmin();
        await seed('a1', 'a@croix-rouge.fr', 3000);
        await seed('b1', 'b@croix-rouge.fr', 2000);
        await seed('a2', 'a@croix-rouge.fr', 1000, 403);
        const body = await (await get('?userEmail=A@croix-rouge.fr&limit=10')).json();
        expect(body.entries.map((e: { id: string }) => e.id)).toEqual(['a2', 'a1']);
        expect(body.entries[0].status).toBe(403);
    });

    it('le filtre inclut les actions faites « en tant que » la personne', async () => {
        asSuperAdmin();
        await seed('own', 'x@croix-rouge.fr', 2000);
        await seed('other', 'b@croix-rouge.fr', 1500);
        await db.execute({
            sql: `INSERT INTO "AuditLog" (id, createdAt, actorEmail, impersonatedEmail, method, path, action, status, ip)
                  VALUES ('as-x', ?, 'super@croix-rouge.fr', 'x@croix-rouge.fr', 'POST', '/api/trips', 'Prise', 201, '203.0.113.7')`,
            args: [new Date(Date.now() - 1000).toISOString()],
        });
        const body = await (await get('?userEmail=x@croix-rouge.fr')).json();
        expect(body.entries.map((e: { id: string }) => e.id)).toEqual(['as-x', 'own']);
        expect(body.entries[0]).toMatchObject({ actorEmail: 'super@croix-rouge.fr', impersonatedEmail: 'x@croix-rouge.fr', ip: '203.0.113.7' });
    });

    it('`?limit=` vide prend la valeur par défaut', async () => {
        asSuperAdmin();
        expect((await get('?limit=')).status).toBe(200);
    });

    it("n'expose rien au-delà de 30 jours, même avant la purge", async () => {
        asSuperAdmin();
        await seed('recent', 'a@croix-rouge.fr', 29 * DAY);
        await seed('old', 'a@croix-rouge.fr', 31 * DAY);
        const body = await (await get()).json();
        expect(body.entries.map((e: { id: string }) => e.id)).toEqual(['recent']);
    });
});

describe('recordAudit / purgeAuditLogs (vraie base)', () => {
    it('recordAudit écrit une ligne lisible par la route', async () => {
        asSuperAdmin();
        await recordAudit({
            actorEmail: 'super@croix-rouge.fr', impersonatedEmail: 'x@croix-rouge.fr',
            method: 'POST', path: '/api/trips', action: "Prise d'un véhicule", entityType: 'trip', status: 201,
        });
        const body = await (await get()).json();
        expect(body.entries).toHaveLength(1);
        expect(body.entries[0]).toMatchObject({
            actorEmail: 'super@croix-rouge.fr', impersonatedEmail: 'x@croix-rouge.fr',
            action: "Prise d'un véhicule", status: 201,
        });
    });

    it('la purge supprime les lignes de plus de 30 jours et garde les autres', async () => {
        await seed('keep', 'a@croix-rouge.fr', 29 * DAY);
        await seed('drop', 'a@croix-rouge.fr', 31 * DAY);
        await expect(purgeAuditLogs()).resolves.toBe(1);
        const rows = await db.execute(`SELECT id FROM "AuditLog"`);
        expect(rows.rows.map(r => r.id)).toEqual(['keep']);
    });
});
