/**
 * Tests unitaires — garde du suivi technique (`src/lib/fleetTracking/access.ts`) :
 * `ownsResource`, `activeUlId`, `parseBody`.
 */
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';

vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { activeUlId, ownsResource, parseBody } from '@/lib/fleetTracking/access';

describe('activeUlId', () => {
    it('renvoie l\'UL réelle, null pour absente, vide ou sentinelle', () => {
        expect(activeUlId('ul-a')).toBe('ul-a');
        expect(activeUlId('default')).toBeNull();
        expect(activeUlId('')).toBeNull();
        expect(activeUlId(undefined)).toBeNull();
        expect(activeUlId(42)).toBeNull();
    });
});

describe('ownsResource', () => {
    it('vrai seulement pour une ressource de l\'UL de session', () => {
        expect(ownsResource({ roles: ['RESP_VEHICULE'], ulId: 'ul-a' }, 'ul-a')).toBe(true);
        expect(ownsResource({ roles: ['RESP_VEHICULE'], ulId: 'ul-a' }, 'ul-b')).toBe(false);
        expect(ownsResource({ roles: ['ADMIN'], ulId: 'ul-a' }, null)).toBe(false);
    });

    it('un SUPER_ADMIN n\'agit que sur son UL active', () => {
        expect(ownsResource({ roles: ['SUPER_ADMIN'], ulId: 'ul-a' }, 'ul-a')).toBe(true);
        expect(ownsResource({ roles: ['SUPER_ADMIN'], ulId: 'ul-a' }, 'ul-b')).toBe(false);
    });

    it('la sentinelle « default » ne possède rien, même à égalité', () => {
        expect(ownsResource({ roles: ['ADMIN'], ulId: 'default' }, 'default')).toBe(false);
    });
});

describe('parseBody', () => {
    const schema = z.object({ name: z.string().min(1, 'Nom requis') }).strict();
    const req = (body: string) => new Request('http://localhost/x', { method: 'POST', body });

    it('renvoie la donnée typée', async () => {
        expect(await parseBody(req('{"name":"A"}'), schema)).toEqual({ data: { name: 'A' } });
    });

    it('400 « Corps invalide » sur un JSON illisible', async () => {
        const r = await parseBody(req('{'), schema);
        expect('response' in r && r.response.status).toBe(400);
        if ('response' in r) expect((await r.response.json()).error).toBe('Corps invalide');
    });

    it('400 avec le premier message Zod sur un schéma non respecté', async () => {
        const r = await parseBody(req('{"name":""}'), schema);
        if (!('response' in r)) throw new Error('400 attendu');
        expect(r.response.status).toBe(400);
        const body = await r.response.json();
        expect(body.error).toBe('Données invalides : Nom requis');
        expect(Array.isArray(body.details)).toBe(true);
    });
});
