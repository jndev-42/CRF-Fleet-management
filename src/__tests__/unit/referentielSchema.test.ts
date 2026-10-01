import { describe, it, expect } from 'vitest';
import { isFtsShadowTable } from '@/lib/referentiel/schema';

describe('isFtsShadowTable', () => {
    it.each(['ReferentielFts', 'ReferentielFts_data', 'ReferentielFts_idx', 'ReferentielFts_docsize', 'ReferentielFts_config'])(
        'reconnaît %s',
        name => expect(isFtsShadowTable(name)).toBe(true),
    );

    it.each(['ReferentielPage', 'Referentiel', 'User', 'ReferentielFtsExtra'])(
        'laisse passer %s',
        name => expect(isFtsShadowTable(name)).toBe(false),
    );
});
