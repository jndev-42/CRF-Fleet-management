/**
 * Tests RTL — page `/vehicles/[id]` : carte « Documents liés au véhicule ».
 * Le hook de données et les sections voisines sont remplacés par des doubles : seule
 * la carte des documents et son câblage (URL par document) sont l'objet du test.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRouter = { push: vi.fn() };
vi.mock('next/navigation', () => ({
    useParams: () => ({ id: 'VPSP 182' }),
    useRouter: () => mockRouter,
    useSearchParams: () => new URLSearchParams(),
}));

const hookState = vi.hoisted(() => ({ vehicle: null as Record<string, unknown> | null }));
vi.mock('@/app/vehicles/[id]/useVehicleDetail', () => ({
    useVehicleDetail: () => ({
        vehicle: hookState.vehicle,
        setVehicle: vi.fn(),
        renaultData: null,
        setRenaultData: vi.fn(),
        loading: false,
        loadingRenault: false,
        userRoles: ['ADMIN'],
        currentUserEmail: 'admin@test.com',
        currentUserUlId: 'ul-paris-18',
        licenseBlocked: false,
        users: [],
        maintenanceRecords: [],
        fetchVehicle: vi.fn(),
        bumpMaintenanceRefresh: vi.fn(),
    }),
}));

// Sections voisines : sans intérêt ici (et chacune a ses propres appels réseau).
vi.mock('@/app/vehicles/[id]/VehicleDetailHeader', () => ({ default: () => null }));
vi.mock('@/app/vehicles/[id]/VehicleDetailBanners', () => ({ default: () => null }));
vi.mock('@/app/vehicles/[id]/VehicleDetailGrid', () => ({ default: () => null }));
vi.mock('@/app/vehicles/[id]/TripHistoryList', () => ({ default: () => null }));
vi.mock('@/components/vehicle/ReservationBlock', () => ({ default: () => null }));
vi.mock('@/components/vehicle/VehicleConnectionBlock', () => ({ default: () => null }));
vi.mock('@/components/vehicle/VehicleNotes', () => ({ default: () => null }));
// La liseuse charge pdf.js : hors sujet.
vi.mock('@/components/ui/PdfReader', () => ({ default: () => null }));

import VehicleDetailPage from '@/app/vehicles/[id]/page';

const VEHICLE = {
    id: 'veh-182',
    name: 'VPSP 182',
    type: 'VPSP',
    plate: 'AB-123-CD',
    status: 'AVAILABLE',
    ulId: 'ul-paris-18',
    hasDSA: false,
    trips: [],
    documents: [
        { id: 'doc-1', fileName: 'Guide 182.pdf', size: 1_400_995, createdAt: '2026-10-01T10:00:00.000Z' },
        { id: 'doc-2', fileName: 'Carte grise.pdf', size: 52_000, createdAt: '2026-10-02T10:00:00.000Z' },
    ],
};

beforeEach(() => {
    hookState.vehicle = { ...VEHICLE };
});

describe('VehicleDetailPage — documents liés', () => {
    it('affiche un document par ligne, téléchargeable par la route du véhicule (nom encodé)', () => {
        render(<VehicleDetailPage />);

        expect(screen.getByText('Documents liés au véhicule')).toBeTruthy();
        expect(screen.getByText('Guide 182.pdf')).toBeTruthy();
        const link = screen.getByRole('link', { name: 'Télécharger Carte grise.pdf' });
        expect(link.getAttribute('href')).toBe('/api/vehicles/VPSP%20182/documents/doc-2?download=1');
    });

    it("n'affiche aucune carte quand le véhicule n'a aucun document", () => {
        hookState.vehicle = { ...VEHICLE, documents: [] };
        render(<VehicleDetailPage />);

        expect(screen.queryByText('Documents liés au véhicule')).toBeNull();
    });

    it("n'affiche aucune carte quand la liste des documents est absente", () => {
        hookState.vehicle = { ...VEHICLE, documents: undefined };
        render(<VehicleDetailPage />);

        expect(screen.queryByText('Documents liés au véhicule')).toBeNull();
    });
});
