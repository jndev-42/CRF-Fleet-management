import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));
// Un second thème de catalogue, pour exercer le chevauchement entre deux thèmes.
vi.mock('@/lib/themes/catalog', async importOriginal => {
    const actual = await importOriginal<typeof import('@/lib/themes/catalog')>();
    const themes = [...actual.SEASONAL_THEMES, { key: 'autre-theme', label: 'Autre thème', description: 'test' }];
    return { ...actual, SEASONAL_THEMES: themes, THEME_KEYS: themes.map(t => t.key) };
});

import { auth } from '@/auth';
import { GET as getActive } from '@/app/api/themes/active/route';
import { GET as getThemes } from '@/app/api/settings/themes/route';
import { PUT } from '@/app/api/settings/themes/[key]/route';
import { seedRoles, db } from './setup';

const mockedAuth = vi.mocked(auth);

const asSuperAdmin = () => mockedAuth.mockResolvedValue({ user: { email: 'sa@test.com', roles: ['SUPER_ADMIN'] } } as never);
const asRoles = (roles: string[]) => mockedAuth.mockResolvedValue({ user: { email: 'u@test.com', roles } } as never);

function callPut(key: string, body: unknown) {
    const req = new Request(`http://localhost/api/settings/themes/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return PUT(req, { params: Promise.resolve({ key }) });
}

async function insertTheme(key: string, enabled: number, start: string | null, end: string | null) {
    await db.execute({
        sql: `INSERT INTO "SeasonalTheme" (theme_key, enabled, start_date, end_date, updatedAt) VALUES (?, ?, ?, ?, ?)`,
        args: [key, enabled, start, end, new Date().toISOString()],
    });
}

beforeEach(async () => {
    await seedRoles();
    await db.execute(`DELETE FROM "SeasonalTheme"`);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-07T10:00:00Z'));
});

afterEach(() => {
    vi.useRealTimers();
});

describe('GET /api/themes/active', () => {
    it('401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        expect((await getActive()).status).toBe(401);
    });

    it('thème actif dans la plage (tout utilisateur connecté)', async () => {
        await insertTheme('vendanges-montmartre', 1, '2026-10-07', '2026-10-12');
        asRoles(['CHVL']);
        const res = await getActive();
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ theme: 'vendanges-montmartre', startDate: '2026-10-07' });
    });

    it('403 pour un compte INACTIF', async () => {
        await insertTheme('vendanges-montmartre', 1, '2026-10-07', '2026-10-12');
        asRoles(['INACTIF']);
        expect((await getActive()).status).toBe(403);
    });

    it('bascule à minuit Paris : plage finie la veille inactive, plage du lendemain active', async () => {
        vi.setSystemTime(new Date('2026-10-12T22:30:00Z'));
        asRoles(['CHVL']);
        await insertTheme('vendanges-montmartre', 1, '2026-10-07', '2026-10-12');
        expect((await (await getActive()).json()).theme).toBeNull();
        await db.execute(`UPDATE "SeasonalTheme" SET start_date = '2026-10-13', end_date = '2026-10-15'`);
        expect((await (await getActive()).json()).theme).toBe('vendanges-montmartre');
    });

    it('hors plage : null', async () => {
        await insertTheme('vendanges-montmartre', 1, '2026-09-01', '2026-10-06');
        asRoles(['CHVL']);
        expect(await (await getActive()).json()).toEqual({ theme: null, startDate: null });
    });

    it('désactivé : null', async () => {
        await insertTheme('vendanges-montmartre', 0, '2026-10-01', '2026-10-31');
        asRoles(['CHVL']);
        expect((await (await getActive()).json()).theme).toBeNull();
    });
});

describe('GET /api/settings/themes', () => {
    it('401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        expect((await getThemes()).status).toBe(401);
    });

    it('403 pour un ADMIN', async () => {
        asRoles(['ADMIN']);
        expect((await getThemes()).status).toBe(403);
    });

    it('catalogue : thème sans ligne désactivé, dates nulles', async () => {
        asSuperAdmin();
        const res = await getThemes();
        expect(res.status).toBe(200);
        const { themes } = await res.json();
        expect(themes).toHaveLength(2);
        expect(themes[0]).toMatchObject({ key: 'vendanges-montmartre', enabled: false, startDate: null, endDate: null, status: 'inactive' });
    });

    it('fusionne la ligne et calcule le statut', async () => {
        await insertTheme('vendanges-montmartre', 1, '2026-10-07', '2026-10-12');
        asSuperAdmin();
        const { themes } = await (await getThemes()).json();
        expect(themes[0]).toMatchObject({ enabled: true, startDate: '2026-10-07', endDate: '2026-10-12', status: 'active' });
    });
});

describe('PUT /api/settings/themes/[key]', () => {
    const valid = { enabled: true, startDate: '2026-10-07', endDate: '2026-10-12' };

    it('401 sans session', async () => {
        mockedAuth.mockResolvedValue(null as never);
        expect((await callPut('vendanges-montmartre', valid)).status).toBe(401);
    });

    it('403 pour un non super admin', async () => {
        asRoles(['ADMIN']);
        expect((await callPut('vendanges-montmartre', valid)).status).toBe(403);
    });

    it('404 pour une clé inconnue', async () => {
        asSuperAdmin();
        expect((await callPut('inconnu', valid)).status).toBe(404);
    });

    it.each([
        ['début après fin', { enabled: true, startDate: '2026-10-12', endDate: '2026-10-07' }],
        ['dates absentes alors qu\'activé', { enabled: true }],
        ['format invalide', { enabled: true, startDate: '07/10/2026', endDate: '2026-10-12' }],
        ['jour inexistant', { enabled: true, startDate: '2026-02-31', endDate: '2026-03-05' }],
        ['enabled manquant', { startDate: '2026-10-07', endDate: '2026-10-12' }],
    ])('400 : %s', async (_label, body) => {
        asSuperAdmin();
        const res = await callPut('vendanges-montmartre', body);
        expect(res.status).toBe(400);
        expect(typeof (await res.json()).error).toBe('string');
    });

    it('409 si la plage recouvre celle d\'un autre thème activé', async () => {
        await insertTheme('autre-theme', 1, '2026-10-10', '2026-10-20');
        asSuperAdmin();
        const res = await callPut('vendanges-montmartre', valid);
        expect(res.status).toBe(409);
        expect((await res.json()).error).toBe('Plage en conflit avec le thème Autre thème');
    });

    it('ignore une ligne dont la clé a quitté le catalogue', async () => {
        await insertTheme('theme-supprime', 1, '2026-10-10', '2026-10-20');
        asSuperAdmin();
        expect((await callPut('vendanges-montmartre', valid)).status).toBe(200);
    });

    it('pas de conflit avec un thème désactivé', async () => {
        await insertTheme('autre-theme', 0, '2026-10-10', '2026-10-20');
        asSuperAdmin();
        expect((await callPut('vendanges-montmartre', valid)).status).toBe(200);
    });

    it('enregistre (upsert) puis met à jour', async () => {
        asSuperAdmin();
        expect((await callPut('vendanges-montmartre', valid)).status).toBe(200);
        expect((await callPut('vendanges-montmartre', { enabled: false, startDate: '2026-10-08', endDate: '2026-10-09' })).status).toBe(200);
        const rows = (await db.execute(`SELECT * FROM "SeasonalTheme"`)).rows;
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ theme_key: 'vendanges-montmartre', enabled: 0, start_date: '2026-10-08', end_date: '2026-10-09', updatedBy: 'sa@test.com' });
    });

    it('le thème enregistré devient actif via /api/themes/active', async () => {
        asSuperAdmin();
        await callPut('vendanges-montmartre', valid);
        asRoles(['CHVL']);
        expect((await (await getActive()).json()).theme).toBe('vendanges-montmartre');
    });
});
