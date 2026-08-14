/**
 * Tests d'intégration — POST /api/stats/csv.
 *
 * Réponse synchrone à une seule requête (plus de job store en mémoire —
 * cf. finding H1 de l'audit, corrigé).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { POST } from '@/app/api/stats/csv/route';
import { auth } from '@/auth';

const mockedAuth = vi.mocked(auth);

beforeEach(() => {
    vi.resetAllMocks();
});

function makePostRequest(body: Record<string, unknown>): Request {
    return new Request('http://localhost/api/stats/csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

describe('POST /api/stats/csv', () => {
    it('retourne 401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        const res = await POST(makePostRequest({ dateFrom: '2026-01-01', dateTo: '2026-01-31' }));
        expect(res.status).toBe(401);
    });

    it('retourne 403 pour un rôle INACTIF', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'inactif@test.com', roles: ['INACTIF'] } } as never);
        const res = await POST(makePostRequest({ dateFrom: '2026-01-01', dateTo: '2026-01-31' }));
        expect(res.status).toBe(403);
    });

    it('retourne 400 pour une plage de dates invalide (dateTo avant dateFrom)', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'] } } as never);
        const res = await POST(makePostRequest({ dateFrom: '2026-02-01', dateTo: '2026-01-01' }));
        expect(res.status).toBe(400);
    });

    it('génère et retourne directement le CSV (happy path)', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'] } } as never);
        const res = await POST(makePostRequest({ dateFrom: '2026-01-01', dateTo: '2026-01-31' }));
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toContain('text/csv');
        expect(res.headers.get('Content-Disposition')).toContain('trips-martine.csv');
        const text = await res.text();
        expect(text.length).toBeGreaterThan(0);
    });
});
