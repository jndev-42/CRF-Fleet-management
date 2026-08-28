// @vitest-environment node
/**
 * Tests du client Cloudflare R2.
 *
 * `fetch` est remplacé pour éviter tout appel réseau : on vérifie la construction
 * des clés, le mapping des codes HTTP, le retry, et surtout qu'aucune credential
 * ne fuite dans les messages d'erreur.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const SECRET = 'SUPER-SECRET-KEY-DO-NOT-LEAK';

function setEnv(): void {
    process.env.R2_ACCESS_KEY_ID = 'AKIA-TEST';
    process.env.R2_SECRET_ACCESS_KEY = SECRET;
    process.env.R2_ENDPOINT = 'https://example.r2.cloudflarestorage.com';
    process.env.R2_BUCKET = 'expenses-reports';
}

describe('buildExpenseKey', () => {
    beforeEach(setEnv);

    it('produit une clé versionnée et unique par tentative', async () => {
        const { buildExpenseKey } = await import('@/lib/r2');
        expect(buildExpenseKey('rep-1', 2, 'abc123')).toBe('rep-1/v2-abc123.pdf');
    });

    it('assainit le suffixe de tentative', async () => {
        const { buildExpenseKey } = await import('@/lib/r2');
        expect(buildExpenseKey('rep-1', 1, '../../etc/passwd')).toBe('rep-1/v1-etcpassw.pdf');
    });

    it('refuse un reportId vide', async () => {
        const { buildExpenseKey, R2Error } = await import('@/lib/r2');
        expect(() => buildExpenseKey('', 1, 'x')).toThrow(R2Error);
    });

    it('génère des suffixes distincts — deux scellements concurrents ne peuvent pas s\'écraser', async () => {
        const { newAttemptId } = await import('@/lib/r2');
        const ids = new Set(Array.from({ length: 200 }, () => newAttemptId()));
        expect(ids.size).toBe(200);
    });
});

describe('configuration', () => {
    afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

    it('échoue avec un message lisible quand la configuration manque', async () => {
        vi.resetModules();
        delete process.env.R2_ACCESS_KEY_ID;
        delete process.env.R2_SECRET_ACCESS_KEY;
        delete process.env.R2_ENDPOINT;

        const { assertR2Configured, R2ConfigError } = await import('@/lib/r2');
        expect(() => assertR2Configured()).toThrow(R2ConfigError);
    });

    it('N\'EXPOSE JAMAIS la clé secrète dans un message d\'erreur', async () => {
        vi.resetModules();
        setEnv();
        vi.stubGlobal('fetch', vi.fn(async () => new Response('erreur', { status: 500 })));

        const { putObject } = await import('@/lib/r2');
        let message = '';
        try {
            await putObject('k.pdf', Buffer.from('x'));
        } catch (e: unknown) {
            message = e instanceof Error ? e.message : String(e);
        }
        expect(message).not.toContain(SECRET);
        expect(message).not.toContain('AKIA-TEST');
    }, 15_000);
});

describe('getObject', () => {
    beforeEach(() => { vi.resetModules(); setEnv(); });
    afterEach(() => vi.unstubAllGlobals());

    it('renvoie null sur 404 — l\'absence n\'est pas une erreur', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
        const { getObject } = await import('@/lib/r2');
        expect(await getObject('absent.pdf')).toBeNull();
    });

    it('renvoie les octets sur 200', async () => {
        const payload = Buffer.from('%PDF-1.3 contenu');
        vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(payload), { status: 200 })));
        const { getObject } = await import('@/lib/r2');
        const got = await getObject('present.pdf');
        expect(got?.equals(payload)).toBe(true);
    });

    it('réessaie puis lève sur erreur serveur persistante', async () => {
        const spy = vi.fn(async () => new Response(null, { status: 503 }));
        vi.stubGlobal('fetch', spy);
        const { getObject, R2Error } = await import('@/lib/r2');
        await expect(getObject('k.pdf')).rejects.toThrow(R2Error);
        // Un échec réseau transitoire ne doit pas bloquer une validation.
        expect(spy).toHaveBeenCalledTimes(3);
    }, 15_000);

    it('réussit si une tentative intermédiaire aboutit', async () => {
        let n = 0;
        vi.stubGlobal('fetch', vi.fn(async () => {
            n++;
            return n < 2 ? new Response(null, { status: 500 }) : new Response(new Uint8Array(Buffer.from('ok')), { status: 200 });
        }));
        const { getObject } = await import('@/lib/r2');
        expect((await getObject('k.pdf'))?.toString()).toBe('ok');
    }, 15_000);
});

describe('headObject', () => {
    beforeEach(() => { vi.resetModules(); setEnv(); });
    afterEach(() => vi.unstubAllGlobals());

    it('distingue présence et absence', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })));
        const { headObject } = await import('@/lib/r2');
        expect(await headObject('a.pdf')).toBe(true);

        vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
        expect(await headObject('b.pdf')).toBe(false);
    });
});

describe('putObject', () => {
    beforeEach(() => { vi.resetModules(); setEnv(); });
    afterEach(() => vi.unstubAllGlobals());

    it('envoie un PUT signé vers la bonne clé', async () => {
        const spy = vi.fn(async () => new Response(null, { status: 200 }));
        vi.stubGlobal('fetch', spy);
        const { putObject } = await import('@/lib/r2');
        await putObject('rep-1/v1-abc.pdf', Buffer.from('%PDF'));

        expect(spy).toHaveBeenCalledTimes(1);
        const req = (spy.mock.calls[0] as unknown as [Request])[0];
        expect(req.url).toContain('/expenses-reports/rep-1/v1-abc.pdf');
        expect(req.method).toBe('PUT');
        // aws4fetch signe la requête : l'en-tête d'autorisation doit être présent.
        expect(req.headers.get('authorization')).toBeTruthy();
    });
});
