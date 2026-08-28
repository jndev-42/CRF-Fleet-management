/**
 * Tests d'intégration — GET /api/expenses/[id]/pdf.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

// R2 : service externe, toujours mocké.
const SEALED = Buffer.from('%PDF-1.3 document scelle depuis R2');
vi.mock('@/lib/r2', () => ({
    getObject: vi.fn(async (key: string) => (key === 'absent.pdf' ? null : Buffer.from('%PDF-1.3 document scelle depuis R2'))),
    putObject: vi.fn(async () => undefined),
    headObject: vi.fn(async () => true),
}));

// Espionne la génération à la volée : elle NE DOIT PAS être appelée quand une
// clé R2 existe (D2 — proxy pur).
vi.mock('@/lib/expenses/pdf', () => ({
    generateExpensePdf: vi.fn(async () => Buffer.from('%PDF-1.3 genere a la volee')),
}));

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

describe('GET /api/expenses/[id]/pdf — proxy R2', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        await seedUser({ id: 'owner-r2', email: 'owner-r2@test.com', name: 'Owner R2' });
        vi.mocked(auth).mockResolvedValue({ user: { id: 'owner-r2', email: 'owner-r2@test.com', roles: ['SECOURISTE'] } } as never);
    });

    it('sert les octets venant de R2 SANS régénérer le PDF', async () => {
        await seedExpenseReport({ id: 'exp-r2', userId: 'owner-r2', status: 'soumis', r2Key: 'exp-r2/v1-abc.pdf' });

        const res = await GET(new Request('http://localhost'), { params: Promise.resolve({ id: 'exp-r2' }) });
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toBe('application/pdf');
        expect(Buffer.from(await res.arrayBuffer()).equals(SEALED)).toBe(true);

        // Cœur de la décision D2 : aucune régénération sur le chemin nominal.
        const { generateExpensePdf } = await import('@/lib/expenses/pdf');
        expect(vi.mocked(generateExpensePdf)).not.toHaveBeenCalled();
    });

    it('renvoie 404 pour un brouillon — aucun document scellé n\'existe', async () => {
        await seedExpenseReport({ id: 'exp-draft', userId: 'owner-r2', status: 'brouillon', r2Key: null });
        const res = await GET(new Request('http://localhost'), { params: Promise.resolve({ id: 'exp-draft' }) });
        expect(res.status).toBe(404);
    });

    it('renvoie 409 si la base référence une clé absente du bucket', async () => {
        await seedExpenseReport({ id: 'exp-lost', userId: 'owner-r2', status: 'soumis', r2Key: 'absent.pdf' });
        const res = await GET(new Request('http://localhost'), { params: Promise.resolve({ id: 'exp-lost' }) });
        // Jamais de régénération silencieuse : le PDF reconstruit ne porterait
        // aucune signature et masquerait l'anomalie.
        expect(res.status).toBe(409);
    });

    it('retombe sur la génération à la volée pour une note LEGACY sans clé R2', async () => {
        await seedExpenseReport({ id: 'exp-legacy', userId: 'owner-r2', status: 'traité', r2Key: null });

        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const res = await GET(new Request('http://localhost'), { params: Promise.resolve({ id: 'exp-legacy' }) });
        expect(res.status).toBe(200);

        const { generateExpensePdf } = await import('@/lib/expenses/pdf');
        expect(vi.mocked(generateExpensePdf)).toHaveBeenCalledWith('exp-legacy');
        // Ce compteur autorise le retrait du repli (étape 7.3) : zéro
        // avertissement sur une fenêtre d'observation = suppression sûre.
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('fallback legacy'));
        warn.mockRestore();
    });
});

