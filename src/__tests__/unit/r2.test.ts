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

    it('range la révision sous ndf-revisions/<UL>/, versionnée et unique par tentative', async () => {
        const { buildExpenseKey } = await import('@/lib/r2');
        expect(buildExpenseKey('paris-18', 'rep-1', 2, 'abc123')).toBe('ndf-revisions/paris-18/rep-1-v2-abc123.pdf');
    });

    it('assainit le suffixe de tentative', async () => {
        const { buildExpenseKey } = await import('@/lib/r2');
        expect(buildExpenseKey('paris-18', 'rep-1', 1, '../../etc/passwd')).toBe('ndf-revisions/paris-18/rep-1-v1-etcpassw.pdf');
    });

    it('refuse un reportId ou un segment vide', async () => {
        const { buildExpenseKey, R2Error } = await import('@/lib/r2');
        expect(() => buildExpenseKey('paris-18', '', 1, 'x')).toThrow(R2Error);
        expect(() => buildExpenseKey('', 'rep-1', 1, 'x')).toThrow(R2Error);
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

describe('buildExpenseStagingKey', () => {
    beforeEach(setEnv);

    it('produit une clé sous le préfixe de dépôt transitoire', async () => {
        const { buildExpenseStagingKey } = await import('@/lib/r2');
        const key = buildExpenseStagingKey('staging-1', 'facture.pdf');
        expect(key).toMatch(/^expenses-staging\/staging-1\/[0-9a-f-]{36}-facture\.pdf$/);
    });

    it('assainit un nom de fichier hostile', async () => {
        // La clé est un identifiant S3 opaque, pas un chemin de fichier : « .. »
        // n'y a aucune sémantique de traversée. Ce qui compte est l'absence de
        // séparateurs et d'espaces, qui casseraient l'URL signée.
        const { buildExpenseStagingKey } = await import('@/lib/r2');
        const key = buildExpenseStagingKey('staging-1', '../../etc/passwd; rm -rf');
        expect(key).not.toContain(' ');
        expect(key).not.toContain(';');
        // Un seul « / » avant le nom assaini (staging-1/), aucun introduit par le nom lui-même.
        expect(key.split('/')).toHaveLength(3);
    });

    it('refuse un stagingId vide', async () => {
        const { buildExpenseStagingKey, R2Error } = await import('@/lib/r2');
        expect(() => buildExpenseStagingKey('', 'x.jpg')).toThrow(R2Error);
    });

    it('deux appels produisent des clés distinctes — pas de collision entre justificatifs', async () => {
        const { buildExpenseStagingKey } = await import('@/lib/r2');
        const a = buildExpenseStagingKey('staging-1', 'photo.jpg');
        const b = buildExpenseStagingKey('staging-1', 'photo.jpg');
        expect(a).not.toBe(b);
    });
});

describe('deleteObject', () => {
    beforeEach(() => { vi.resetModules(); setEnv(); });
    afterEach(() => vi.unstubAllGlobals());

    it('envoie un DELETE signé vers la bonne clé', async () => {
        const spy = vi.fn(async () => new Response(null, { status: 204 }));
        vi.stubGlobal('fetch', spy);
        const { deleteObject } = await import('@/lib/r2');
        await deleteObject('expenses-staging/x/y.jpg');

        expect(spy).toHaveBeenCalledTimes(1);
        const req = (spy.mock.calls[0] as unknown as [Request])[0];
        expect(req.url).toContain('/expenses-reports/expenses-staging/x/y.jpg');
        expect(req.method).toBe('DELETE');
    });

    it('un 404 n\'est PAS une erreur — suppression idempotente', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
        const { deleteObject } = await import('@/lib/r2');
        await expect(deleteObject('deja-absent.jpg')).resolves.toBeUndefined();
    });

    it("en mode démo, ne supprime que la copie demo/<clé> (jamais la vraie clé)", async () => {
        vi.doMock('@/lib/demo/server', () => ({ isDemoRequest: async () => true }));
        const spy = vi.fn(async () => new Response(null, { status: 204 }));
        vi.stubGlobal('fetch', spy);
        try {
            const { deleteObject } = await import('@/lib/r2');
            await deleteObject('expenses-staging/x/y.jpg');
            expect(spy).toHaveBeenCalledTimes(1);
            const req = (spy.mock.calls[0] as unknown as [Request])[0];
            expect(req.url).toContain('/expenses-reports/demo/expenses-staging/x/y.jpg');
            expect(req.method).toBe('DELETE');
        } finally {
            vi.doUnmock('@/lib/demo/server');
        }
    });
});

/** Bucket R2 simulé : `fetch` répond selon la méthode et la clé ; journal des appels. */
function fakeBucket(initial: Record<string, string>, opts: { pageSize?: number } = {}) {
    const objects = new Map(Object.entries(initial));
    const calls: string[] = [];
    const fetchMock = vi.fn(async (input: Request) => {
        const url = new URL(input.url);
        const key = decodeURIComponent(url.pathname.replace(/^\/expenses-reports\/?/, ''));
        calls.push(`${input.method} ${key}${url.searchParams.get('list-type') ? `?prefix=${url.searchParams.get('prefix')}` : ''}`);
        if (input.method === 'GET' && url.searchParams.get('list-type') === '2') {
            const prefix = url.searchParams.get('prefix') ?? '';
            const all = [...objects.keys()].filter((k) => k.startsWith(prefix)).sort();
            // Jeton de continuation opaque, comme S3 : « après cette clé » (stable malgré les suppressions).
            const after = url.searchParams.get('continuation-token');
            const remaining = after ? all.filter((k) => k > after) : all;
            const size = opts.pageSize ?? 1000;
            const page = remaining.slice(0, size);
            const truncated = remaining.length > size;
            const esc = (v: string) => v.replace(/&/g, '&amp;');
            const xml = `<ListBucketResult>${page.map((k) => `<Contents><Key>${esc(k)}</Key></Contents>`).join('')}`
                + `<IsTruncated>${truncated}</IsTruncated>${truncated ? `<NextContinuationToken>${esc(page[page.length - 1])}</NextContinuationToken>` : ''}</ListBucketResult>`;
            return new Response(xml, { status: 200 });
        }
        if (input.method === 'PUT') {
            objects.set(key, await input.text());
            return new Response(null, { status: 200 });
        }
        if (input.method === 'DELETE') {
            objects.delete(key);
            return new Response(null, { status: 204 });
        }
        const body = objects.get(key);
        if (body === undefined) return new Response(null, { status: 404 });
        return new Response(input.method === 'HEAD' ? null : body, { status: 200, headers: { 'content-length': String(body.length) } });
    });
    vi.stubGlobal('fetch', fetchMock);
    return { objects, calls };
}

describe('mode démo — clés R2 sous demo/', () => {
    beforeEach(() => {
        vi.resetModules();
        setEnv();
        vi.doMock('@/lib/demo/server', () => ({ isDemoRequest: async () => true }));
    });
    afterEach(() => {
        vi.doUnmock('@/lib/demo/server');
        vi.unstubAllGlobals();
    });

    it('putObject écrit sous demo/<clé>, jamais sur la vraie clé', async () => {
        const bucket = fakeBucket({});
        const { putObject } = await import('@/lib/r2');
        await putObject('rep-1/v1-abc.pdf', Buffer.from('%PDF-demo'));
        expect([...bucket.objects.keys()]).toEqual(['demo/rep-1/v1-abc.pdf']);
    });

    it('getObject lit demo/<clé> en priorité, puis retombe sur la vraie clé (lecture seule)', async () => {
        const bucket = fakeBucket({ 'rep-1/v1.pdf': 'PROD', 'demo/rep-2/v1.pdf': 'DEMO' });
        const { getObject, headObject, getObjectSize } = await import('@/lib/r2');
        expect((await getObject('rep-2/v1.pdf'))?.toString()).toBe('DEMO');
        expect((await getObject('rep-1/v1.pdf'))?.toString()).toBe('PROD');
        expect(await getObject('absent.pdf')).toBeNull();
        expect(await headObject('rep-1/v1.pdf')).toBe(true);
        expect(await getObjectSize('rep-2/v1.pdf')).toBe(4);
        expect(bucket.calls.filter((c) => c.startsWith('PUT') || c.startsWith('DELETE'))).toEqual([]);
    });

    it('chaîne de scellement : écrire puis relire la même clé fonctionne en démo', async () => {
        fakeBucket({});
        const { putObject, getObject } = await import('@/lib/r2');
        await putObject('rep-3/v2-x.pdf', Buffer.from('%PDF-v2'));
        expect((await getObject('rep-3/v2-x.pdf'))?.toString()).toBe('%PDF-v2');
    });

    it('deleteObject ne supprime que demo/<clé>, jamais la vraie clé', async () => {
        const bucket = fakeBucket({ 'staging/x.jpg': 'PROD', 'demo/staging/x.jpg': 'DEMO' });
        const { deleteObject } = await import('@/lib/r2');
        await deleteObject('staging/x.jpg');
        expect([...bucket.objects.keys()]).toEqual(['staging/x.jpg']);
    });

    it("presignUrl refuse PUT ; GET vise demo/<clé> si elle existe, la vraie clé sinon", async () => {
        fakeBucket({ 'demo/ref/a.pdf': 'DEMO', 'ref/b.pdf': 'PROD' });
        const { presignUrl } = await import('@/lib/r2');
        await expect(presignUrl('ref/a.pdf', 'PUT', 60)).rejects.toThrow(/mode démo/);
        expect(await presignUrl('ref/a.pdf', 'GET', 60)).toContain('/demo/ref/a.pdf?');
        const realUrl = await presignUrl('ref/b.pdf', 'GET', 60);
        expect(realUrl).toContain('/ref/b.pdf?');
        expect(realUrl).not.toContain('/demo/');
    });
});

describe('hors démo — clés inchangées', () => {
    beforeEach(() => {
        vi.resetModules();
        setEnv();
        vi.doMock('@/lib/demo/server', () => ({ isDemoRequest: async () => false }));
    });
    afterEach(() => {
        vi.doUnmock('@/lib/demo/server');
        vi.unstubAllGlobals();
    });

    it('put / get / delete utilisent la vraie clé, sans détour par demo/', async () => {
        const bucket = fakeBucket({ 'demo/rep-1/v1.pdf': 'DEMO' });
        const { putObject, getObject, deleteObject } = await import('@/lib/r2');
        await putObject('rep-1/v1.pdf', Buffer.from('PROD'));
        expect(bucket.objects.get('rep-1/v1.pdf')).toBe('PROD');
        expect((await getObject('rep-1/v1.pdf'))?.toString()).toBe('PROD');
        await deleteObject('rep-1/v1.pdf');
        expect([...bucket.objects.keys()]).toEqual(['demo/rep-1/v1.pdf']);
        expect(bucket.calls.filter((c) => c.includes('demo/'))).toEqual([]);
    });
});

describe('purgeDemoObjects', () => {
    beforeEach(() => {
        vi.resetModules();
        setEnv();
        vi.doMock('@/lib/demo/server', () => ({ isDemoRequest: async () => false }));
    });
    afterEach(() => {
        vi.doUnmock('@/lib/demo/server');
        vi.unstubAllGlobals();
    });

    it('supprime tous les objets sous demo/ (paginé) et aucun autre', async () => {
        const bucket = fakeBucket({
            'demo/a.pdf': '1', 'demo/b/c.pdf': '2', 'demo/d&e.pdf': '3',
            'rep-1/v1.pdf': 'PROD', 'demofile.pdf': 'PROD', 'vehicle-guides/x/demo/y.pdf': 'PROD',
        }, { pageSize: 2 });
        const { purgeDemoObjects } = await import('@/lib/r2');
        expect(await purgeDemoObjects()).toBe(3);
        expect([...bucket.objects.keys()].sort()).toEqual(['demofile.pdf', 'rep-1/v1.pdf', 'vehicle-guides/x/demo/y.pdf']);
        expect(bucket.calls.filter((c) => c.startsWith('GET') && c.includes('?prefix=demo/'))).toHaveLength(2);
    });

    it('ne fait rien sur un préfixe vide', async () => {
        const bucket = fakeBucket({ 'rep-1/v1.pdf': 'PROD' });
        const { purgeDemoObjects } = await import('@/lib/r2');
        expect(await purgeDemoObjects()).toBe(0);
        expect(bucket.objects.size).toBe(1);
    });
});

describe('expenseUlSegment', () => {
    it('assainit le slug', async () => {
        const { expenseUlSegment } = await import('@/lib/r2');
        expect(expenseUlSegment('paris-18', 'ul-1')).toBe('paris-18');
        expect(expenseUlSegment('a/b c..d', 'ul-1')).toBe('a_b_c__d');
    });

    it('retombe sur l\'ulId assaini si le slug est absent ou vide', async () => {
        const { expenseUlSegment } = await import('@/lib/r2');
        expect(expenseUlSegment(null, 'ul/1')).toBe('ul_1');
        expect(expenseUlSegment(undefined, 'ul-1')).toBe('ul-1');
        expect(expenseUlSegment('  ', 'ul-1')).toBe('ul-1');
    });
});

describe('buildExpensePublishedKey', () => {
    it('produit ndf/<UL>/<demandeur>-<horodatage>/note-de-frais.pdf', async () => {
        const { buildExpensePublishedKey, R2Error } = await import('@/lib/r2');
        expect(buildExpensePublishedKey('paris-18', 'jean-dupont-20261108-143000'))
            .toBe('ndf/paris-18/jean-dupont-20261108-143000/note-de-frais.pdf');
        expect(() => buildExpensePublishedKey('paris-18', '')).toThrow(R2Error);
        expect(() => buildExpensePublishedKey('', 'x')).toThrow(R2Error);
        expect(() => buildExpensePublishedKey('paris-18', '../x')).toThrow(R2Error);
        expect(() => buildExpensePublishedKey('paris-18', 'a/b')).toThrow(R2Error);
    });

    it('ancienne forme ndf/<UL>/<id>.pdf conservée pour le rangement et la suppression', async () => {
        const { buildLegacyExpensePublishedKey, R2Error } = await import('@/lib/r2');
        expect(buildLegacyExpensePublishedKey('paris-18', 'rep-1')).toBe('ndf/paris-18/rep-1.pdf');
        expect(() => buildLegacyExpensePublishedKey('paris-18', '')).toThrow(R2Error);
    });
});

describe('expensePublishedFolder', () => {
    const ID = 'ab-12cd-ef34';

    it('Jean Dupont, note créée le 08/11/2026 14:30:00 (Paris) → jean-dupont-20261108-143000-{id4}', async () => {
        const { expensePublishedFolder } = await import('@/lib/r2');
        expect(expensePublishedFolder('Jean Dupont', '2026-11-08T13:30:00.000Z', ID)).toBe('jean-dupont-20261108-143000-ab12');
    });

    it('lit CURRENT_TIMESTAMP (UTC sans fuseau) et assainit le nom', async () => {
        const { expensePublishedFolder } = await import('@/lib/r2');
        expect(expensePublishedFolder('Éloïse  O\'Brien', '2026-07-01 08:05:09', ID)).toBe('eloise-o-brien-20260701-100509-ab12');
    });

    it('stable : même note, même dossier à chaque scellement', async () => {
        const { expensePublishedFolder } = await import('@/lib/r2');
        const a = expensePublishedFolder('Jean Dupont', '2026-11-08T13:30:00.000Z', ID);
        expect(expensePublishedFolder('Jean Dupont', '2026-11-08T13:30:00.000Z', ID)).toBe(a);
    });

    it('homonymes créés à la même seconde : deux dossiers distincts', async () => {
        const { expensePublishedFolder } = await import('@/lib/r2');
        const at = '2026-11-08T13:30:00.000Z';
        expect(expensePublishedFolder('Jean Dupont', at, 'aaaa-1')).not.toBe(expensePublishedFolder('Jean Dupont', at, 'bbbb-2'));
    });

    it('replis : nom absent → sans-nom ; date illisible → sans-date ; id sans alphanumérique → 0000', async () => {
        const { expensePublishedFolder } = await import('@/lib/r2');
        expect(expensePublishedFolder(null, '2026-11-08T13:30:00.000Z', ID)).toBe('sans-nom-20261108-143000-ab12');
        expect(expensePublishedFolder('Jean', 'pas une date', ID)).toBe('jean-sans-date-ab12');
        expect(expensePublishedFolder('Jean', '2026-11-08T13:30:00.000Z', '--')).toBe('jean-20261108-143000-0000');
    });
});

describe('isExpensePublishedKeyOf', () => {
    const at = '2026-11-08T13:30:00.000Z';

    it('reconnaît la copie de la note sous n\'importe quel nom de demandeur', async () => {
        const { isExpensePublishedKeyOf } = await import('@/lib/r2');
        expect(isExpensePublishedKeyOf('ndf/paris-18/jean-dupont-20261108-143000-ab12/note-de-frais.pdf', 'paris-18', at, 'ab12-x')).toBe(true);
        expect(isExpensePublishedKeyOf('ndf/paris-18/ancien-nom-20261108-143000-ab12/note-de-frais.pdf', 'paris-18', at, 'ab12-x')).toBe(true);
    });

    it('écarte une autre note (id, horodatage, UL, forme)', async () => {
        const { isExpensePublishedKeyOf } = await import('@/lib/r2');
        expect(isExpensePublishedKeyOf('ndf/paris-18/jean-20261108-143000-zz99/note-de-frais.pdf', 'paris-18', at, 'ab12-x')).toBe(false);
        expect(isExpensePublishedKeyOf('ndf/paris-18/jean-20261108-143001-ab12/note-de-frais.pdf', 'paris-18', at, 'ab12-x')).toBe(false);
        expect(isExpensePublishedKeyOf('ndf/lyon-3/jean-20261108-143000-ab12/note-de-frais.pdf', 'paris-18', at, 'ab12-x')).toBe(false);
        expect(isExpensePublishedKeyOf('ndf/paris-18/a/b-20261108-143000-ab12/note-de-frais.pdf', 'paris-18', at, 'ab12-x')).toBe(false);
        expect(isExpensePublishedKeyOf('ndf/paris-18/ab12-x.pdf', 'paris-18', at, 'ab12-x')).toBe(false);
    });
});

describe('listObjects / deletePrefix', () => {
    afterEach(() => {
        vi.doUnmock('@/lib/demo/server');
        vi.unstubAllGlobals();
    });

    function setup(demo: boolean) {
        vi.resetModules();
        setEnv();
        vi.doMock('@/lib/demo/server', () => ({ isDemoRequest: async () => demo }));
    }

    it('listObjects : toutes les pages sous le préfixe', async () => {
        setup(false);
        fakeBucket({
            'trip-photos/p/a/emprunt/1.jpg': '1', 'trip-photos/p/a/rendu/2.jpg': '2', 'trip-photos/p/a/rendu/3.jpg': '3',
            'trip-photos/p/ab/emprunt/4.jpg': '4',
        }, { pageSize: 2 });
        const { listObjects } = await import('@/lib/r2');
        expect((await listObjects('trip-photos/p/a/')).sort()).toEqual([
            'trip-photos/p/a/emprunt/1.jpg', 'trip-photos/p/a/rendu/2.jpg', 'trip-photos/p/a/rendu/3.jpg',
        ]);
    });

    it('listObjects en démo : objets démo (sans préfixe demo/) et vrais objets, sans doublon', async () => {
        setup(true);
        fakeBucket({ 'demo/x/y/1.jpg': 'D', 'x/y/1.jpg': 'P', 'x/y/2.jpg': 'P' });
        const { listObjects } = await import('@/lib/r2');
        expect((await listObjects('x/y/')).sort()).toEqual(['x/y/1.jpg', 'x/y/2.jpg']);
    });

    it('deletePrefix : supprime le dossier, jamais un dossier voisin au même début de nom', async () => {
        setup(false);
        const bucket = fakeBucket({ 'trip-photos/p/a/emprunt/1.jpg': '1', 'trip-photos/p/a/rendu/2.jpg': '2', 'trip-photos/p/ab/emprunt/3.jpg': '3' });
        const { deletePrefix } = await import('@/lib/r2');
        expect(await deletePrefix('trip-photos/p/a')).toBe(2);
        expect([...bucket.objects.keys()]).toEqual(['trip-photos/p/ab/emprunt/3.jpg']);
    });

    it('deletePrefix en démo : seuls les objets sous demo/ partent', async () => {
        setup(true);
        const bucket = fakeBucket({ 'demo/incident-photos/p/a/1.jpg': 'D', 'incident-photos/p/a/1.jpg': 'P' });
        const { deletePrefix } = await import('@/lib/r2');
        expect(await deletePrefix('incident-photos/p/a')).toBe(1);
        expect([...bucket.objects.keys()]).toEqual(['incident-photos/p/a/1.jpg']);
    });

    it('deletePrefix refuse tout ce qui n\'est pas un dossier média complet, sans rien supprimer', async () => {
        setup(false);
        const bucket = fakeBucket({ 'trip-photos/paris-18/a/emprunt/1.jpg': '1' });
        const { deletePrefix, R2Error } = await import('@/lib/r2');
        for (const p of ['', 'trip-photos/', 'trip-photos/paris-18', 'trip-photos/paris-18/', 'trip-photos/paris-18/a/emprunt', 'ndf/paris-18/x', 'trip-photos/../x']) {
            await expect(deletePrefix(p), p).rejects.toThrow(R2Error);
        }
        expect(bucket.objects.size).toBe(1);
    });

    it('deleteMediaKey : clé validée seulement', async () => {
        setup(false);
        const key = 'mission-report-photo/paris-18/dps-x/0a1b2c3d-r.pdf';
        const bucket = fakeBucket({ [key]: 'PDF', 'ndf/paris-18/x/note-de-frais.pdf': 'N' });
        const { deleteMediaKey, R2Error } = await import('@/lib/r2');
        await deleteMediaKey(key);
        await expect(deleteMediaKey('ndf/paris-18/x/note-de-frais.pdf')).rejects.toThrow(R2Error);
        expect([...bucket.objects.keys()]).toEqual(['ndf/paris-18/x/note-de-frais.pdf']);
    });
});
