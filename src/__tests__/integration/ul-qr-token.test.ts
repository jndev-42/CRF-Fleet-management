/**
 * Tests d'intégration — GET/POST/DELETE /api/ul/[id]/qr-token.
 *
 * Gestion du token QR d'une UL : lecture/création paresseuse ET régénération
 * réservées aux profils qui accèdent au panneau d'administration
 * (`canAccessAdminPanel`) — durci en revue par rapport au modèle véhicule
 * initialement imité, faute d'appelant frontend existant à casser.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { GET, POST, DELETE } from '@/app/api/ul/[id]/qr-token/route';
import { auth } from '@/auth';
import { db, seedUniteLocale } from './setup';

const mockedAuth = vi.mocked(auth);

const CHVL = { user: { id: 'u-chvl', email: 'chvl@test.com', name: 'Camille', ulId: 'ul-paris-18', roles: ['CHVL'] } };
const SANS_ROLE = { user: { id: 'u-nobody', email: 'nobody@test.com', name: 'Sans Rôle', ulId: 'ul-paris-18', roles: [] } };
const ADMIN = { user: { id: 'u-admin', email: 'admin@test.com', name: 'Alex', ulId: 'ul-paris-18', roles: ['ADMIN'] } };
const CADRE = { user: { id: 'u-cadre', email: 'cadre@test.com', name: 'Claire', ulId: 'ul-paris-18', roles: ['CADRE'] } };

function makeRequest(method: string): Request {
    return new Request('http://localhost/api/ul/ul-paris-18/qr-token', { method });
}

function withId(id: string) {
    return { params: Promise.resolve({ id }) };
}

async function tokenInDb(id: string): Promise<string | null> {
    const res = await db.execute({ sql: `SELECT qrToken FROM "UniteLocale" WHERE id = ?`, args: [id] });
    return (res.rows[0]?.qrToken as string | null) ?? null;
}

beforeEach(async () => {
    await db.execute(`DELETE FROM "UniteLocale"`);
    await seedUniteLocale({ id: 'ul-paris-18', name: 'Paris 18', slug: 'paris-18' });
    mockedAuth.mockReset();
});

describe('GET /api/ul/[id]/qr-token', () => {
    it('retourne 401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        const res = await GET(makeRequest('GET'), withId('ul-paris-18'));
        expect(res.status).toBe(401);
    });

    it('retourne 403 pour un CHVL — accès réservé au panneau d\'administration', async () => {
        mockedAuth.mockResolvedValue(CHVL as never);
        const res = await GET(makeRequest('GET'), withId('ul-paris-18'));
        expect(res.status).toBe(403);
    });

    it('retourne 403 pour un compte sans aucun rôle', async () => {
        mockedAuth.mockResolvedValue(SANS_ROLE as never);
        const res = await GET(makeRequest('GET'), withId('ul-paris-18'));
        expect(res.status).toBe(403);
    });

    it('retourne 404 pour une UL inconnue', async () => {
        mockedAuth.mockResolvedValue(ADMIN as never);
        const res = await GET(makeRequest('GET'), withId('inconnue'));
        expect(res.status).toBe(404);
        expect((await res.json()).error).toBe('UL introuvable');
    });

    it('crée le token à la première demande et l\'écrit en base', async () => {
        mockedAuth.mockResolvedValue(ADMIN as never);

        const res = await GET(makeRequest('GET'), withId('ul-paris-18'));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.token).toBeTruthy();
        expect(await tokenInDb('ul-paris-18')).toBe(body.token);
    });

    it('rend le même token à chaque appel', async () => {
        mockedAuth.mockResolvedValue(ADMIN as never);
        const first = await (await GET(makeRequest('GET'), withId('ul-paris-18'))).json();
        const second = await (await GET(makeRequest('GET'), withId('ul-paris-18'))).json();
        expect(second.token).toBe(first.token);
    });

    it('réussit aussi pour un CADRE (canAccessAdminPanel)', async () => {
        mockedAuth.mockResolvedValue(CADRE as never);
        const res = await GET(makeRequest('GET'), withId('ul-paris-18'));
        expect(res.status).toBe(200);
    });
});

describe('POST /api/ul/[id]/qr-token', () => {
    it('se comporte comme GET', async () => {
        mockedAuth.mockResolvedValue(ADMIN as never);
        const res = await POST(makeRequest('POST'), withId('ul-paris-18'));
        expect(res.status).toBe(200);
        expect((await res.json()).token).toBeTruthy();
    });

    it('retourne 403 pour un compte sans aucun rôle', async () => {
        mockedAuth.mockResolvedValue(SANS_ROLE as never);
        const res = await POST(makeRequest('POST'), withId('ul-paris-18'));
        expect(res.status).toBe(403);
    });
});

describe('DELETE /api/ul/[id]/qr-token', () => {
    it('retourne 401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        const res = await DELETE(makeRequest('DELETE'), withId('ul-paris-18'));
        expect(res.status).toBe(401);
    });

    it('retourne 403 pour un CHVL — la régénération n\'est pas ouverte', async () => {
        mockedAuth.mockResolvedValue(CHVL as never);
        const res = await DELETE(makeRequest('DELETE'), withId('ul-paris-18'));
        expect(res.status).toBe(403);
    });

    it('retourne 403 pour un compte sans aucun rôle', async () => {
        mockedAuth.mockResolvedValue(SANS_ROLE as never);
        const res = await DELETE(makeRequest('DELETE'), withId('ul-paris-18'));
        expect(res.status).toBe(403);
    });

    /** `canAccessAdminPanel` est composé sur `denyWhenInactive` : un ADMIN bloqué
     *  ne doit pas pouvoir invalider les QR déjà imprimés. */
    it('retourne 403 pour un ADMIN portant INACTIF, sans toucher au token', async () => {
        mockedAuth.mockResolvedValue(ADMIN as never);
        const original = await (await GET(makeRequest('GET'), withId('ul-paris-18'))).json();

        mockedAuth.mockResolvedValue({
            user: { ...ADMIN.user, roles: ['ADMIN', 'INACTIF'] },
        } as never);
        const res = await DELETE(makeRequest('DELETE'), withId('ul-paris-18'));

        expect(res.status).toBe(403);
        expect(await tokenInDb('ul-paris-18')).toBe(original.token);
    });

    it('régénère un token DIFFÉRENT pour un admin', async () => {
        mockedAuth.mockResolvedValue(ADMIN as never);
        const before = await (await GET(makeRequest('GET'), withId('ul-paris-18'))).json();

        const res = await DELETE(makeRequest('DELETE'), withId('ul-paris-18'));
        expect(res.status).toBe(200);
        const after = await res.json();
        expect(after.token).not.toBe(before.token);
        expect(await tokenInDb('ul-paris-18')).toBe(after.token);
    });

    it('régénère aussi pour un CADRE (canAccessAdminPanel)', async () => {
        mockedAuth.mockResolvedValue(CADRE as never);
        const res = await DELETE(makeRequest('DELETE'), withId('ul-paris-18'));
        expect(res.status).toBe(200);
    });

    it('retourne 404 pour une UL inconnue', async () => {
        mockedAuth.mockResolvedValue(ADMIN as never);
        const res = await DELETE(makeRequest('DELETE'), withId('inconnue'));
        expect(res.status).toBe(404);
    });
});
