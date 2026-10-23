/**
 * Tests du hook de la fiche véhicule — source de la liste « 2ème conducteur »
 * de l'encadré du trajet en cours.
 *
 * Fichier testé : src/app/vehicles/[id]/useVehicleDetail.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next-auth/react', () => ({
    useSession: () => ({ data: { user: { email: 'chvl@croix-rouge.fr', roles: ['CHVL'], ulId: 'ul-paris-18' } } }),
}));

import { useVehicleDetail } from '@/app/vehicles/[id]/useVehicleDetail';

function jsonResponse(data: unknown, ok = true, status = 200) {
    return { ok, status, json: async () => data } as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input: string) => {
        const url = String(input);
        if (url.startsWith('/api/vehicles/VL%20186?')) {
            return jsonResponse({ id: 'uuid-vl', name: 'VL 186', type: 'VL', trips: [], firstRegistrationDate: null });
        }
        if (url === '/api/vehicles/uuid-vl/drivers') {
            return jsonResponse({ users: [{ id: 'usr-2', name: 'Marie Martin', email: 'marie@croix-rouge.fr' }] });
        }
        return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('useVehicleDetail — candidats 2ème conducteur', () => {
    it("charge la liste depuis /api/vehicles/[uuid]/drivers, jamais depuis /api/users (réservé aux gestionnaires)", async () => {
        const { result } = renderHook(() => useVehicleDetail('VL%20186'));

        await waitFor(() => expect(result.current.users).toHaveLength(1));
        expect(result.current.users[0].email).toBe('marie@croix-rouge.fr');
        const urls = fetchMock.mock.calls.map(([u]) => String(u));
        expect(urls).toContain('/api/vehicles/uuid-vl/drivers');
        expect(urls.some(u => u.startsWith('/api/users'))).toBe(false);
    });
});
