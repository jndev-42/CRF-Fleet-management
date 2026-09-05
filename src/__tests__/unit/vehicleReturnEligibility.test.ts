import { describe, it, expect } from 'vitest';
import {
    getReturnEligibility,
    type ReturnEligibilityInput,
} from '@/lib/vehicleReturnEligibility';

const ME = 'me@dev.local';
const OTHER = 'someone.else@dev.local';

function input(overrides: Partial<ReturnEligibilityInput> = {}): ReturnEligibilityInput {
    return {
        vehicleStatus: 'IN_USE',
        activeTrip: { driverEmail: ME, secondDriverEmail: null },
        currentUserEmail: ME,
        isDtView: false,
        ...overrides,
    };
}

describe('getReturnEligibility — autorisations', () => {
    it('conducteur principal de son propre trajet : autorisé', () => {
        expect(getReturnEligibility(input())).toEqual({ canReturn: true, blockingReason: null });
    });

    it('second conducteur de son propre trajet : autorisé', () => {
        const res = getReturnEligibility(input({
            activeTrip: { driverEmail: OTHER, secondDriverEmail: ME },
        }));
        expect(res).toEqual({ canReturn: true, blockingReason: null });
    });
});

describe('getReturnEligibility — refus', () => {
    it('trajet ouvert par un tiers : NOT_MY_TRIP', () => {
        const res = getReturnEligibility(input({
            activeTrip: { driverEmail: OTHER, secondDriverEmail: null },
        }));
        expect(res).toEqual({ canReturn: false, blockingReason: 'NOT_MY_TRIP' });
    });

    it('véhicule AVAILABLE : NOT_IN_USE', () => {
        const res = getReturnEligibility(input({ vehicleStatus: 'AVAILABLE' }));
        expect(res).toEqual({ canReturn: false, blockingReason: 'NOT_IN_USE' });
    });

    it('véhicule MAINTENANCE : NOT_IN_USE', () => {
        const res = getReturnEligibility(input({ vehicleStatus: 'MAINTENANCE' }));
        expect(res).toEqual({ canReturn: false, blockingReason: 'NOT_IN_USE' });
    });

    it('IN_USE sans trajet actif projeté : NO_ACTIVE_TRIP', () => {
        const res = getReturnEligibility(input({ activeTrip: undefined }));
        expect(res).toEqual({ canReturn: false, blockingReason: 'NO_ACTIVE_TRIP' });
    });

    it('isDtView : DT_VIEW, évalué avant toute autre règle', () => {
        const res = getReturnEligibility(input({ isDtView: true }));
        expect(res).toEqual({ canReturn: false, blockingReason: 'DT_VIEW' });
    });
});

describe('getReturnEligibility — divergence assumée avec la fiche véhicule', () => {
    // `src/app/vehicles/[id]/page.tsx:145` autorise l'ADMIN à clore le trajet d'un tiers.
    // La CTA du dashboard ne le fait PAS, et ce test verrouille cette différence : la
    // fiche répond « ai-je le droit de faire ce check-in ? », la CTA « ai-je emprunté ce
    // véhicule ? ». Sans cette règle stricte, un ADMIN verrait toute la flotte en mission
    // proposée au retour depuis son tableau de bord.
    it('🔴 un ADMIN ne peut PAS rendre depuis le dashboard le trajet d\'un tiers (pas de bypass, contrairement à la fiche véhicule)', () => {
        const res = getReturnEligibility({
            vehicleStatus: 'IN_USE',
            activeTrip: { driverEmail: OTHER, secondDriverEmail: null },
            currentUserEmail: 'admin@dev.local',
        });
        expect(res).toEqual({ canReturn: false, blockingReason: 'NOT_MY_TRIP' });
    });
});

describe('getReturnEligibility — emails absents ou vides', () => {
    it('currentUserEmail null : jamais de match', () => {
        const res = getReturnEligibility(input({ currentUserEmail: null }));
        expect(res).toEqual({ canReturn: false, blockingReason: 'NOT_MY_TRIP' });
    });

    it('currentUserEmail undefined : jamais de match', () => {
        const res = getReturnEligibility(input({ currentUserEmail: undefined }));
        expect(res).toEqual({ canReturn: false, blockingReason: 'NOT_MY_TRIP' });
    });

    it('currentUserEmail vide face à un trajet sans emails : jamais de match', () => {
        const res = getReturnEligibility(input({
            currentUserEmail: '',
            activeTrip: { driverEmail: null, secondDriverEmail: null },
        }));
        expect(res).toEqual({ canReturn: false, blockingReason: 'NOT_MY_TRIP' });
    });

    it('emails du trajet null/undefined face à un utilisateur identifié : jamais de match', () => {
        expect(getReturnEligibility(input({
            activeTrip: { driverEmail: null, secondDriverEmail: null },
        }))).toEqual({ canReturn: false, blockingReason: 'NOT_MY_TRIP' });

        expect(getReturnEligibility(input({
            activeTrip: {},
        }))).toEqual({ canReturn: false, blockingReason: 'NOT_MY_TRIP' });
    });

    it("email vide côté trajet face à un email vide côté session : jamais de match", () => {
        const res = getReturnEligibility(input({
            currentUserEmail: '',
            activeTrip: { driverEmail: '', secondDriverEmail: '' },
        }));
        expect(res).toEqual({ canReturn: false, blockingReason: 'NOT_MY_TRIP' });
    });
});
