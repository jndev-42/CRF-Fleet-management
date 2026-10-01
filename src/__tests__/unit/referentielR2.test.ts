// @vitest-environment node
/**
 * Tests des ajouts R2 du référentiel : `presignUrl`, `getObjectRange`,
 * `buildReferentielKey`. `fetch` est remplacé : aucun appel réseau.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

beforeEach(() => {
    process.env.R2_ACCESS_KEY_ID = 'AKIA-TEST';
    process.env.R2_SECRET_ACCESS_KEY = 'SECRET-TEST';
    process.env.R2_ENDPOINT = 'https://example.r2.cloudflarestorage.com';
    process.env.R2_BUCKET = 'expenses-reports';
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('buildReferentielKey', () => {
    it('préfixe `referentiels/` et finit en .pdf', async () => {
        const { buildReferentielKey } = await import('@/lib/r2');
        expect(buildReferentielKey('abc123')).toMatch(/^referentiels\/[0-9a-f-]{36}-abc123\.pdf$/);
    });

    it('produit des clés distinctes, même pour une tentative identique', async () => {
        const { buildReferentielKey } = await import('@/lib/r2');
        expect(buildReferentielKey('same')).not.toBe(buildReferentielKey('same'));
    });

    it('assainit le suffixe de tentative', async () => {
        const { buildReferentielKey } = await import('@/lib/r2');
        expect(buildReferentielKey('../../etc')).toMatch(/-etc\.pdf$/);
    });
});

describe('presignUrl', () => {
    it('signe dans l\'URL (X-Amz-Signature, X-Amz-Expires) vers /<bucket>/<clé>', async () => {
        const { presignUrl } = await import('@/lib/r2');
        const url = new URL(await presignUrl('referentiels/guide.pdf', 'PUT', 900));
        expect(url.origin).toBe('https://example.r2.cloudflarestorage.com');
        expect(url.pathname).toBe('/expenses-reports/referentiels/guide.pdf');
        expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
        expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
    });

    it('ne divulgue pas le secret', async () => {
        const { presignUrl } = await import('@/lib/r2');
        expect(await presignUrl('k.pdf', 'GET', 3600)).not.toContain('SECRET-TEST');
    });

    it('la signature dépend de la méthode', async () => {
        const { presignUrl } = await import('@/lib/r2');
        const sig = async (m: 'GET' | 'PUT') => new URL(await presignUrl('k.pdf', m, 60)).searchParams.get('X-Amz-Signature');
        expect(await sig('GET')).not.toBe(await sig('PUT'));
    });
});

describe('getObjectRange', () => {
    it('envoie Range: bytes=0-3 et renvoie les octets reçus (206)', async () => {
        const spy = vi.fn(async () => new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), { status: 206 }));
        vi.stubGlobal('fetch', spy);
        const { getObjectRange } = await import('@/lib/r2');
        const bytes = await getObjectRange('k.pdf', 0, 3);
        expect(Array.from(bytes!)).toEqual([0x25, 0x50, 0x44, 0x46]);
        const request = spy.mock.calls[0] as unknown as [Request | string, RequestInit?];
        const headers = new Headers(request[0] instanceof Request ? request[0].headers : request[1]?.headers);
        expect(headers.get('Range')).toBe('bytes=0-3');
    });

    it('renvoie null pour un objet absent (404)', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
        const { getObjectRange } = await import('@/lib/r2');
        expect(await getObjectRange('absent.pdf', 0, 3)).toBeNull();
    });
});
