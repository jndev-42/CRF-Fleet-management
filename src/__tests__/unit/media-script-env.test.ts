// @vitest-environment node
/** Garde des scripts de migration R2 : `R2_BUCKET` explicite obligatoire. */
import { describe, it, expect } from 'vitest';
import { MissingR2BucketError, requireExplicitR2Bucket } from '@/lib/media/script-env';

describe('requireExplicitR2Bucket', () => {
    it('renvoie le bucket configuré (espaces retirés)', () => {
        expect(requireExplicitR2Bucket({ R2_BUCKET: ' crf-preview ' })).toBe('crf-preview');
    });

    it.each([[undefined], [''], ['   ']])('refuse un R2_BUCKET absent ou vide (%s) avec un message clair', (value) => {
        expect(() => requireExplicitR2Bucket({ R2_BUCKET: value })).toThrow(MissingR2BucketError);
        expect(() => requireExplicitR2Bucket({ R2_BUCKET: value })).toThrow(/R2_BUCKET/);
    });

    it("ne retombe jamais sur le bucket de production par défaut", () => {
        expect(() => requireExplicitR2Bucket({})).toThrow(/production/);
    });
});
