/**
 * Tests RTL — page `/qr/[token]` : carte « Documents liés au véhicule » du parcours QR.
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
    documents: [
        { id: 'doc-1', fileName: 'VPSP 182.pdf', size: 1_400_995, createdAt: '2026-10-01T10:00:00.000Z' },
        { id: 'doc-2', fileName: 'Carte grise.pdf', size: 52_000, createdAt: '2026-10-02T10:00:00.000Z' },
    ],
};

function mockVehicle(overrides: Record<string, unknown> = {}) {
    vi.spyOn(global, 'fetch').mockImplementation(async () =>
        new Response(JSON.stringify({ ...VEHICLE, ...overrides }), { status: 200 }));
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('QRVehiclePage — documents liés', () => {
    it('affiche un document par ligne, chacun téléchargeable par la route QR', async () => {
        mockVehicle();
        render(<QRVehiclePage />);

        expect(await screen.findByText('Documents liés au véhicule')).toBeTruthy();
        expect(screen.getByText('VPSP 182.pdf')).toBeTruthy();
        expect(screen.getByText('Carte grise.pdf')).toBeTruthy();
        const link = screen.getByRole('link', { name: 'Télécharger Carte grise.pdf' });
        expect(link.getAttribute('href')).toBe('/api/qr/tok-182/documents/doc-2?download=1');
    });

    it("n'affiche pas la carte quand le véhicule n'a aucun document", async () => {
        mockVehicle({ documents: [] });
        render(<QRVehiclePage />);

        expect(await screen.findByText('VPSP 182')).toBeTruthy();
        expect(screen.queryByText('Documents liés au véhicule')).toBeNull();
    });
});

describe('QRVehiclePage — photo', () => {
    const THUMBNAIL = 'Agrandir la photo du véhicule VPSP 182';

    it('affiche la vignette avec l\'URL versionnée de la route QR', async () => {
        mockVehicle({ photoUpdatedAt: '2026-11-06T10:00:00.000Z' });
        render(<QRVehiclePage />);

        const thumbnail = await screen.findByRole('button', { name: THUMBNAIL });
        expect(thumbnail.querySelector('img')?.getAttribute('src'))
            .toBe('/api/qr/tok-182/photo?v=2026-11-06T10%3A00%3A00.000Z');
    });

    it("n'affiche aucune vignette quand le véhicule n'a pas de photo", async () => {
        mockVehicle({ photoUpdatedAt: null });
        render(<QRVehiclePage />);

        expect(await screen.findByText('VPSP 182')).toBeTruthy();
        expect(screen.queryByRole('button', { name: THUMBNAIL })).toBeNull();
    });
});

describe('QRVehiclePage — papiers de conduite', () => {
    function mockFetch(licenseBlocked: boolean) {
        vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
            const url = String(input);
            if (url === '/api/me/license-check') {
                return new Response(JSON.stringify({ validated: !licenseBlocked, daysLeft: 0, blocked: licenseBlocked }), { status: 200 });
            }
            return new Response(JSON.stringify(VEHICLE), { status: 200 });
        });
    }

    it("bloque le bouton d'emprunt quand les papiers sont bloqués", async () => {
        mockFetch(true);
        render(<QRVehiclePage />);

        const button = await screen.findByRole('button', { name: /Emprunter ce véhicule/ });
        await screen.findByRole('alert');
        expect((button as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByRole('alert').textContent).toMatch(/papiers n.ont pas été validés dans les délais/);
    });

    it("laisse le bouton d'emprunt actif quand les papiers sont valides", async () => {
        mockFetch(false);
        render(<QRVehiclePage />);

        const button = await screen.findByRole('button', { name: /Emprunter ce véhicule/ });
        expect((button as HTMLButtonElement).disabled).toBe(false);
        expect(screen.queryByRole('alert')).toBeNull();
    });
});
