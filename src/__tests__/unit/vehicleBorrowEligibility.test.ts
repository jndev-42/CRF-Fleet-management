import { describe, it, expect } from 'vitest';
import {
    getBorrowEligibility,
    getBorrowDenialTitle,
    getBorrowCtaState,
    isVpspVehicle,
    BORROW_CTA_MESSAGES,
    type BorrowEligibilityInput,
} from '@/lib/vehicleBorrowEligibility';

function input(overrides: Partial<BorrowEligibilityInput> = {}): BorrowEligibilityInput {
    return {
        vehicleStatus: 'AVAILABLE',
        vehicleType: 'VL',
        userRoles: ['CHVL'],
        isReservedByOther: false,
        licenseBlocked: false,
        isDtView: false,
        ...overrides,
    };
}

describe('isVpspVehicle', () => {
    it('reconnaît un type VPSP quelle que soit la casse', () => {
        expect(isVpspVehicle('vpsp 3')).toBe(true);
        expect(isVpspVehicle('VPSP')).toBe(true);
    });

    it('rejette un type VL', () => {
        expect(isVpspVehicle('VL')).toBe(false);
    });
});

describe('getBorrowEligibility', () => {
    it('ADMIN bypasse VPSP, réservation tierce et permis bloqué', () => {
        const res = getBorrowEligibility(input({
            userRoles: ['ADMIN'],
            vehicleType: 'VPSP',
            isReservedByOther: true,
            licenseBlocked: true,
        }));
        expect(res).toEqual({ canBorrow: true, blockingReason: null });
    });

    it('CHVPSP peut emprunter un VPSP disponible', () => {
        expect(getBorrowEligibility(input({ userRoles: ['CHVPSP'], vehicleType: 'VPSP' })))
            .toEqual({ canBorrow: true, blockingReason: null });
    });

    it('CHVPSP pur face à un VL → VL_REQUIRES_CHVL (aligné sur POST /api/trips)', () => {
        expect(getBorrowEligibility(input({ userRoles: ['CHVPSP'], vehicleType: 'VL' })))
            .toEqual({ canBorrow: false, blockingReason: 'VL_REQUIRES_CHVL' });
    });

    it('SUPER_ADMIN pur est autorisé — isAdminOrAbove, comme le serveur', () => {
        expect(getBorrowEligibility(input({ userRoles: ['SUPER_ADMIN'] })))
            .toEqual({ canBorrow: true, blockingReason: null });
    });

    it('CHVL + CHVPSP cumulés sont autorisés sur les deux types', () => {
        expect(getBorrowEligibility(input({ userRoles: ['CHVL', 'CHVPSP'], vehicleType: 'VL' })))
            .toEqual({ canBorrow: true, blockingReason: null });
        expect(getBorrowEligibility(input({ userRoles: ['CHVL', 'CHVPSP'], vehicleType: 'VPSP' })))
            .toEqual({ canBorrow: true, blockingReason: null });
    });

    it('CHVL face à un VPSP → VPSP_REQUIRES_CHVPSP', () => {
        expect(getBorrowEligibility(input({ userRoles: ['CHVL'], vehicleType: 'VPSP' })).blockingReason)
            .toBe('VPSP_REQUIRES_CHVPSP');
    });

    it('CHVL face à un VL disponible → autorisé', () => {
        expect(getBorrowEligibility(input({ userRoles: ['CHVL'], vehicleType: 'VL' })))
            .toEqual({ canBorrow: true, blockingReason: null });
    });

    it('CHVL, VL réservé par un tiers → RESERVED_BY_OTHER', () => {
        expect(getBorrowEligibility(input({ isReservedByOther: true })).blockingReason)
            .toBe('RESERVED_BY_OTHER');
    });

    it('CHVL, VL, papiers bloqués → LICENSE_BLOCKED', () => {
        expect(getBorrowEligibility(input({ licenseBlocked: true })).blockingReason)
            .toBe('LICENSE_BLOCKED');
    });

    it('statut IN_USE ou MAINTENANCE → NOT_AVAILABLE', () => {
        expect(getBorrowEligibility(input({ vehicleStatus: 'IN_USE' })).blockingReason).toBe('NOT_AVAILABLE');
        expect(getBorrowEligibility(input({ vehicleStatus: 'MAINTENANCE' })).blockingReason).toBe('NOT_AVAILABLE');
    });

    it('vue DT → DT_VIEW, même pour un ADMIN', () => {
        expect(getBorrowEligibility(input({ userRoles: ['ADMIN'], isDtView: true })))
            .toEqual({ canBorrow: false, blockingReason: 'DT_VIEW' });
    });
});

