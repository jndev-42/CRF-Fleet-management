/**
 * Tests d'intégration — POST/GET /api/stats/pdf.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { POST, GET } from '@/app/api/stats/pdf/route';
import { auth } from '@/auth';

const mockedAuth = vi.mocked(auth);

beforeEach(() => {
    vi.resetAllMocks();
    global.__pdfJobs = undefined;
});

function makePostRequest(body: Record<string, unknown>): Request {
    return new Request('http://localhost/api/stats/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

describe('POST /api/stats/pdf', () => {
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

    it('retourne 400 pour des paramètres invalides (Zod)', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'] } } as never);
        const res = await POST(makePostRequest({ dateFrom: '' }));
        expect(res.status).toBe(400);
    });

    it('génère un PDF et retourne un jobId (happy path)', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'] } } as never);
        const res = await POST(makePostRequest({ dateFrom: '2026-01-01', dateTo: '2026-01-31' }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.jobId).toBeTruthy();
    }, 15000);
});

describe('GET /api/stats/pdf', () => {
    it('retourne 401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        const res = await GET(new Request('http://localhost/api/stats/pdf?jobId=any'));
        expect(res.status).toBe(401);
    });

    it('retourne 400 sans jobId', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'] } } as never);
        const res = await GET(new Request('http://localhost/api/stats/pdf'));
        expect(res.status).toBe(400);
    });

    it('retourne 404 pour un job inconnu', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'] } } as never);
        const res = await GET(new Request('http://localhost/api/stats/pdf?jobId=unknown'));
        expect(res.status).toBe(404);
    });

    it('télécharge le PDF généré (happy path)', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'] } } as never);
        const postRes = await POST(makePostRequest({ dateFrom: '2026-01-01', dateTo: '2026-01-31' }));
        const { jobId } = await postRes.json();

        const res = await GET(new Request(`http://localhost/api/stats/pdf?jobId=${jobId}`));
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('application/pdf');
    }, 15000);
});
