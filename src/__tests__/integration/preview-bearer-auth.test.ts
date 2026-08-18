/**
 * Tests d'intégration — bearer token preview (src/auth.ts).
 *
 * Vérifie que le wrapper `auth()` reconnaît un header
 * `Authorization: Bearer $PREVIEW_TEST_TOKEN` en environnement preview et
 * retourne une session équivalente à un login one-click `preview-chvl`
 * (mêmes rôles/UL, lus depuis les vraies tables de test), et qu'il retombe
 * proprement sur NextAuth (mocké ici) quand le token est absent ou invalide.
 *
 * `next-auth` est mocké pour isoler le comportement du wrapper de la
 * mécanique NextAuth complète (hors scope ici — pas de vraie requête HTTP).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});

vi.mock('@/lib/env', () => ({ isPreview: true, isDev: false, isProd: false }));

vi.mock('next/headers', () => ({ headers: vi.fn() }));

vi.mock('next-auth', () => ({
    default: vi.fn(() => ({
        handlers: { GET: vi.fn(), POST: vi.fn() },
        signIn: vi.fn(),
        signOut: vi.fn(),
        auth: vi.fn().mockResolvedValue(null),
    })),
}));

import { headers } from 'next/headers';
import { db } from './setup';
import { auth } from '@/auth';

const PREVIEW_TOKEN = 'test-preview-secret';
const PREVIEW_EMAIL = 'preview-chvl@preview.local';
const PREVIEW_USER_ID = 'user-preview-chvl-test';

function mockAuthHeader(value: string | null) {
    vi.mocked(headers).mockResolvedValue({
        get: (name: string) => (name.toLowerCase() === 'authorization' ? value : null),
    } as unknown as Awaited<ReturnType<typeof headers>>);
}

beforeEach(async () => {
    process.env.PREVIEW_TEST_TOKEN = PREVIEW_TOKEN;

    await db.execute({
        sql: 'INSERT INTO "User" (id, email, name) VALUES (?, ?, ?)',
        args: [PREVIEW_USER_ID, PREVIEW_EMAIL, 'Chauffeur Preview'],
    });
    await db.execute({
        sql: 'INSERT INTO "UniteLocale" (id, name, slug) VALUES (?, ?, ?)',
        args: ['ul-test-preview', 'UL Test Preview', 'ul-test-preview'],
    });
    await db.execute({
        sql: 'INSERT INTO "UserUL" (userId, ulId, is_home, roles) VALUES (?, ?, 1, ?)',
        args: [PREVIEW_USER_ID, 'ul-test-preview', 'CHVL'],
    });
});

describe('auth() — bearer token preview', () => {
    it('retourne une session preview-chvl pour un token bearer valide', async () => {
        mockAuthHeader(`Bearer ${PREVIEW_TOKEN}`);

        const session = await auth();

        expect(session).not.toBeNull();
        expect(session?.user.email).toBe(PREVIEW_EMAIL);
        expect(session?.user.roles).toEqual(['CHVL']);
        expect(session?.user.ulId).toBe('ul-test-preview');
        expect(session?.user.availableULs).toHaveLength(1);
    });

    it('retombe sur NextAuth (session null) si le token est invalide', async () => {
        mockAuthHeader('Bearer wrong-token');

        const session = await auth();

        expect(session).toBeNull();
    });

    it("retombe sur NextAuth (session null) si aucun header Authorization n'est présent", async () => {
        mockAuthHeader(null);

        const session = await auth();

        expect(session).toBeNull();
    });
});