describe('deux ordres d\'évaluation distincts (rôle-first vs licence-first)', () => {
    const mixed = input({
        userRoles: ['CI/RPAPS'],
        isReservedByOther: true,
        licenseBlocked: true,
    });

    it('getBorrowEligibility est rôle-first', () => {
        expect(getBorrowEligibility(mixed).blockingReason).toBe('ROLE_NOT_ALLOWED');
    });

    it('getBorrowDenialTitle est licence-first', () => {
        expect(getBorrowDenialTitle(mixed)).toBe("Vos papiers n'ont pas été validés — emprunt bloqué.");
    });
});

describe('getBorrowDenialTitle', () => {
    it('retourne la chaîne vide quand l\'emprunt est autorisé', () => {
        expect(getBorrowDenialTitle(input())).toBe('');
    });

    it('chaîne licence', () => {
        expect(getBorrowDenialTitle(input({ licenseBlocked: true })))
            .toBe("Vos papiers n'ont pas été validés — emprunt bloqué.");
    });

    it('chaîne réservation', () => {
        expect(getBorrowDenialTitle(input({ isReservedByOther: true })))
            .toBe("Ce véhicule est actuellement réservé par quelqu'un d'autre.");
    });

    it('chaîne générique de droits', () => {
        expect(getBorrowDenialTitle(input({ userRoles: ['CHVL'], vehicleType: 'VPSP' })))
            .toBe("Vous n'avez pas les droits pour emprunter ce véhicule");
    });

    it('un ADMIN ne voit jamais les chaînes licence/réservation', () => {
        expect(getBorrowDenialTitle(input({
            userRoles: ['ADMIN'],
            vehicleStatus: 'IN_USE',
            licenseBlocked: true,
            isReservedByOther: true,
        }))).toBe("Vous n'avez pas les droits pour emprunter ce véhicule");
    });
});

