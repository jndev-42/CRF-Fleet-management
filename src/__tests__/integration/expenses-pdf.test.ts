/**
 * Tests d'intégration — GET /api/expenses/[id]/pdf.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { GET } from '@/app/api/expenses/[id]/pdf/route';
import { auth } from '@/auth';
import { seedUser, seedExpenseReport } from './setup';

const mockedAuth = vi.mocked(auth);

beforeEach(() => {
    vi.resetAllMocks();
});

describe('GET /api/expenses/[id]/pdf', () => {
    it('retourne 401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        const res = await GET(new Request('http://localhost/api/expenses/expense-1/pdf'), { params: Promise.resolve({ id: 'expense-1' }) });
        expect(res.status).toBe(401);
    });

    it('retourne 404 pour une note de frais inconnue', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'user-1', email: 'user@test.com', roles: ['CHVL'] } } as never);
        const res = await GET(new Request('http://localhost/api/expenses/unknown/pdf'), { params: Promise.resolve({ id: 'unknown' }) });
        expect(res.status).toBe(404);
    });

    it('retourne 403 pour un autre utilisateur non-manager/trésorier', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'user-2', email: 'autre@test.com', roles: ['CHVL'] } } as never);
        await seedUser({ id: 'user-1', email: 'owner@test.com' });
        await seedUser({ id: 'user-2', email: 'autre@test.com' });
        await seedExpenseReport({ id: 'expense-1', userId: 'user-1', status: 'soumis' });

        const res = await GET(new Request('http://localhost/api/expenses/expense-1/pdf'), { params: Promise.resolve({ id: 'expense-1' }) });
        expect(res.status).toBe(403);
    });

    it('génère le PDF pour son propriétaire (happy path)', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'user-1', email: 'owner@test.com', roles: ['CHVL'] } } as never);
        await seedUser({ id: 'user-1', email: 'owner@test.com' });
        await seedExpenseReport({ id: 'expense-1', userId: 'user-1' });

        const res = await GET(new Request('http://localhost/api/expenses/expense-1/pdf'), { params: Promise.resolve({ id: 'expense-1' }) });
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('application/pdf');
    });

    it('autorise le trésorier pour une note en attente de paiement', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'user-2', email: 'tresorier@test.com', roles: ['TRESORIER'] } } as never);
        await seedUser({ id: 'user-1', email: 'owner@test.com' });
        await seedUser({ id: 'user-2', email: 'tresorier@test.com' });
        await seedExpenseReport({ id: 'expense-1', userId: 'user-1', status: 'en_attente_paiement' });

        const res = await GET(new Request('http://localhost/api/expenses/expense-1/pdf'), { params: Promise.resolve({ id: 'expense-1' }) });
        expect(res.status).toBe(200);
    });

    it('génère le PDF d\'une note antérieure sans mission (non-régression)', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'user-1', email: 'owner@test.com', roles: ['CHVL'] } } as never);
        await seedUser({ id: 'user-1', email: 'owner@test.com' });
        await seedExpenseReport({ id: 'expense-1', userId: 'user-1', missionName: null, missionDate: null });

        const res = await GET(new Request('http://localhost/api/expenses/expense-1/pdf'), { params: Promise.resolve({ id: 'expense-1' }) });
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('application/pdf');
        const buffer = Buffer.from(await res.arrayBuffer());
        expect(buffer.length).toBeGreaterThan(0);
    });

    it('génère le PDF d\'une note portant un nom et une date de mission', async () => {
        mockedAuth.mockResolvedValue({ user: { id: 'user-1', email: 'owner@test.com', roles: ['CHVL'] } } as never);
        await seedUser({ id: 'user-1', email: 'owner@test.com' });
        await seedExpenseReport({
            id: 'expense-1',
            userId: 'user-1',
            missionName: 'Maraude Nord',
            missionDate: '2026-03-12',
        });

        const res = await GET(new Request('http://localhost/api/expenses/expense-1/pdf'), { params: Promise.resolve({ id: 'expense-1' }) });
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('application/pdf');
        const buffer = Buffer.from(await res.arrayBuffer());
        expect(buffer.length).toBeGreaterThan(0);
    });
});
