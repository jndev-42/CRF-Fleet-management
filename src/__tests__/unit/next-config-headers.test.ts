import { describe, it, expect } from 'vitest';
import nextConfig from '../../../next.config';

describe('next.config — en-têtes de sécurité', () => {
    it('autorise la caméra pour la même origine (scanner de document) et garde le reste bloqué', async () => {
        const rules = (await nextConfig.headers?.()) ?? [];
        const policy = rules
            .flatMap((r) => r.headers)
            .find((h) => h.key === 'Permissions-Policy')?.value;

        expect(policy).toBeDefined();
        expect(policy).toContain('camera=(self)');
        expect(policy).toContain('microphone=()');
        expect(policy).toContain('geolocation=()');
    });
});
