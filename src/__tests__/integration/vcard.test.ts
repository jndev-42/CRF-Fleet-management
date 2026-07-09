import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/db', async () => {
    const { db } = await import('./setup');
    return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/auth';
import { GET } from '@/app/api/vcard/route';
import { db } from './setup';

const mockedAuth = vi.mocked(auth);

beforeEach(async () => {
    // Clear dynamic tables
    await db.execute(`DELETE FROM "UniteLocale"`);
});

describe('GET /api/vcard', () => {
    it('returns 401 when unauthenticated', async () => {
        // @ts-expect-error — null session for test
        mockedAuth.mockResolvedValue(null);
        
        const res = await GET();
        expect(res.status).toBe(401);
    });

    it('returns 200 and generated VCard content when authenticated', async () => {
        mockedAuth.mockResolvedValue({ user: { email: 'user@test.com', roles: ['CHVL'] } } as never);

        // Seed some local units with telephone numbers
        await db.execute({
            sql: `INSERT INTO "UniteLocale" (id, name, slug, phoneNumbers) VALUES (?, ?, ?, ?)`,
            args: ['ul-p15', 'Paris 15', 'paris-15', JSON.stringify([
                { label: 'DLUS', number: '06 99 88 77 66' },
                { label: 'MOT', number: '06 55 44 33 22' }
            ])]
        });

        await db.execute({
            sql: `INSERT INTO "UniteLocale" (id, name, slug, phoneNumbers) VALUES (?, ?, ?, ?)`,
            args: ['ul-p20', 'Paris 20', 'paris-20', JSON.stringify([
                { label: 'DLUSA', number: '06 12 34 56 78' }
            ])]
        });

        const res = await GET();
        expect(res.status).toBe(200);
        expect(res.headers.get('Content-Type')).toContain('text/vcard');
        expect(res.headers.get('Content-Disposition')).toContain('filename="Annuaire_CRF_Paris.vcf"');

        const text = await res.text();

        // Check dynamic contacts are present and formatted
        expect(text).toContain('FN:DLUS Paris 15');
        expect(text).toContain('TEL;TYPE=CELL:0699887766');

        expect(text).toContain('FN:MOT Paris 15');
        expect(text).toContain('TEL;TYPE=CELL:0655443322');

        expect(text).toContain('FN:DLUSA Paris 20');
        expect(text).toContain('TEL;TYPE=CELL:0612345678');

        // Check static general contacts are present
        expect(text).toContain('FN:Onyx 75');
        expect(text).toContain('TEL;TYPE=CELL:0184832800');
        expect(text).toContain('FN:COT 75 - Standard');
        expect(text).toContain('TEL;TYPE=WORK:0184833600');
    });
});
