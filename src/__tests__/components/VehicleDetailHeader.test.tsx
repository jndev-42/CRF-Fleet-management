import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Les deux fonctions de règle sont espionnées SANS changer leur comportement :
// le test verrouille le rendu (disabled + title littéral) ET le câblage (quel input
// est réellement passé au helper). Sans cet espion, retirer `isDtView` de
// `eligibilityInput` resterait indétectable — la garde de rendu l.85 empêche de
// toute façon le bouton d'exister en vue DT.
vi.mock('@/lib/vehicleBorrowEligibility', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/vehicleBorrowEligibility')>();
    return {
        ...actual,
        getBorrowEligibility: vi.fn(actual.getBorrowEligibility),
        getBorrowDenialTitle: vi.fn(actual.getBorrowDenialTitle),
    };
});

import VehicleDetailHeader from '@/app/vehicles/[id]/VehicleDetailHeader';
import { getBorrowEligibility, getBorrowDenialTitle } from '@/lib/vehicleBorrowEligibility';
import type { Trip, Vehicle } from '@/app/vehicles/[id]/types';

// ── Chaînes figées, copiées de VehicleDetailHeader avant extraction du helper ──
const ALLOWED = '';
const TITLE_LICENSE = "Vos papiers n'ont pas été validés — emprunt bloqué.";
const TITLE_RESERVED = "Ce véhicule est actuellement réservé par quelqu'un d'autre.";
const TITLE_ROLE = "Vous n'avez pas les droits pour emprunter ce véhicule";

const BORROW_LABEL = 'Prendre le véhicule VL186';
const RETURN_LABEL = '✅ Rendre le véhicule';

const baseVehicle: Vehicle = {
    id: 'veh-1',
    name: 'VL186',
    type: 'VL',
    plate: 'HJ-269-FE',
    status: 'AVAILABLE',
    parkingSpot: 'Place A-1',
    fuelLevel: 80,
    mileage: 12000,
    hasDSA: false,
    desinfTracking: false,
    notes: null,
    vin: null,
    fuelType: 'Essence',
    transmission: null,
    maxFuelCapacity: 50,
    maxBatteryCapacityKwh: null,
    lastDesinfDate: null,
    nextDesinfMaxDate: null,
    firstRegistrationDate: null,
    revisionKmInterval: null,
    revisionYearInterval: null,
    trips: [],
};

const activeTrip = { id: 'trip-1' } as Trip;

function renderHeader(overrides: Partial<React.ComponentProps<typeof VehicleDetailHeader>> = {}) {
    return render(
        <VehicleDetailHeader
            vehicle={baseVehicle}
            userRoles={['CHVL']}
            isDtView={false}
            isReservedByOther={false}
            licenseBlocked={false}
            activeTrip={undefined}
            canCheckIn={false}
            onShowQR={vi.fn()}
            onToggleDSA={vi.fn()}
            onDelete={vi.fn()}
            onCheckOut={vi.fn()}
            onCheckIn={vi.fn()}
            onDeclareIncident={vi.fn()}
            onShowIncidentHistory={vi.fn()}
            onToggleMaintenance={vi.fn()}
            onEditVehicle={vi.fn()}
            onManageChecklist={vi.fn()}
            {...overrides}
        />,
    );
}

function borrowButton() {
    return screen.getByRole('button', { name: BORROW_LABEL }) as HTMLButtonElement;
}

/** Libellés des boutons d'action portant sur le véhicule lui-même (emprunt / retour). */
function vehicleActionLabels(container: HTMLElement): (string | null)[] {
    const actions = container.querySelector('.vehicle-detail-actions')!;
    return Array.from(actions.querySelectorAll('button'))
        .map(b => b.textContent)
        .filter(t => t === '🚗 Prendre le véhicule' || t === RETURN_LABEL);
}

beforeEach(() => {
    vi.clearAllMocks();
});

