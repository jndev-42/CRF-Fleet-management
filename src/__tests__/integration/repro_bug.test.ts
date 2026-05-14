import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { POST } from '@/app/api/users/route';
import { auth } from '@/auth';
import { db, seedRoles } from './setup';

const mockedAuth = vi.mocked(auth);

function makePostRequest(body: Record<string, unknown>): Request {
    return new Request('http://localhost/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

const adminSession = { user: { email: 'admin@test.com', roles: ['ADMIN'] } };

describe('Reproduction Bug: Papiers valides par défaut à la création', () => {
    it('devrait initialiser papiers_valides à 0 pour un nouveau chauffeur', async () => {
        await seedRoles();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock session shape
        mockedAuth.mockResolvedValue(adminSession as any);

        const res = await POST(makePostRequest({
            email: 'new-driver@test.com',
            name: 'New Driver',
            roles: ['CHVL']
        }));

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.success).toBe(true);
        const userId = body.id;

        const userRes = await db.execute({
            sql: 'SELECT papiers_valides, start_date_invalidation_process FROM "User" WHERE id = ?',
            args: [userId]
        });

        const user = userRes.rows[0];
        // Ce test est censé ÉCHOUER avant le fix (papiers_valides sera 1 par défaut via le schéma DB)
        expect(user.papiers_valides).toBe(0);
        expect(user.start_date_invalidation_process).not.toBeNull();
    });
});
