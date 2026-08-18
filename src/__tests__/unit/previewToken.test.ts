/**
 * Tests unitaires — src/lib/previewToken.ts
 *
 * `isPreview` est une constante figée à l'import de src/lib/env.ts, donc pour
 * exercer les branches preview=true / preview=false on utilise vi.doMock +
 * vi.resetModules() et un import dynamique par test plutôt qu'un vi.mock
 * statique en tête de fichier.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';

const ORIGINAL_TOKEN = process.env.PREVIEW_TEST_TOKEN;

afterEach(() => {
    if (ORIGINAL_TOKEN === undefined) {
        delete process.env.PREVIEW_TEST_TOKEN;
    } else {
        process.env.PREVIEW_TEST_TOKEN = ORIGINAL_TOKEN;
    }
    vi.doUnmock('@/lib/env');
    vi.resetModules();
});

async function loadPreviewToken(isPreview: boolean) {
    vi.resetModules();
    vi.doMock('@/lib/env', () => ({ isPreview, isDev: false, isProd: !isPreview }));
    return import('@/lib/previewToken');
}

describe('isValidPreviewTestToken', () => {
    it('refuse hors environnement preview, même avec le bon token', async () => {
        process.env.PREVIEW_TEST_TOKEN = 'secret-abc';
        const { isValidPreviewTestToken } = await loadPreviewToken(false);

        expect(isValidPreviewTestToken('Bearer secret-abc')).toBe(false);
    });

    it("refuse si PREVIEW_TEST_TOKEN n'est pas configuré (fail-closed)", async () => {
        delete process.env.PREVIEW_TEST_TOKEN;
        const { isValidPreviewTestToken } = await loadPreviewToken(true);

        expect(isValidPreviewTestToken('Bearer anything')).toBe(false);
    });

    it('refuse un header Authorization absent ou malformé', async () => {
        process.env.PREVIEW_TEST_TOKEN = 'secret-abc';
        const { isValidPreviewTestToken } = await loadPreviewToken(true);

        expect(isValidPreviewTestToken(null)).toBe(false);
        expect(isValidPreviewTestToken(undefined)).toBe(false);
        expect(isValidPreviewTestToken('secret-abc')).toBe(false); // pas de préfixe "Bearer "
    });

    it('refuse un token qui ne correspond pas au secret', async () => {
        process.env.PREVIEW_TEST_TOKEN = 'secret-abc';
        const { isValidPreviewTestToken } = await loadPreviewToken(true);

        expect(isValidPreviewTestToken('Bearer wrong-token')).toBe(false);
    });

    it('accepte le bon token en environnement preview', async () => {
        process.env.PREVIEW_TEST_TOKEN = 'secret-abc';
        const { isValidPreviewTestToken } = await loadPreviewToken(true);

        expect(isValidPreviewTestToken('Bearer secret-abc')).toBe(true);
    });
});