// ── Table de non-régression : rôle × VPSP × réservation × permis ──────────────
// Les 10 cas de la §2 de la revue de code, sur un véhicule AVAILABLE en vue UL.
const CASES: {
    name: string;
    roles: string[];
    type?: string;
    reserved?: boolean;
    license?: boolean;
    disabled: boolean;
    title: string;
}[] = [
    { name: 'ADMIN, VPSP réservé et permis bloqué : bypass complet', roles: ['ADMIN'], type: 'VPSP', reserved: true, license: true, disabled: false, title: ALLOWED },
    { name: 'CHVPSP pur, VL : refusé (aligné sur POST /api/trips)', roles: ['CHVPSP'], disabled: true, title: TITLE_ROLE },
    { name: 'CHVPSP, VPSP, rien', roles: ['CHVPSP'], type: 'VPSP', disabled: false, title: ALLOWED },
    { name: 'CHVPSP, réservé par un tiers', roles: ['CHVPSP'], reserved: true, disabled: true, title: TITLE_RESERVED },
    { name: 'CHVPSP, permis bloqué', roles: ['CHVPSP'], license: true, disabled: true, title: TITLE_LICENSE },
    { name: 'CHVL, VL, rien', roles: ['CHVL'], disabled: false, title: ALLOWED },
    { name: 'CHVL, VPSP', roles: ['CHVL'], type: 'VPSP', disabled: true, title: TITLE_ROLE },
    { name: 'CHVL, VL, réservé par un tiers', roles: ['CHVL'], reserved: true, disabled: true, title: TITLE_RESERVED },
    { name: 'CHVL, VL, permis bloqué', roles: ['CHVL'], license: true, disabled: true, title: TITLE_LICENSE },
    { name: 'CI/RPAPS : aucun rôle conducteur', roles: ['CI/RPAPS'], disabled: true, title: TITLE_ROLE },
    { name: 'GUEST : aucun rôle conducteur', roles: ['GUEST'], disabled: true, title: TITLE_ROLE },
    { name: 'SUPER_ADMIN pur : autorisé (isAdminOrAbove, comme le serveur)', roles: ['SUPER_ADMIN'], disabled: false, title: ALLOWED },
    { name: 'CHVL + CHVPSP cumulés, VPSP', roles: ['CHVL', 'CHVPSP'], type: 'VPSP', disabled: false, title: ALLOWED },
    { name: 'CHVL + CHVPSP cumulés, VL', roles: ['CHVL', 'CHVPSP'], disabled: false, title: ALLOWED },
    // Cascades distinctes : `blockingReason` vaut ROLE_NOT_ALLOWED (rôle-first) alors
    // que le `title` annonce les papiers (licence-first). A4 du plan.
    { name: 'CI/RPAPS + réservé + permis bloqué : title licence-first', roles: ['CI/RPAPS'], reserved: true, license: true, disabled: true, title: TITLE_LICENSE },
];

describe('VehicleDetailHeader — bouton « Prendre le véhicule »', () => {
    it.each(CASES)('$name', ({ roles, type, reserved, license, disabled, title }) => {
        renderHeader({
            vehicle: { ...baseVehicle, type: type ?? 'VL' },
            userRoles: roles,
            isReservedByOther: reserved ?? false,
            licenseBlocked: license ?? false,
        });

        const button = borrowButton();
        expect(button.disabled).toBe(disabled);
        expect(button.getAttribute('title')).toBe(title);
    });

    it('câble l\'input complet du helper, `isDtView` compris', () => {
        renderHeader({
            vehicle: { ...baseVehicle, type: 'VPSP' },
            userRoles: ['CHVL'],
            isReservedByOther: true,
            licenseBlocked: true,
        });

        const expectedInput = {
            vehicleStatus: 'AVAILABLE',
            vehicleType: 'VPSP',
            userRoles: ['CHVL'],
            isReservedByOther: true,
            licenseBlocked: true,
            isDtView: false,
        };
        expect(getBorrowEligibility).toHaveBeenCalledWith(expectedInput);
        expect(getBorrowDenialTitle).toHaveBeenCalledWith(expectedInput);
    });
});

describe('VehicleDetailHeader — garde de rendu par statut', () => {
    it('AVAILABLE : seul « Prendre » est rendu', () => {
        const { container } = renderHeader();

        expect(vehicleActionLabels(container)).toEqual(['🚗 Prendre le véhicule']);
        expect(screen.queryByRole('button', { name: RETURN_LABEL })).toBeNull();
    });

    it('IN_USE : un SEUL bouton, « Rendre » — « Prendre » n\'est pas rendu', () => {
        const { container } = renderHeader({
            vehicle: { ...baseVehicle, status: 'IN_USE' },
            activeTrip,
            canCheckIn: true,
        });

        expect(vehicleActionLabels(container)).toEqual([RETURN_LABEL]);
        expect(screen.queryByRole('button', { name: BORROW_LABEL })).toBeNull();
        expect(getBorrowEligibility).not.toHaveBeenCalled();
    });

    it('vue DT : ni « Prendre » ni « Rendre », aucun appel au helper', () => {
        const { container } = renderHeader({ isDtView: true });

        expect(vehicleActionLabels(container)).toEqual([]);
        expect(getBorrowEligibility).not.toHaveBeenCalled();
    });
});
