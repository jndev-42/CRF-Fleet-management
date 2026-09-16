/**
 * Test de COMPOSITION des deux bandeaux de la fiche véhicule (critères 1.3, 1.4, 1.5).
 *
 * On monte le VRAI composant `VehicleDetailBanners`, celui que `page.tsx` rend : les
 * gates testés ici (`vehicle?.activeMaintenance` et `canEndMaintenance={!activeTrip}`)
 * sont ceux de production, pas une copie. Redéclarer la composition dans le test
 * laisserait passer une régression sur `page.tsx` sans faire rougir un seul cas.
 *
 * On ne monte pas la page entière : elle reste un Client Component à `useEffect`
 * (M-4, pas de conversion Server Component prévue) et son montage imposerait de mocker
 * `useSession`, `useUL`, `useRouter` et une demi-douzaine de `fetch` sans rien tester
 * de plus que ce composant.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import VehicleDetailBanners from '@/app/vehicles/[id]/VehicleDetailBanners';
import type { Trip, Vehicle } from '@/app/vehicles/[id]/types';

const MAINTENANCE_TEXT = '🔧 Ce véhicule est actuellement en maintenance';
const MISSION_TEXT = '🧑‍✈️ En mission avec Marie Curie';
const RETURN_LABEL = '✅ Rendre';
const END_MAINTENANCE_LABEL = '✅ Remettre en service';

const activeMaintenance = {
    id: 'm-1',
    startDate: '2026-07-20T08:30:00.000Z',
    endDate: null,
    reason: 'Panne embrayage',
};

const baseVehicle: Vehicle = {
    id: 'veh-1',
    name: 'VL186',
    type: 'VL',
    plate: 'HJ-269-FE',
    status: 'IN_USE',
    parkingSpot: 'Place A-1',
    fuelLevel: 80,
    mileage: 12000,
    hasDSA: false,
    desinfTracking: false,
    notes: null,
    vin: null,
    connection: null,
    fuelType: 'Essence',
    transmission: null,
    maxFuelCapacity: 50,
    maxBatteryCapacityKwh: null,
    lastDesinfDate: null,
    nextDesinfMaxDate: null,
    firstRegistrationDate: null,
    revisionKmInterval: null,
    revisionYearInterval: null,
    activeMaintenance,
    trips: [],
};

const activeTrip = {
    id: 'trip-1',
    driverName: 'Marie Curie',
    driverEmail: 'marie@dev.local',
    secondDriverName: null,
    missionType: 'Poste de secours',
    missionName: 'Festival',
    checkOutAt: '2026-07-21T08:00:00.000Z',
    checkInAt: null,
} as Trip;

/** Monte le composant de production avec les props que `page.tsx` lui passe. */
function renderBanners(opts: {
    vehicle?: Vehicle;
    activeTrip?: Trip | null;
    userRoles?: string[];
} = {}) {
    const vehicle = opts.vehicle ?? baseVehicle;
    const trip = opts.activeTrip === undefined ? activeTrip : opts.activeTrip;
    const userRoles = opts.userRoles ?? ['ADMIN'];

    return render(
        <VehicleDetailBanners
            vehicle={vehicle}
            activeTrip={trip}
            userRoles={userRoles}
            currentUserEmail="marie@dev.local"
            users={[]}
            canCheckIn
            onShowDesinfPre={vi.fn()}
            onEditCheckOut={vi.fn()}
            onCheckIn={vi.fn()}
            onSecondDriverAdded={vi.fn()}
            showToast={vi.fn()}
            onEndMaintenance={vi.fn()}
        />,
    );
}

describe('Bandeaux de la fiche véhicule — composition page.tsx', () => {
    it('1.3 — le bandeau maintenance s\'affiche même sur un véhicule IN_USE', () => {
        renderBanners();
        expect(screen.getByText(MAINTENANCE_TEXT)).toBeTruthy();
    });

    it('1.3 — pas de bandeau maintenance sans activeMaintenance, quel que soit le statut', () => {
        renderBanners({ vehicle: { ...baseVehicle, activeMaintenance: null } });
        expect(screen.queryByText(MAINTENANCE_TEXT)).toBeNull();

        renderBanners({
            vehicle: { ...baseVehicle, status: 'AVAILABLE', activeMaintenance: null },
            activeTrip: null,
        });
        expect(screen.queryByText(MAINTENANCE_TEXT)).toBeNull();
    });

    it('1.4 — les DEUX bandeaux cohabitent dans le même rendu', () => {
        const { container } = renderBanners();

        // Bandeau « en mission » (texte éclaté en plusieurs nœuds → assertion sur le textContent).
        expect(container.textContent).toContain(MISSION_TEXT);
        // ET bandeau maintenance, dans le même rendu.
        expect(screen.getByText(MAINTENANCE_TEXT)).toBeTruthy();
    });

    it('1.5 — la restitution reste accessible, la remise en service est verrouillée', () => {
        renderBanners();

        expect(screen.getByRole('button', { name: RETURN_LABEL })).toBeTruthy();
        // `canEndMaintenance={!activeTrip}` → faux tant que le trajet est ouvert.
        expect(screen.queryByRole('button', { name: END_MAINTENANCE_LABEL })).toBeNull();
    });

    it('une fois le véhicule rendu, la remise en service redevient offerte à l\'ADMIN', () => {
        renderBanners({
            vehicle: { ...baseVehicle, status: 'MAINTENANCE' },
            activeTrip: null,
        });

        expect(screen.queryByRole('button', { name: RETURN_LABEL })).toBeNull();
        expect(screen.getByRole('button', { name: END_MAINTENANCE_LABEL })).toBeTruthy();
    });

    it('un non-ADMIN voit les deux bandeaux mais aucune action de maintenance', () => {
        const { container } = renderBanners({ userRoles: ['CHVL'] });

        expect(container.textContent).toContain(MISSION_TEXT);
        expect(screen.getByText(MAINTENANCE_TEXT)).toBeTruthy();
        expect(screen.queryByRole('button', { name: END_MAINTENANCE_LABEL })).toBeNull();
    });
});
