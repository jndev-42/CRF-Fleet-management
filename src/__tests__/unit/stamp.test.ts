import { describe, it, expect } from 'vitest';
import { compressStampImage } from '@/lib/stamp';

// Un PNG 1x1 transparent minimal, encodé en base64.
const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

describe('compressStampImage', () => {
    it('retourne null pour une entrée vide', async () => {
        expect(await compressStampImage(null)).toBeNull();
        expect(await compressStampImage(undefined)).toBeNull();
        expect(await compressStampImage('')).toBeNull();
        expect(await compressStampImage('   ')).toBeNull();
    });

    it('retourne l\'entrée telle quelle si ce n\'est pas une data URI', async () => {
        const result = await compressStampImage('https://example.com/stamp.png');
        expect(result).toBe('https://example.com/stamp.png');
    });

    it('compresse une data URI PNG en une nouvelle data URI PNG', async () => {
        const input = `data:image/png;base64,${TINY_PNG_BASE64}`;
        const result = await compressStampImage(input);
        expect(result).toMatch(/^data:image\/png;base64,/);
    });
});
