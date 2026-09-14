/**
 * Tests d'intégration — GET /api/vehicles/[name]/incidents.
 *
 * Couvre l'ouverture de l'historique à toute l'UL : visibilité des rapports soumis
 * d'autrui, confidentialité des brouillons, anonymisation du déclarant et
 * cloisonnement inter-UL (noms de véhicules homonymes).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({
    auth: vi.fn(),
}));

import { GET } from '@/app/api/vehicles/[id]/incidents/route';
import { db } from '@/lib/db';
import { auth } from '@/auth';

const mockedAuth = vi.mocked(auth);

const UL = 'ul-paris-18';
const OTHER_UL = 'ul-lyon-3';

const VEHICLE_NAME = 'INCIDENT_TEST_V';
const VEHICLE_ID = 'v-inc-1';
const TWIN_VEHICLE_ID = 'v-inc-twin';
const OWNER_ID = 'u-inc-owner';
const OTHER_ID = 'u-inc-other';

function call(name = VEHICLE_NAME) {
    return GET(
        new Request(`http://localhost/api/vehicles/${name}/incidents`),
        { params: Promise.resolve({ id: name }) }
    );
}

async function seedIncident(id: string, userId: string, status: 'DRAFT' | 'SUBMITTED', vehicleId = VEHICLE_ID) {
    await db.execute({
        sql: `INSERT INTO IncidentReport (id, vehicleId, userId, type, status, occurredAt)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [id, vehicleId, userId, 'FLASH', status, '2023-01-01T10:00'],
    });
}

async function cleanup() {
    for (const vid of [VEHICLE_ID, TWIN_VEHICLE_ID]) {
        await db.execute({ sql: `DELETE FROM IncidentReport WHERE vehicleId = ?`, args: [vid] });
        await db.execute({ sql: `DELETE FROM Vehicle WHERE id = ?`, args: [vid] });
    }
    for (const uid of [OWNER_ID, OTHER_ID]) {
        await db.execute({ sql: `DELETE FROM "User" WHERE id = ?`, args: [uid] });
    }
}

describe('GET /api/vehicles/[id]/incidents', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        await cleanup();

        await db.execute({
            sql: `INSERT INTO "User" (id, email, name) VALUES (?, ?, ?)`,
            args: [OWNER_ID, 'owner@dev.local', 'Déclarant Un'],
        });
        await db.execute({
            sql: `INSERT INTO "User" (id, email, name) VALUES (?, ?, ?)`,
            args: [OTHER_ID, 'other@dev.local', 'Autre Bénévole'],
        });
        await db.execute({
            sql: `INSERT INTO Vehicle (id, name, type, plate, ulId, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`,
            args: [VEHICLE_ID, VEHICLE_NAME, 'VL', 'INC-123-AB', UL, new Date().toISOString()],
        });
    });

    afterEach(cleanup);

    it('retourne 401 sans session', async () => {
        mockedAuth.mockResolvedValueOnce(null as never);

        const res = await call();

        expect(res.status).toBe(401);
        expect((await res.json()).error).toBe('Non authentifié');
    });

    it('retourne 403 pour un compte INACTIF', async () => {
        mockedAuth.mockResolvedValueOnce({
            user: { id: OTHER_ID, email: 'other@dev.local', roles: ['CHVL', 'INACTIF'], ulId: UL },
            expires: '9999',
        } as never);

        const res = await call();

        expect(res.status).toBe(403);
    });

    it('retourne 404 si le véhicule est inconnu', async () => {
        mockedAuth.mockResolvedValueOnce({
            user: { id: OTHER_ID, email: 'admin@dev.local', roles: ['ADMIN'], ulId: UL },
            expires: '9999',
        } as never);

        const res = await call('UNKNOWN_VEHICLE');

        expect(res.status).toBe(404);
        expect((await res.json()).error).toBe('Véhicule non trouvé');
    });

    it("retourne 404 pour un véhicule d'une autre UL", async () => {
        mockedAuth.mockResolvedValueOnce({
            user: { id: OTHER_ID, email: 'other@dev.local', roles: ['CHVL'], ulId: OTHER_UL },
            expires: '9999',
        } as never);
        await seedIncident('inc-submitted', OWNER_ID, 'SUBMITTED');

        const res = await call();

        expect(res.status).toBe(404);
    });

    it("ne remonte pas les incidents d'un véhicule homonyme d'une autre UL", async () => {
        // Deux ULs peuvent nommer un véhicule à l'identique : la résolution par nom
        // doit rester bornée à l'UL de l'appelant.
        await db.execute({
            sql: `INSERT INTO Vehicle (id, name, type, plate, ulId, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`,
            args: [TWIN_VEHICLE_ID, 'HOMONYME', 'VL', 'INC-999-ZZ', OTHER_UL, new Date().toISOString()],
        });
        await seedIncident('inc-twin', OWNER_ID, 'SUBMITTED', TWIN_VEHICLE_ID);

        mockedAuth.mockResolvedValueOnce({
            user: { id: OTHER_ID, email: 'other@dev.local', roles: ['CHVL'], ulId: UL },
            expires: '9999',
        } as never);

        const res = await call('HOMONYME');

        expect(res.status).toBe(404);
    });

    it("expose les rapports soumis d'autrui à un membre de l'UL, auteur masqué", async () => {
        mockedAuth.mockResolvedValueOnce({
            user: { id: OTHER_ID, email: 'other@dev.local', roles: ['CHVL'], ulId: UL },
            expires: '9999',
        } as never);
        await seedIncident('inc-submitted', OWNER_ID, 'SUBMITTED');

        const res = await call();

        expect(res.status).toBe(200);
        const { incidents } = await res.json();
        expect(incidents).toHaveLength(1);
        expect(incidents[0].id).toBe('inc-submitted');
        expect(incidents[0]).not.toHaveProperty('userName');
        expect(incidents[0]).not.toHaveProperty('userEmail');
        expect(incidents[0]).not.toHaveProperty('userId');
        expect(incidents[0].isOwn).toBe(false);
        expect(incidents[0].canEdit).toBe(false);
    });

    it("masque le brouillon d'autrui et conserve le sien", async () => {
        mockedAuth.mockResolvedValueOnce({
            user: { id: OTHER_ID, email: 'other@dev.local', roles: ['CHVL'], ulId: UL },
            expires: '9999',
        } as never);
        await seedIncident('inc-draft-autrui', OWNER_ID, 'DRAFT');
        await seedIncident('inc-draft-mien', OTHER_ID, 'DRAFT');
        await seedIncident('inc-submitted', OWNER_ID, 'SUBMITTED');

        const res = await call();

        expect(res.status).toBe(200);
        const { incidents } = await res.json();
        const ids = incidents.map((i: { id: string }) => i.id);
        expect(ids).toContain('inc-submitted');
        expect(ids).toContain('inc-draft-mien');
        expect(ids).not.toContain('inc-draft-autrui');
    });

    it('révèle son propre nom et marque le rapport comme sien', async () => {
        mockedAuth.mockResolvedValueOnce({
            user: { id: OWNER_ID, email: 'owner@dev.local', roles: ['CHVL'], ulId: UL },
            expires: '9999',
        } as never);
        await seedIncident('inc-mien', OWNER_ID, 'SUBMITTED');

        const res = await call();

        const { incidents } = await res.json();
        expect(incidents).toHaveLength(1);
        expect(incidents[0].userName).toBe('Déclarant Un');
        expect(incidents[0].isOwn).toBe(true);
        expect(incidents[0].canEdit).toBe(true);
    });

    it("révèle l'auteur et les brouillons à un ADMIN de l'UL", async () => {
        mockedAuth.mockResolvedValueOnce({
            user: { id: OTHER_ID, email: 'admin@dev.local', roles: ['ADMIN'], ulId: UL },
            expires: '9999',
        } as never);
        await seedIncident('inc-submitted', OWNER_ID, 'SUBMITTED');
        await seedIncident('inc-draft', OWNER_ID, 'DRAFT');

        const res = await call();

        expect(res.status).toBe(200);
        const { incidents } = await res.json();
        expect(incidents).toHaveLength(2);
        const submitted = incidents.find((i: { id: string }) => i.id === 'inc-submitted');
        expect(submitted.userName).toBe('Déclarant Un');
        expect(submitted.isOwn).toBe(false);
        expect(submitted.canEdit).toBe(true);
    });
});
