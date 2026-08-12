import { describe, it, expect, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { GET } from '@/app/api/changelog/route';
import { auth } from '@/auth';

const mockedAuth = vi.mocked(auth);

describe('GET /api/changelog', () => {
    it('retourne 401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        const res = await GET();
        expect(res.status).toBe(401);
    });

    it('retourne 200 avec le contenu du CHANGELOG pour un utilisateur authentifié', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'] } } as never);
        const res = await GET();
        expect(res.status).toBe(200);
        const text = await res.text();
        expect(text).toContain('# Changelog');
    });
});
