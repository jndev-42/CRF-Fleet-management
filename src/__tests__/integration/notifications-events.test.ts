/**
 * Tests d'intégration — notifications d'événements (réservations, incidents).
 *
 * `@/lib/push` n'est PAS mocké : on vérifie les lignes `Notification` réellement créées
 * (VAPID absent → pas d'envoi push, la phase in-app suffit à vérifier ciblage et dédoublonnage).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { POST as postReservation } from '@/app/api/vehicles/[id]/reservations/route';
import { PATCH as patchReservation, DELETE as deleteReservation } from '@/app/api/reservations/[id]/route';
import { PATCH as patchRecurrence, DELETE as deleteRecurrence } from '@/app/api/reservations/recurrence/[groupId]/route';
import { POST as postIncident } from '@/app/api/incidents/route';
import { PATCH as patchIncident } from '@/app/api/incidents/[id]/route';
import { auth } from '@/auth';
import { db, seedRoles, seedUser, seedUserRole, seedUserUL, seedVehicle, seedIncident } from './setup';

const mockedAuth = vi.mocked(auth);

const HOUR = 60 * 60 * 1000;
const iso = (offsetHours: number) => new Date(Date.now() + offsetHours * HOUR).toISOString();

async function notifsFor(userId: string) {
    const r = await db.execute({ sql: `SELECT title, message, url, ulId FROM "Notification" WHERE userId = ?`, args: [userId] });
    return r.rows;
}

async function seedReservation(overrides: Partial<{
    id: string; userEmail: string; userName: string; startTime: string; endTime: string; status: string; recurrenceGroupId: string | null;
}> = {}) {
    const r = {
        id: 'res-1', userEmail: 'chvl@dev.local', userName: 'Chauffeur Test',
        startTime: iso(24), endTime: iso(26), status: 'PENDING', recurrenceGroupId: null as string | null,
        ...overrides,
    };
    await db.execute({
        sql: `INSERT INTO "Reservation" (id, vehicleId, userEmail, userName, startTime, endTime, status, recurrenceGroupId) VALUES (?,?,?,?,?,?,?,?)`,
        args: [r.id, 'VL001', r.userEmail, r.userName, r.startTime, r.endTime, r.status, r.recurrenceGroupId],
    });
    return r;
}

beforeEach(async () => {
    await seedRoles();
    await db.execute(`INSERT OR IGNORE INTO "UniteLocale" (id, name, slug) VALUES ('ul-paris-18', 'Paris 18', 'ul-paris-18')`);
    await seedVehicle({ id: 'VL001', name: 'VL 186' });
    await seedUser({ id: 'user-chvl', email: 'chvl@dev.local', name: 'Chauffeur Test' });
    await seedUser({ id: 'user-admin', email: 'admin@dev.local', name: 'Admin Test' });
    await seedUser({ id: 'user-pres', email: 'pres@dev.local', name: 'Président Test' });
    await seedUser({ id: 'user-cadre', email: 'cadre@dev.local', name: 'Cadre Test' });
    await seedUserRole('user-admin', 'ADMIN');
    await seedUserUL({ userId: 'user-admin', ulId: 'ul-paris-18', roles: ['ADMIN'] });
    await seedUserRole('user-pres', 'PRESIDENT');
    await seedUserUL({ userId: 'user-pres', ulId: 'ul-paris-18', roles: ['PRESIDENT'] });
    await seedUserRole('user-cadre', 'CADRE');
    await seedUserUL({ userId: 'user-cadre', ulId: 'ul-paris-18', roles: ['CADRE'] });
});

function asUser(email: string, id: string, roles: string[], name = 'Test') {
    mockedAuth.mockResolvedValue({ user: { id, email, name, roles } } as never);
}

describe('POST /api/vehicles/[id]/reservations — demande en attente', () => {
    it('un utilisateur cumulant ADMIN et PRESIDENT ne reçoit qu\'une notification, avec un lien relatif', async () => {
        await seedUserRole('user-admin', 'PRESIDENT');
        await seedUserUL({ userId: 'user-admin', ulId: 'ul-paris-18', roles: ['ADMIN', 'PRESIDENT'] });
        asUser('chvl@dev.local', 'user-chvl', ['CHVL'], 'Chauffeur Test');

        const res = await postReservation(
            new Request('http://localhost/api/vehicles/VL001/reservations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ startTime: iso(24), endTime: iso(26) }),
            }),
            { params: Promise.resolve({ id: 'VL001' }) },
        );
        expect(res.status).toBe(201);

        const adminNotifs = await notifsFor('user-admin');
        expect(adminNotifs).toHaveLength(1);
        expect(adminNotifs[0].url).toBe('/vehicles/VL%20186');
        expect(await notifsFor('user-pres')).toHaveLength(1);
        expect(await notifsFor('user-cadre')).toHaveLength(1);
    });

    it('récurrence en attente : une seule notification par responsable', async () => {
        await seedUserRole('user-admin', 'PRESIDENT');
        await seedUserUL({ userId: 'user-admin', ulId: 'ul-paris-18', roles: ['ADMIN', 'PRESIDENT'] });
        asUser('chvl@dev.local', 'user-chvl', ['CHVL'], 'Chauffeur Test');

        const res = await postReservation(
            new Request('http://localhost/api/vehicles/VL001/reservations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    startTime: iso(24), endTime: iso(26),
                    recurrence: {
                        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
                        startHour: '09:00',
                        endHour: '11:00',
                        firstOccurrenceDate: iso(24 * 2).slice(0, 10),
                        recurrenceEndDate: iso(24 * 5).slice(0, 10),
                    },
                }),
            }),
            { params: Promise.resolve({ id: 'VL001' }) },
        );
        expect(res.status).toBe(201);

        const notifs = await notifsFor('user-admin');
        expect(notifs).toHaveLength(1);
        expect(notifs[0].url).toBe('/vehicles/VL%20186');
    });
});

describe('PATCH /api/reservations/[id] — validation', () => {
    it('notifie le demandeur (lien relatif)', async () => {
        await seedReservation();
        asUser('admin@dev.local', 'user-admin', ['ADMIN']);

        const res = await patchReservation(new Request('http://localhost/api/reservations/res-1', { method: 'PATCH' }), { params: Promise.resolve({ id: 'res-1' }) });
        expect(res.status).toBe(200);

        const notifs = await notifsFor('user-chvl');
        expect(notifs).toHaveLength(1);
        expect(notifs[0].title).toBe('✅ Réservation validée');
        expect(notifs[0].url).toBe('/vehicles/VL%20186');
    });

    it('ne notifie pas le validateur quand il valide sa propre réservation', async () => {
        await seedReservation({ userEmail: 'admin@dev.local', userName: 'Admin Test' });
        asUser('admin@dev.local', 'user-admin', ['ADMIN']);

        const res = await patchReservation(new Request('http://localhost/api/reservations/res-1', { method: 'PATCH' }), { params: Promise.resolve({ id: 'res-1' }) });
        expect(res.status).toBe(200);
        expect(await notifsFor('user-admin')).toHaveLength(0);
    });

    it('route réussie même si le demandeur n\'a pas de compte User', async () => {
        await seedReservation({ userEmail: 'inconnu@dev.local' });
        asUser('admin@dev.local', 'user-admin', ['ADMIN']);
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        const res = await patchReservation(new Request('http://localhost/api/reservations/res-1', { method: 'PATCH' }), { params: Promise.resolve({ id: 'res-1' }) });
        expect(res.status).toBe(200);
        const all = await db.execute(`SELECT id FROM "Notification"`);
        expect(all.rows).toHaveLength(0);
    });
});

describe('DELETE /api/reservations/[id] — annulation', () => {
    const del = () => deleteReservation(new Request('http://localhost/api/reservations/res-1', { method: 'DELETE' }), { params: Promise.resolve({ id: 'res-1' }) });

    it('notifie le demandeur quand un responsable supprime une réservation future', async () => {
        await seedReservation({ status: 'VALIDATED' });
        asUser('admin@dev.local', 'user-admin', ['ADMIN']);

        expect((await del()).status).toBe(200);

        const notifs = await notifsFor('user-chvl');
        expect(notifs).toHaveLength(1);
        expect(notifs[0].title).toBe('❌ Réservation annulée');
        expect(notifs[0].message).toContain('VL 186');
        expect(notifs[0].url).toBe('/vehicles/VL%20186');
    });

    it('ne notifie pas quand le demandeur supprime la sienne', async () => {
        await seedReservation();
        asUser('chvl@dev.local', 'user-chvl', ['CHVL']);

        expect((await del()).status).toBe(200);
        expect(await notifsFor('user-chvl')).toHaveLength(0);
    });

    it('ne notifie pas pour une réservation terminée', async () => {
        await seedReservation({ startTime: iso(-26), endTime: iso(-24), status: 'VALIDATED' });
        asUser('admin@dev.local', 'user-admin', ['ADMIN']);

        expect((await del()).status).toBe(200);
        expect(await notifsFor('user-chvl')).toHaveLength(0);
    });

    it('ne notifie pas pour « Chauffeur non décidé »', async () => {
        await seedReservation({ userEmail: 'chvl@dev.local', userName: 'Chauffeur non décidé' });
        asUser('admin@dev.local', 'user-admin', ['ADMIN']);

        expect((await del()).status).toBe(200);
        expect(await notifsFor('user-chvl')).toHaveLength(0);
    });
});

describe('/api/reservations/recurrence/[groupId]', () => {
    const params = { params: Promise.resolve({ groupId: 'grp-1' }) };

    it('DELETE par un responsable : le demandeur reçoit une seule notification pour la série', async () => {
        await seedReservation({ id: 'r1', recurrenceGroupId: 'grp-1', startTime: iso(24), endTime: iso(26) });
        await seedReservation({ id: 'r2', recurrenceGroupId: 'grp-1', startTime: iso(48), endTime: iso(50) });
        asUser('admin@dev.local', 'user-admin', ['ADMIN']);

        const res = await deleteRecurrence(new Request('http://localhost/x', { method: 'DELETE' }), params);
        expect(res.status).toBe(200);

        const notifs = await notifsFor('user-chvl');
        expect(notifs).toHaveLength(1);
        expect(notifs[0].title).toBe('❌ Réservation annulée');
        expect(notifs[0].message).toContain('2 occurrence(s)');
    });

    it('DELETE par le demandeur : aucune notification', async () => {
        await seedReservation({ id: 'r1', recurrenceGroupId: 'grp-1' });
        asUser('chvl@dev.local', 'user-chvl', ['CHVL']);

        const res = await deleteRecurrence(new Request('http://localhost/x', { method: 'DELETE' }), params);
        expect(res.status).toBe(200);
        expect(await notifsFor('user-chvl')).toHaveLength(0);
    });

    it('PATCH (validation) : le demandeur est notifié avec un lien relatif', async () => {
        await seedReservation({ id: 'r1', recurrenceGroupId: 'grp-1' });
        asUser('admin@dev.local', 'user-admin', ['ADMIN']);

        const res = await patchRecurrence(new Request('http://localhost/x', { method: 'PATCH' }), params);
        expect(res.status).toBe(200);

        const notifs = await notifsFor('user-chvl');
        expect(notifs).toHaveLength(1);
        expect(notifs[0].url).toBe('/vehicles/VL%20186');
    });
});

describe('incidents — notification des Responsables', () => {
    const incidentBody = (extra: Record<string, unknown> = {}) => new Request('http://localhost/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleId: 'VL001', type: 'ACCIDENT', status: 'SUBMITTED', ...extra }),
    });

    it('POST direct en SUBMITTED : PRESIDENT et CADRE notifiés, sans nom d\'auteur', async () => {
        asUser('chvl@dev.local', 'user-chvl', ['CHVL'], 'Chauffeur Test');

        const res = await postIncident(incidentBody());
        expect(res.status).toBe(201);

        for (const id of ['user-pres', 'user-cadre']) {
            const notifs = await notifsFor(id);
            expect(notifs).toHaveLength(1);
            expect(notifs[0].message).toContain('Accident');
            expect(notifs[0].message).toContain('VL 186');
            expect(`${notifs[0].title} ${notifs[0].message}`).not.toContain('Chauffeur Test');
        }
        expect(await notifsFor('user-admin')).toHaveLength(0);
        expect(await notifsFor('user-chvl')).toHaveLength(0);
    });

    it('POST en DRAFT : aucune notification', async () => {
        asUser('chvl@dev.local', 'user-chvl', ['CHVL']);

        const res = await postIncident(incidentBody({ status: 'DRAFT' }));
        expect(res.status).toBe(201);
        expect(await notifsFor('user-pres')).toHaveLength(0);
    });

    it('PATCH DRAFT → SUBMITTED notifie une fois ; un second PATCH SUBMITTED ne renotifie pas', async () => {
        await seedIncident({ id: 'inc-1', vehicleId: 'VL001', userId: 'user-chvl', type: 'FLASH', status: 'DRAFT' });
        asUser('chvl@dev.local', 'user-chvl', ['CHVL']);
        const patch = () => patchIncident(
            new Request('http://localhost/api/incidents/inc-1', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'SUBMITTED' }),
            }),
            { params: Promise.resolve({ id: 'inc-1' }) },
        );

        expect((await patch()).status).toBe(200);
        const first = await notifsFor('user-pres');
        expect(first).toHaveLength(1);
        expect(first[0].message).toContain('Amende flash');

        expect((await patch()).status).toBe(200);
        expect(await notifsFor('user-pres')).toHaveLength(1);
    });
});

describe('PATCH /api/reservations/[id] et recurrence — « Chauffeur non décidé »', () => {
    it('la validation ne notifie pas le créateur d\'une réservation sans chauffeur désigné', async () => {
        await seedReservation({ userEmail: 'chvl@dev.local', userName: 'Chauffeur non décidé' });
        asUser('admin@dev.local', 'user-admin', ['ADMIN']);

        const res = await patchReservation(new Request('http://localhost/api/reservations/res-1', { method: 'PATCH' }), { params: Promise.resolve({ id: 'res-1' }) });
        expect(res.status).toBe(200);
        expect(await notifsFor('user-chvl')).toHaveLength(0);
    });

    it('la validation d\'une série sans chauffeur désigné ne notifie personne', async () => {
        await seedReservation({ id: 'r1', recurrenceGroupId: 'grp-1', userName: 'Chauffeur non décidé' });
        asUser('admin@dev.local', 'user-admin', ['ADMIN']);

        const res = await patchRecurrence(new Request('http://localhost/x', { method: 'PATCH' }), { params: Promise.resolve({ groupId: 'grp-1' }) });
        expect(res.status).toBe(200);
        expect(await notifsFor('user-chvl')).toHaveLength(0);
    });

    it('l\'annulation d\'une série sans chauffeur désigné ne notifie personne', async () => {
        await seedReservation({ id: 'r1', recurrenceGroupId: 'grp-1', userName: 'Chauffeur non décidé' });
        asUser('admin@dev.local', 'user-admin', ['ADMIN']);

        const res = await deleteRecurrence(new Request('http://localhost/x', { method: 'DELETE' }), { params: Promise.resolve({ groupId: 'grp-1' }) });
        expect(res.status).toBe(200);
        expect(await notifsFor('user-chvl')).toHaveLength(0);
    });
});

describe('incidents — cas limites', () => {
    const patchStatus = (status: string) => patchIncident(
        new Request('http://localhost/api/incidents/inc-1', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
        }),
        { params: Promise.resolve({ id: 'inc-1' }) },
    );

    it('refuse (409) de repasser un incident SUBMITTED en DRAFT', async () => {
        await seedIncident({ id: 'inc-1', vehicleId: 'VL001', userId: 'user-chvl', status: 'SUBMITTED' });
        asUser('chvl@dev.local', 'user-chvl', ['CHVL']);

        const res = await patchStatus('DRAFT');
        expect(res.status).toBe(409);
        const row = await db.execute(`SELECT status FROM "IncidentReport" WHERE id = 'inc-1'`);
        expect(row.rows[0].status).toBe('SUBMITTED');
    });

    it('un admin qui soumet le brouillon d\'un PRESIDENT : le déclarant n\'est pas notifié, le CADRE oui', async () => {
        await seedIncident({ id: 'inc-1', vehicleId: 'VL001', userId: 'user-pres', status: 'DRAFT' });
        asUser('admin@dev.local', 'user-admin', ['ADMIN']);

        const res = await patchStatus('SUBMITTED');
        expect(res.status).toBe(200);
        expect(await notifsFor('user-pres')).toHaveLength(0);
        expect(await notifsFor('user-cadre')).toHaveLength(1);
    });

    it('un véhicule sans UL ne notifie personne', async () => {
        await seedVehicle({ id: 'VL-NOUL', name: 'VL SANS UL', ulId: null });
        asUser('chvl@dev.local', 'user-chvl', ['CHVL']);
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        const res = await postIncident(new Request('http://localhost/api/incidents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vehicleId: 'VL-NOUL', type: 'FLASH', status: 'SUBMITTED' }),
        }));
        expect(res.status).toBe(201);
        const all = await db.execute(`SELECT id FROM "Notification"`);
        expect(all.rows).toHaveLength(0);
    });
});

describe('liens de notification', () => {
    it('aucune notification créée ne contient d\'hôte absolu', async () => {
        await seedReservation({ status: 'VALIDATED' });
        asUser('admin@dev.local', 'user-admin', ['ADMIN']);
        await deleteReservation(new Request('http://localhost/x', { method: 'DELETE' }), { params: Promise.resolve({ id: 'res-1' }) });
        asUser('chvl@dev.local', 'user-chvl', ['CHVL']);
        await postIncident(new Request('http://localhost/api/incidents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vehicleId: 'VL001', type: 'FLASH', status: 'SUBMITTED' }),
        }));

        const all = await db.execute(`SELECT url FROM "Notification"`);
        expect(all.rows.length).toBeGreaterThan(0);
        for (const row of all.rows) {
            expect(row.url).toMatch(/^\//);
            expect(String(row.url)).not.toContain('cr-chauffeur.vercel.app');
        }
    });
});
