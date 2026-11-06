/**
 * Mode démo : aucun appel au constructeur. Les identifiants et sessions sont ceux de
 * la prod ; une authentification depuis la démo ferait tourner leurs jetons.
 * L'erreur est transitoire : elle ne change jamais le statut d'une connexion.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@/lib/demo/server', () => ({ isDemoRequest: vi.fn(async () => true) }));
vi.mock('@/lib/db', () => ({ db: { execute: vi.fn() } }));

import { authenticateBrand, fetchRenaultVehicleData, BrandTransientError, type ConnectionContext } from '@/lib/renault';
import { db } from '@/lib/db';

const ctx: ConnectionContext = {
    vehicleId: 'v1',
    credentialId: 'cred-1',
    brand: 'RENAULT',
    login: 'compte@croix-rouge.fr',
    password: 'secret',
    vin: 'VF1AB123456789012',
};

describe('renault — mode démo', () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    afterEach(() => fetchSpy.mockClear());

    it('authenticateBrand lève une erreur transitoire « indisponible en mode démo », sans réseau ni base', async () => {
        const err = await authenticateBrand(ctx).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(BrandTransientError);
        expect((err as Error).message).toMatch(/indisponible en mode démo/);
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(vi.mocked(db.execute)).not.toHaveBeenCalled();
    });

    it('fetchRenaultVehicleData lève la même erreur', async () => {
        await expect(fetchRenaultVehicleData(ctx)).rejects.toThrow(/indisponible en mode démo/);
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});
