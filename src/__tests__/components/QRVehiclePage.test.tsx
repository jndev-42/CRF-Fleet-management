/**
 * Tests RTL — page `/qr/[token]` : carte « Guide de vérification » du parcours QR.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';

// Routeur STABLE : `fetchVehicle` est un `useCallback` qui en dépend.
const mockRouter = { push: vi.fn() };
vi.mock('next/navigation', () => ({
    useParams: () => ({ token: 'tok-182' }),
    useRouter: () => mockRouter,
}));

vi.mock('next-auth/react', () => ({
    useSession: () => ({ data: { user: { id: 'u-1', name: 'Test User' } } }),
}));

vi.mock('next/image', () => ({
    default: ({ alt }: { alt: string }) => <span aria-label={alt} />,
}));

import QRVehiclePage from '@/app/qr/[token]/page';

const VEHICLE = {
    id: 'veh-182',
    name: 'VPSP 182',
    plate: 'AB-123-CD',
    type: 'VPSP',
    status: 'AVAILABLE',
    fuelLevel: 80,
    mileage: 12000,
    fuelType: 'Diesel',
    hasDSA: false,
    desinfTracking: false,
    parkingSpot: null,
    connection: null,
    maxFuelCapacity: null,
    activeTrip: null,
    guideFileName: 'VPSP 182.pdf',
    guideSize: 1_400_995,
    guideUpdatedAt: '2026-10-01T10:00:00.000Z',
};

function mockVehicle(overrides: Record<string, unknown> = {}) {
    vi.spyOn(global, 'fetch').mockImplementation(async () =>
        new Response(JSON.stringify({ ...VEHICLE, ...overrides }), { status: 200 }));
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('QRVehiclePage — guide de vérification', () => {
    it('affiche la carte guide quand le véhicule en a un, avec un téléchargement par la route QR', async () => {
        mockVehicle();
        render(<QRVehiclePage />);

        expect(await screen.findByText('Guide de vérification')).toBeTruthy();
        expect(screen.getByText('VPSP 182.pdf')).toBeTruthy();
        const link = screen.getByRole('link', { name: /Télécharger/ });
        expect(link.getAttribute('href')).toBe('/api/qr/tok-182/guide?download=1');
    });

    it("n'affiche pas la carte quand le véhicule n'a pas de guide", async () => {
        mockVehicle({ guideFileName: null, guideSize: null, guideUpdatedAt: null });
        render(<QRVehiclePage />);

        expect(await screen.findByText('VPSP 182')).toBeTruthy();
        expect(screen.queryByText('Guide de vérification')).toBeNull();
    });
});