describe('getBorrowCtaState', () => {
    const base = { loading: false, eligibleCount: 0, licenseBlocked: false, userRoles: ['CHVL'], denialReasons: [] };

    it('LOADING court-circuite tout', () => {
        expect(getBorrowCtaState({ ...base, loading: true, licenseBlocked: true, eligibleCount: 3 }))
            .toEqual({ state: 'LOADING', reason: null, message: '' });
    });

    it('LICENSE_BLOCKED pour un non-ADMIN', () => {
        expect(getBorrowCtaState({ ...base, licenseBlocked: true, eligibleCount: 2 })).toEqual({
            state: 'LICENSE_BLOCKED',
            reason: 'LICENSE_BLOCKED',
            message: "Vos papiers n'ont pas été validés dans les délais — emprunt impossible. Présentez vos papiers à votre DLUS/DLAS.",
        });
    });

    it('un ADMIN n\'est pas bloqué par ses papiers', () => {
        expect(getBorrowCtaState({ ...base, userRoles: ['ADMIN'], licenseBlocked: true, eligibleCount: 2 }).state)
            .toBe('NOMINAL');
    });

    it('NOMINAL dès qu\'un véhicule est éligible', () => {
        expect(getBorrowCtaState({ ...base, eligibleCount: 1 }))
            .toEqual({ state: 'NOMINAL', reason: null, message: '' });
    });

    it('NONE_ELIGIBLE sans aucune raison → message flotte vide', () => {
        expect(getBorrowCtaState({ ...base, denialReasons: [] })).toEqual({
            state: 'NONE_ELIGIBLE',
            reason: null,
            message: "Aucun véhicule n'est rattaché à votre Unité Locale.",
        });
    });

    it('priorité d\'agrégation : ROLE_NOT_ALLOWED devant RESERVED_BY_OTHER et NOT_AVAILABLE', () => {
        const res = getBorrowCtaState({
            ...base,
            denialReasons: ['RESERVED_BY_OTHER', 'NOT_AVAILABLE', 'ROLE_NOT_ALLOWED'],
        });
        expect(res.reason).toBe('ROLE_NOT_ALLOWED');
        expect(res.message).toBe("Votre rôle ne vous permet pas d'emprunter de véhicule.");
    });

    it('priorité d\'agrégation : VPSP_REQUIRES_CHVPSP devant NOT_AVAILABLE', () => {
        const res = getBorrowCtaState({
            ...base,
            denialReasons: ['NOT_AVAILABLE', 'VPSP_REQUIRES_CHVPSP'],
        });
        expect(res.reason).toBe('VPSP_REQUIRES_CHVPSP');
        expect(res.message).toBe('Les seuls véhicules disponibles sont des VPSP, réservés aux chauffeurs VPSP.');
    });

    it('priorité d\'agrégation : VPSP_REQUIRES_CHVPSP devant VL_REQUIRES_CHVL', () => {
        const res = getBorrowCtaState({
            ...base,
            denialReasons: ['VL_REQUIRES_CHVL', 'VPSP_REQUIRES_CHVPSP'],
        });
        expect(res.reason).toBe('VPSP_REQUIRES_CHVPSP');
    });

    it('VL_REQUIRES_CHVL : libellé dédié, devant NOT_AVAILABLE', () => {
        const res = getBorrowCtaState({
            ...base,
            denialReasons: ['NOT_AVAILABLE', 'VL_REQUIRES_CHVL'],
        });
        expect(res.reason).toBe('VL_REQUIRES_CHVL');
        expect(res.message).toBe('Les seuls véhicules disponibles sont des véhicules légers, réservés aux chauffeurs VL.');
    });

    it('RESERVED_BY_OTHER est la raison de dernier recours', () => {
        const res = getBorrowCtaState({ ...base, denialReasons: ['RESERVED_BY_OTHER'] });
        expect(res.message).toBe("Tous les véhicules disponibles sont réservés par quelqu'un d'autre.");
    });

    it('NOT_AVAILABLE seul', () => {
        const res = getBorrowCtaState({ ...base, denialReasons: ['NOT_AVAILABLE'] });
        expect(res.message).toBe("Aucun véhicule n'est disponible pour le moment.");
    });

    it('le message n\'est jamais vide en NONE_ELIGIBLE', () => {
        expect(BORROW_CTA_MESSAGES.EMPTY_FLEET).toBe("Aucun véhicule n'est rattaché à votre Unité Locale.");

        for (const denial of ['NOT_AVAILABLE', 'ROLE_NOT_ALLOWED', 'VPSP_REQUIRES_CHVPSP', 'VL_REQUIRES_CHVL', 'RESERVED_BY_OTHER'] as const) {
            const res = getBorrowCtaState({ ...base, denialReasons: [denial] });
            expect(res.state).toBe('NONE_ELIGIBLE');
            expect(res.reason).toBe(denial);
            expect(res.message).toBe(BORROW_CTA_MESSAGES[denial]);
        }

        // `DT_VIEW` n'est pas agrégeable (la section retourne `null` en vue DT) :
        // il retombe sur le libellé de flotte vide, pas sur un libellé propre.
        const dtView = getBorrowCtaState({ ...base, denialReasons: ['DT_VIEW'] });
        expect(dtView.state).toBe('NONE_ELIGIBLE');
        expect(dtView.reason).toBeNull();
        expect(dtView.message).toBe(BORROW_CTA_MESSAGES.EMPTY_FLEET);
    });
});
