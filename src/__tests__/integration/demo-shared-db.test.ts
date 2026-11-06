/**
 * Tests d'intégration — mode démo sur base partagée.
 *
 * Deux vraies bases SQLite : la « prod » (`./setup`) et une base « démo », recopiée
 * depuis la prod par `cloneDatabase` avant chaque test (comme le cron de 23h59).
 * `@/lib/db` est le VRAI module d'aiguillage : seul l'en-tête posé par le proxy est simulé.
 * Une réservation créée puis validée en démo vit dans la base démo, jamais en prod.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const demoDir = vi.hoisted(() => ({ path: '' }));
const cookieState = vi.hoisted(() => ({ demo: false }));

// En-tête posé par le proxy sur une requête démo (cookie + API hors QR/auth).
vi.mock('next/headers', () => ({
    headers: vi.fn(async () => new Headers(cookieState.demo ? { 'x-crf-demo': '1' } : {})),
    cookies: vi.fn(async () => ({ get: () => undefined })),
}));
// Le vrai `@/lib/db`, branché sur la base de test (prod) et une base démo temporaire.
vi.mock('@/lib/db', async () => {
    const { dbPath } = await import('./setup');
    demoDir.path = mkdtempSync(join(tmpdir(), 'martine-demo-'));
    process.env.TURSO_DATABASE_URL = `file:${dbPath}`;
    process.env.TURSO_DEMO_DATABASE_URL = `file:${join(demoDir.path, 'demo.db')}`;
    return vi.importActual('@/lib/db');
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/push', () => ({
    sendPushNotification: vi.fn().mockResolvedValue(undefined),
    notifyUsers: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from '@/app/api/vehicles/[id]/reservations/route';
import { PATCH } from '@/app/api/reservations/[id]/route';
import { auth } from '@/auth';
import { demoDb, prodDb } from '@/lib/db';
import { cloneDatabase } from '@/lib/demo/cloneDatabase';
import { db as setupDb, seedUser, seedVehicle } from './setup';

const mockedAuth = vi.mocked(auth);
const VEHICLE_ID = 'VL001';

function futureWindow(startOffsetHours: number, durationHours = 2) {
    const start = new Date(Date.now() + startOffsetHours * 60 * 60 * 1000);
    const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
    return { startTime: start.toISOString(), endTime: end.toISOString() };
}

function postReservation(body: Record<string, unknown>) {
    return POST(
        new Request(`http://localhost/api/vehicles/${VEHICLE_ID}/reservations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ id: VEHICLE_ID }) },
    );
}

async function reservationIn(client: typeof setupDb, id: string) {
    const r = await client.execute({ sql: `SELECT status FROM "Reservation" WHERE id = ?`, args: [id] });
    return r.rows[0]?.status ?? null;
}

async function reservationCount(client: typeof setupDb) {
    const r = await client.execute(`SELECT COUNT(*) AS n FROM "Reservation"`);
    return Number(r.rows[0].n);
}

beforeEach(async () => {
    cookieState.demo = false;
    await seedVehicle({ id: VEHICLE_ID, name: 'VL186' });
    await seedUser({ id: 'user-chvl', email: 'chvl@dev.local', name: 'Chauffeur Test' });
    await seedUser({ id: 'user-admin', email: 'admin@dev.local', name: 'Admin Test' });
    // Recopie nocturne : la base démo repart de la prod.
    await cloneDatabase(prodDb, demoDb!);
});

afterAll(() => {
    delete process.env.TURSO_DATABASE_URL;
    delete process.env.TURSO_DEMO_DATABASE_URL;
    demoDb?.close();
    if (demoDir.path) rmSync(demoDir.path, { recursive: true, force: true });
});

describe('mode démo — base démo partagée', () => {
    it('le `db` aiguillé pointe sur le fichier de test (prod) et la base démo est configurée', async () => {
        expect(demoDb).not.toBeNull();
        const meta = await demoDb!.execute(`SELECT state FROM "DemoMeta" WHERE id = 1`);
        expect(meta.rows[0].state).toBe('ready');
        expect(await reservationCount(prodDb as typeof setupDb)).toBe(await reservationCount(setupDb));
    });

    it('en démo, une réservation est créée puis validée dans la base démo, la prod reste inchangée', async () => {
        cookieState.demo = true;
        const prodBefore = await reservationCount(setupDb);

        mockedAuth.mockResolvedValue({ user: { email: 'chvl@dev.local', name: 'Chauffeur Test', roles: ['CHVL'], ulId: 'ul-paris-18' } } as never);
        const res = await postReservation({ ...futureWindow(2), reason: 'Entraînement démo' });
        expect(res.status).toBe(201);
        const { id, status } = await res.json();
        expect(status).toBe('PENDING');

        expect(await reservationIn(demoDb as typeof setupDb, id)).toBe('PENDING');
        expect(await reservationIn(setupDb, id)).toBeNull();

        mockedAuth.mockResolvedValue({ user: { email: 'admin@dev.local', name: 'Admin Test', roles: ['ADMIN'], ulId: 'ul-paris-18' } } as never);
        const validate = await PATCH(
            new Request(`http://localhost/api/reservations/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'validate' }),
            }),
            { params: Promise.resolve({ id }) },
        );
        expect(validate.status).toBe(200);
        expect(await reservationIn(demoDb as typeof setupDb, id)).toBe('VALIDATED');

        expect(await reservationCount(setupDb)).toBe(prodBefore);
    });

    it('hors démo, la même création écrit en prod (comportement inchangé)', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'chvl@dev.local', name: 'Chauffeur Test', roles: ['CHVL'], ulId: 'ul-paris-18' } } as never);
        const res = await postReservation(futureWindow(5));
        expect(res.status).toBe(201);
        const { id } = await res.json();

        expect(await reservationIn(setupDb, id)).toBe('PENDING');
        expect(await reservationIn(demoDb as typeof setupDb, id)).toBeNull();
    });

    it('la recopie suivante efface les actions faites en démo', async () => {
        cookieState.demo = true;
        mockedAuth.mockResolvedValue({ user: { email: 'chvl@dev.local', name: 'Chauffeur Test', roles: ['CHVL'], ulId: 'ul-paris-18' } } as never);
        const res = await postReservation(futureWindow(8));
        const { id } = await res.json();
        expect(await reservationIn(demoDb as typeof setupDb, id)).toBe('PENDING');

        await cloneDatabase(prodDb, demoDb!);
        expect(await reservationIn(demoDb as typeof setupDb, id)).toBeNull();
    });
});
