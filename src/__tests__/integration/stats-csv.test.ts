/**
 * Tests d'intégration — POST/GET /api/stats/csv.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { POST, GET } from '@/app/api/stats/csv/route';
import { auth } from '@/auth';

const mockedAuth = vi.mocked(auth);

beforeEach(() => {
    vi.resetAllMocks();
    global.__csvJobs = undefined;
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

    it('génère un CSV et retourne un jobId (happy path)', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'] } } as never);
        const res = await POST(makePostRequest({ dateFrom: '2026-01-01', dateTo: '2026-01-31' }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.jobId).toBeTruthy();
        expect(body.status).toBe('ready');
    });
});

describe('GET /api/stats/csv', () => {
    it('retourne 401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        const res = await GET(new Request('http://localhost/api/stats/csv?jobId=00000000-0000-0000-0000-000000000000'));
        expect(res.status).toBe(401);
    });

    it('retourne 400 pour un jobId au format invalide', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'] } } as never);
        const res = await GET(new Request('http://localhost/api/stats/csv?jobId=not-a-uuid'));
        expect(res.status).toBe(400);
    });

    it('retourne 404 pour un job inconnu', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'] } } as never);
        const res = await GET(new Request('http://localhost/api/stats/csv?jobId=00000000-0000-0000-0000-000000000000'));
        expect(res.status).toBe(404);
    });

    it('télécharge le CSV généré (happy path)', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'] } } as never);
        const postRes = await POST(makePostRequest({ dateFrom: '2026-01-01', dateTo: '2026-01-31' }));
        const { jobId } = await postRes.json();

        const res = await GET(new Request(`http://localhost/api/stats/csv?jobId=${jobId}`));
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toContain('text/csv');
    });
});
